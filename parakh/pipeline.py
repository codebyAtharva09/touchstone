"""Parakh multi-agent pipeline.

    Offer text
       │
       ▼
  1. Claim Extractor   (LLM, structured output, no search)
       │
  2. Deterministic checks (fee / pressure regex)         ← no LLM, no API
       │
  3. Investigator agent  (tool-calling: web, news, maps, YouTube, Google Jobs, domain compare)
       │
  4. Domain check vs official site the Investigator found ← deterministic
       │
  5. Skeptic agent       (tool-calling: hunts for proof the offer is LEGIT)
       │
  6. Verdict agent       (structured output) + guardrails
       │
       ▼
  Verdict, claim-by-claim evidence ledger, verification email, next steps

`investigate()` is a generator that yields UI events, so the web server (or the
CLI) can show every tool call live.
"""

from __future__ import annotations

import json
import re
import time
from typing import Any, Iterator

from langchain.agents import create_agent

from . import prompts
from .llm import get_llm
from .schemas import ClaimCheck, ExtractedClaims, Verdict
from .serp_client import CachedBudgetClient
from .tools import build_skeptic_tools, build_tools, domain_report, scan_text_flags

Event = dict[str, Any]


def _text(content: Any) -> str:
    """LLM message content can be a str or a list of parts (Gemini)."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        out = []
        for part in content:
            if isinstance(part, str):
                out.append(part)
            elif isinstance(part, dict) and part.get("type") == "text":
                out.append(part.get("text", ""))
        return "\n".join(out)
    return str(content or "")


def _run_agent(agent, user_msg: str, agent_name: str, recursion_limit: int,
               sink: dict) -> Iterator[Event]:
    """Stream one tool-calling agent, yielding tool calls/results as UI events.
    The agent's final text lands in sink['text']; raw tool outputs in sink['tool_outputs']."""
    sink.setdefault("tool_outputs", [])
    sink["text"] = ""
    try:
        for chunk in agent.stream(
            {"messages": [{"role": "user", "content": user_msg}]},
            config={"recursion_limit": recursion_limit},
            stream_mode="updates",
        ):
            for _node, update in chunk.items():
                if not isinstance(update, dict):
                    continue
                for msg in update.get("messages") or []:
                    msg_type = getattr(msg, "type", "")
                    tool_calls = getattr(msg, "tool_calls", None) or []
                    if msg_type == "ai" and tool_calls:
                        for tc in tool_calls:
                            yield {"type": "tool_call", "agent": agent_name,
                                   "tool": tc.get("name"), "args": tc.get("args", {})}
                    elif msg_type == "tool":
                        content = _text(msg.content)
                        sink["tool_outputs"].append(f"[{msg.name}] {content[:1500]}")
                        yield {"type": "tool_result", "agent": agent_name,
                               "tool": msg.name, "preview": content[:300]}
                    elif msg_type == "ai":
                        text = _text(msg.content).strip()
                        if text:
                            sink["text"] = text
    except Exception as exc:  # rate limits, recursion limit, provider hiccups
        yield {"type": "warning", "agent": agent_name,
               "message": f"{agent_name} stopped early: {type(exc).__name__}: {str(exc)[:200]}"}
    if not sink["text"]:
        # Fall back to raw tool outputs so the Verdict agent still has evidence.
        sink["text"] = "RAW SEARCH OUTPUTS (agent did not finish):\n" + "\n".join(
            sink["tool_outputs"])[:12000]
    yield {"type": "agent_done", "agent": agent_name, "text": sink["text"]}


def _find_field(text: str, field: str) -> str | None:
    m = re.search(rf"{field}:\s*(\S+)", text)
    if not m:
        return None
    value = m.group(1).strip().strip("<>()[]")
    return None if value.lower() in {"unknown", "none", "n/a"} else value


def _fallback_verdict(claims: ExtractedClaims, flags: dict, domain: dict) -> Verdict:
    red = []
    if flags["money_requested"]:
        red.append("The message asks the candidate to pay money: " + ", ".join(flags["money_requested"]))
    if domain["status"] in {"FREE_EMAIL_PROVIDER", "LOOKALIKE", "DIFFERENT"}:
        red.append(domain["detail"])
    if flags["pressure_tactics"]:
        red.append("Pressure tactics: " + ", ".join(flags["pressure_tactics"]))
    risk = min(100, 30 + 25 * len(red))
    verdict = "LIKELY_SCAM" if len(red) >= 2 else ("SUSPICIOUS" if red else "NOT_ENOUGH_EVIDENCE")
    return Verdict(
        verdict=verdict, risk_score=risk,
        one_line_summary="Verdict built from deterministic checks only (the AI judge was unavailable).",
        claim_checks=[ClaimCheck(claim=c, status="UNVERIFIED", evidence="Not assessed.")
                      for c in claims.checkable_claims],
        red_flags=red, green_flags=[],
        verification_email="Hello, I received an offer that claims to be from your company. "
                           "Could you please confirm whether it is genuine? I have attached it. Thank you.",
        next_steps=["Do not pay any money.", "Verify through the company's official careers page."],
    )


