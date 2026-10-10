"""Parakh — Streamlit UI.  Run:  streamlit run app.py"""

from __future__ import annotations

import os
import pathlib

import streamlit as st
from dotenv import load_dotenv

load_dotenv()

from parakh.pipeline import investigate  # noqa: E402
from parakh.serp_client import CachedBudgetClient  # noqa: E402

SAMPLES = pathlib.Path(__file__).parent / "samples"

st.set_page_config(page_title="Parakh · Offer Scam Investigator", page_icon="🕵️", layout="wide")

st.markdown(
    """
    <style>
      .verdict {border-radius:14px;padding:18px 22px;margin:8px 0 16px 0;color:#fff}
      .verdict h2 {margin:0;font-size:1.6rem}
      .verdict p {margin:6px 0 0 0;font-size:1.02rem;opacity:.95}
      .LIKELY_SCAM {background:#b42318}
      .SUSPICIOUS {background:#b54708}
      .NOT_ENOUGH_EVIDENCE {background:#475467}
      .LIKELY_LEGIT {background:#067647}
      .trace {font-family:ui-monospace,Menlo,monospace;font-size:.86rem}
    </style>
    """,
    unsafe_allow_html=True,
)

# Public deployments (PARAKH_PUBLIC=1) protect the SerpApi quota: capped budget,
# cache always on, and a per-session investigation limit.
PUBLIC = os.getenv("PARAKH_PUBLIC", "0") == "1"
MAX_BUDGET = int(os.getenv("PARAKH_MAX_BUDGET", "16"))
SESSION_LIMIT = int(os.getenv("PARAKH_SESSION_LIMIT", "3"))
LLM_KEY_SET = bool(os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY") or os.getenv("GROQ_API_KEY"))
SERP_KEY_SET = bool(os.getenv("SERPAPI_API_KEY") or os.getenv("SERPAPI_KEY"))

# ── Sidebar ────────────────────────────────────────────────────────────────
with st.sidebar:
    st.header("Settings")
    budget = st.slider("Live SerpApi searches per investigation", 4, MAX_BUDGET, min(12, MAX_BUDGET))
    use_cache = True if PUBLIC else st.checkbox("Reuse cached searches (saves credits)", value=True)
    if PUBLIC:
        st.caption(f"Public demo: up to {SESSION_LIMIT} investigations per visit. "
                   "Cached searches are reused to save credits.")
    st.caption(f"LLM: {os.getenv('LLM_PROVIDER', 'gemini')}")
    if st.button("Check SerpApi credits left"):
        left = CachedBudgetClient().searches_left()
        st.write(f"Searches left this month: **{left}**" if left is not None else "Could not read account.")
    st.divider()
    st.caption("Search is powered by SerpApi through the serpapi-search-tools package.")


def load_sample(name: str) -> None:
    st.session_state["offer"] = (SAMPLES / name).read_text(encoding="utf-8")


# ── Header & input ─────────────────────────────────────────────────────────
st.title("🕵️ Parakh")
st.markdown("**Paste an internship or job offer. Three AI agents check every claim in it "
            "against live search results before you reply or pay anything.**")

c1, c2 = st.columns(2)
c1.button("Load sample: suspicious offer", on_click=load_sample, args=("scam_impersonation.txt",))
c2.button("Load sample: genuine offer", on_click=load_sample, args=("genuine_offer.txt",))

offer = st.text_area("Offer message", key="offer", height=220,
                     placeholder="Paste the full email / WhatsApp message here…")
sender = st.text_input("Sender email (if not in the message)", placeholder="hr@company.com")

if not (LLM_KEY_SET and SERP_KEY_SET):
    st.error("This deployment is missing API keys. Set SERPAPI_API_KEY and GOOGLE_API_KEY "
             "(or GROQ_API_KEY) in .env or the hosting platform's secrets.")
    st.stop()

runs = st.session_state.setdefault("runs", 0)
limit_hit = PUBLIC and runs >= SESSION_LIMIT
if limit_hit:
    st.info("You've reached the demo limit for this visit. Run Parakh locally for unlimited checks.")

if st.button("Investigate", type="primary", disabled=not offer.strip() or limit_hit):
    st.session_state["runs"] = runs + 1
    verdict = stats = claims = domain = flags = None
    with st.status("Investigating…", expanded=True) as status:
        for ev in investigate(offer, sender, budget=budget, use_cache=use_cache):
            t = ev["type"]
            if t == "phase":
                status.update(label=ev["name"])
                st.markdown(f"**{ev['name']}**")
            elif t == "tool_call":
                args = ", ".join(f"{k}={v!r}" for k, v in ev["args"].items())
                st.markdown(f"<div class='trace'>🔎 {ev['agent']} → <b>{ev['tool']}</b>({args})</div>",
                            unsafe_allow_html=True)
            elif t == "tool_result":
                st.caption(f"↳ {ev['tool']}: {ev['preview'][:160]}…")
            elif t == "warning":
                st.warning(ev["message"])
            elif t == "claims":
                claims = ev["data"]
            elif t == "flags":
                flags = ev["data"]
            elif t == "domain":
                domain = ev["data"]
                st.markdown(f"<div class='trace'>🌐 Domain check: <b>{domain['status']}</b> — "
                            f"{domain['detail']}</div>", unsafe_allow_html=True)
            elif t == "verdict":
                verdict = ev["data"]
            elif t == "stats":
                stats = ev["data"]
        status.update(label="Investigation complete", state="complete", expanded=False)

    if verdict:
        label = verdict["verdict"].replace("_", " ")
        st.markdown(
            f"<div class='verdict {verdict['verdict']}'><h2>{label} · risk {verdict['risk_score']}/100</h2>"
            f"<p>{verdict['one_line_summary']}</p></div>",
            unsafe_allow_html=True,
        )

        m1, m2, m3 = st.columns(3)
        m1.metric("Live SerpApi searches", f"{stats['live_searches']}/{stats['budget']}")
        m2.metric("Cached searches reused", stats["cache_hits"])
        m3.metric("Claims checked", len(verdict["claim_checks"]))

        st.subheader("Evidence ledger")
        icon = {"VERIFIED": "✅", "CONTRADICTED": "❌", "UNVERIFIED": "❔"}
        for c in verdict["claim_checks"]:
            with st.expander(f"{icon[c['status']]} {c['claim']}"):
                st.write(c["evidence"])
                for url in c["sources"]:
                    st.markdown(f"- [{url}]({url})")

        r, g = st.columns(2)
        with r:
            st.subheader("🚩 Red flags")
            for x in verdict["red_flags"] or ["None found"]:
                st.markdown(f"- {x}")
        with g:
            st.subheader("🟢 Signs of legitimacy")
            for x in verdict["green_flags"] or ["None found"]:
                st.markdown(f"- {x}")

        st.subheader("✉️ Ask the real company")
        if verdict.get("official_contact"):
            st.caption(f"Send to the official contact: {verdict['official_contact']}")
        st.code(verdict["verification_email"], language=None)

        st.subheader("Next steps")
        for s in verdict["next_steps"]:
            st.markdown(f"- {s}")

        with st.expander("Every search the agents ran"):
            st.dataframe(stats["search_log"], use_container_width=True)
        with st.expander("Extracted claims & deterministic checks"):
            st.json({"claims": claims, "text_flags": flags, "domain_check": domain})