def _apply_guardrails(v: Verdict, flags: dict, domain: dict) -> tuple[Verdict, list[str]]:
    """Deterministic safety net so the LLM can't wave through obvious scams."""
    notes = []
    hard_red = bool(flags["money_requested"]) and domain["status"] in {
        "FREE_EMAIL_PROVIDER", "LOOKALIKE", "DIFFERENT"}
    if hard_red and v.verdict in {"LIKELY_LEGIT", "NOT_ENOUGH_EVIDENCE"}:
        notes.append("Guardrail: money requested + non-official email domain -> raised to SUSPICIOUS.")
        v.verdict = "SUSPICIOUS"
    bands = {"LIKELY_SCAM": (75, 100), "SUSPICIOUS": (45, 74),
             "NOT_ENOUGH_EVIDENCE": (30, 60), "LIKELY_LEGIT": (0, 30)}
    lo, hi = bands[v.verdict]
    v.risk_score = max(lo, min(hi, int(v.risk_score)))
    return v, notes


def investigate(offer_text: str, sender_email: str = "", budget: int = 12,
                use_cache: bool = True) -> Iterator[Event]:
    client = CachedBudgetClient(budget=budget, use_cache=use_cache)
    llm = get_llm()

    # 1 ── Claim extraction ────────────────────────────────────────────────
    yield {"type": "phase", "name": "1/4 Extracting checkable claims"}
    try:
        extractor = llm.with_structured_output(ExtractedClaims)
        claims: ExtractedClaims = extractor.invoke(
            [("system", prompts.EXTRACTOR), ("human", offer_text)])
    except Exception as exc:
        yield {"type": "warning", "agent": "extractor", "message": f"Extractor failed: {exc}"}
        claims = ExtractedClaims(checkable_claims=[offer_text[:200]])
    if sender_email.strip():
        claims.sender_email = sender_email.strip()
    yield {"type": "claims", "data": claims.model_dump()}

    # 2 ── Deterministic text checks ───────────────────────────────────────
    flags = scan_text_flags(offer_text)
    yield {"type": "flags", "data": flags}

    case_file = (
        f"OFFER MESSAGE:\n{offer_text}\n\n"
        f"EXTRACTED CLAIMS:\n{claims.model_dump_json(indent=2)}\n\n"
        f"DETERMINISTIC TEXT FLAGS:\n{json.dumps(flags, ensure_ascii=False)}"
    )

    # 3 ── Investigator ────────────────────────────────────────────────────
    yield {"type": "phase", "name": "2/4 Investigator agent searching live sources"}
    investigator = create_agent(llm, tools=build_tools(client), system_prompt=prompts.INVESTIGATOR)
    inv: dict = {}
    yield from _run_agent(investigator, case_file, "Investigator", recursion_limit=24, sink=inv)

    # 4 ── Domain check against the official site found ───────────────────
    official_site = _find_field(inv["text"], "OFFICIAL_WEBSITE") or claims.website_mentioned or ""
    domain = domain_report(claims.sender_email or "", official_site)
    yield {"type": "domain", "data": domain}

    # 5 ── Skeptic ─────────────────────────────────────────────────────────
    yield {"type": "phase", "name": "3/4 Skeptic agent looking for proof the offer is genuine"}
    skeptic = create_agent(llm, tools=build_skeptic_tools(client), system_prompt=prompts.SKEPTIC)
    sk: dict = {}
    skeptic_msg = f"{case_file}\n\nINVESTIGATOR FINDINGS:\n{inv['text']}"
    yield from _run_agent(skeptic, skeptic_msg, "Skeptic", recursion_limit=12, sink=sk)

    # 6 ── Verdict ─────────────────────────────────────────────────────────
    yield {"type": "phase", "name": "4/4 Judge weighing the evidence"}
    judge_input = (
        f"{case_file}\n\nDOMAIN CHECK:\n{json.dumps(domain)}\n\n"
        f"INVESTIGATOR FINDINGS:\n{inv['text']}\n\nSKEPTIC COUNTER-FINDINGS:\n{sk['text']}"
    )
    judge = llm.with_structured_output(Verdict)
    verdict = None
    for attempt in range(3):
        try:
            verdict = judge.invoke([("system", prompts.VERDICT), ("human", judge_input)])
            break
        except Exception as exc:
            rate_limited = "429" in str(exc) or "RESOURCE_EXHAUSTED" in str(exc) or "rate" in str(exc).lower()
            if rate_limited and attempt < 2:
                yield {"type": "warning", "agent": "judge",
                       "message": "LLM rate limit hit, waiting 30s before the Judge retries…"}
                time.sleep(30)
                continue
            yield {"type": "warning", "agent": "judge",
                   "message": f"Judge failed, using rule-based verdict: {str(exc)[:200]}"}
            break
    if verdict is None:
        verdict = _fallback_verdict(claims, flags, domain)

    verdict, notes = _apply_guardrails(verdict, flags, domain)
    for n in notes:
        yield {"type": "warning", "agent": "guardrail", "message": n}

    yield {"type": "verdict", "data": verdict.model_dump()}
    yield {"type": "stats", "data": {
        "live_searches": client.live_calls,
        "cache_hits": client.cache_hits,
        "budget": client.budget,
        "search_log": client.log,
    }}
