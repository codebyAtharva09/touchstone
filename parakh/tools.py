"""Tools the agents can call.

SerpApi-powered (via serpapi-search-tools, SerpApi's official agent package):
  web_search     Google           official site, knowledge graph, fraud warnings, complaints
  news_search    Google News      fraud / scam / arrest reports about the company
  maps_search    Google Maps      "ghost office" check on the stated address
  videos_search  YouTube          scam-exposure videos

SerpApi-powered (custom tool, direct engine call):
  google_jobs_search  Google Jobs  is this role actually advertised publicly?

Deterministic (no API, no LLM):
  compare_domains    sender email domain vs official website domain
  scan_money_requests (used by the pipeline, not the agent) fee/deposit red flags
"""

from __future__ import annotations

import re
from difflib import SequenceMatcher
from urllib.parse import urlparse

from langchain_core.tools import tool
from serpapi_search_tools import (
    WebSearchEngine,
    maps_search,
    news_search,
    videos_search,
    web_search,
)

from .serp_client import CachedBudgetClient

INDIA = {"hl": "en", "gl": "in"}

FREE_EMAIL_PROVIDERS = {
    "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.in", "outlook.com", "hotmail.com",
    "live.com", "rediffmail.com", "protonmail.com", "proton.me", "icloud.com", "aol.com",
    "zoho.com", "yandex.com", "mail.com", "gmx.com",
}
MULTI_PART_SUFFIXES = ("co.in", "org.in", "net.in", "gov.in", "ac.in", "co.uk", "com.au")


def registrable_domain(host: str) -> str:
    host = host.lower().strip().strip(".")
    if host.startswith("www."):
        host = host[4:]
    parts = host.split(".")
    if len(parts) >= 3 and ".".join(parts[-2:]) in MULTI_PART_SUFFIXES:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:]) if len(parts) >= 2 else host


def domain_report(sender_email: str, official_website: str) -> dict:
    """Pure function so it can be unit-tested and reused by the pipeline."""
    sender_host = sender_email.split("@")[-1].strip().lower() if "@" in sender_email else ""
    url = official_website.strip()
    if url and "://" not in url:
        url = "https://" + url
    official_host = (urlparse(url).hostname or "").lower() if url else ""

    s_reg = registrable_domain(sender_host) if sender_host else ""
    o_reg = registrable_domain(official_host) if official_host else ""

    if not s_reg:
        status, detail = "UNKNOWN", "No sender email address to check."
    elif s_reg in FREE_EMAIL_PROVIDERS:
        status = "FREE_EMAIL_PROVIDER"
        detail = (f"Offer was sent from a free mailbox ({s_reg}). Established companies send "
                  "offers from their own domain.")
    elif not o_reg:
        status, detail = "UNKNOWN", f"Sender domain is {s_reg}; official website not known yet."
    elif s_reg == o_reg:
        status, detail = "MATCH", f"Sender domain {s_reg} matches the official website."
    else:
        s_name, o_name = s_reg.split(".")[0], o_reg.split(".")[0]
        sim = SequenceMatcher(None, s_name, o_name).ratio()
        if o_name in s_name or sim >= 0.75:
            status = "LOOKALIKE"
            detail = (f"Sender domain {s_reg} imitates the official {o_reg} "
                      f"(similarity {sim:.2f}) but is NOT the same domain.")
        else:
            status = "DIFFERENT"
            detail = f"Sender domain {s_reg} is unrelated to the official domain {o_reg}."
    return {"status": status, "sender_domain": s_reg, "official_domain": o_reg, "detail": detail}


MONEY_PATTERNS = [
    r"registration (fee|charge|amount)",
    r"(security|refundable|caution|training|laptop|kit|onboarding|processing|verification)\s+(deposit|fee|charge|amount)",
    r"\bpay(ment)?\b.{0,40}(₹|rs\.?|inr)\s?\d",
    r"(₹|rs\.?|inr)\s?\d[\d,]*.{0,40}\b(pay|deposit|fee)\b",
    r"\bupi\b|@ok(axis|hdfcbank|icici|sbi)|@ybl|@paytm|@ibl",
    r"(gift card|google play card|crypto|usdt)",
]
PRESSURE_PATTERNS = [
    r"within (24|48|12|2|3) ?(hours|hrs)", r"limited seats", r"seats are limited", r"urgent(ly)?",
    r"today itself", r"last date (is )?today", r"immediate(ly)? (joining|confirm)",
]


def scan_text_flags(text: str) -> dict:
    low = text.lower()
    money = sorted({m.group(0) for p in MONEY_PATTERNS for m in re.finditer(p, low)})
    pressure = sorted({m.group(0) for p in PRESSURE_PATTERNS for m in re.finditer(p, low)})
    return {"money_requested": money, "pressure_tactics": pressure}


def build_tools(client: CachedBudgetClient) -> list:
    """All tools share one client, so cache + budget + log cover every search."""
    common = {"provider": "langchain", "client": client}

    web = web_search(
        **common,
        allowed_engines=[WebSearchEngine.GOOGLE],
        default_engine=WebSearchEngine.GOOGLE,
        default_params=INDIA,
        result_limit=5,
    )
    news = news_search(**common, default_params=INDIA, result_limit=5)
    maps = maps_search(**common, default_params={"hl": "en"}, result_limit=5)
    videos = videos_search(**common, default_params={"hl": "en", "gl": "in"}, result_limit=4)

    @tool
    def google_jobs_search(query: str) -> str:
        """Check whether a job or internship is publicly advertised on Google Jobs in India.
        Input: role and company, e.g. "Data Analyst Intern Infosys".
        Returns the matching listings and the site each was posted on. Genuine roles at
        large companies usually appear here or on the official careers site."""
        try:
            data = client.search({"engine": "google_jobs", "q": query, "location": "India", **INDIA})
        except Exception as exc:  # defensive: never crash the agent
            return f"Google Jobs search failed: {type(exc).__name__}"
        if not isinstance(data, dict):
            return str(data)[:1500]
        if data.get("parakh_note"):
            return f"No search data: {data['parakh_note']}"
        jobs = data.get("jobs_results") or []
        if not jobs:
            return "No public Google Jobs listings found for this role and company."
        lines = []
        for j in jobs[:6]:
            link = ""
            opts = j.get("apply_options") or []
            if opts:
                link = opts[0].get("link", "")
            lines.append(f"- {j.get('title')} | {j.get('company_name')} | {j.get('location')} | "
                         f"{j.get('via', '')} | {link}")
        return "Google Jobs listings:\n" + "\n".join(lines)

    @tool
    def compare_domains(sender_email: str, official_website: str) -> str:
        """Compare the domain of the email that sent the offer with the company's official
        website domain (which you found with web_search). Detects free mailboxes (gmail etc.)
        and lookalike domains such as infosys-careers.in vs infosys.com."""
        r = domain_report(sender_email, official_website)
        return f"{r['status']}: {r['detail']}"

    return [web, news, maps, videos, google_jobs_search, compare_domains]


def build_skeptic_tools(client: CachedBudgetClient) -> list:
    """The Skeptic gets a smaller toolbox: it hunts for proof of legitimacy."""
    common = {"provider": "langchain", "client": client}
    web = web_search(
        **common,
        allowed_engines=[WebSearchEngine.GOOGLE],
        default_engine=WebSearchEngine.GOOGLE,
        default_params=INDIA,
        result_limit=5,
    )
    news = news_search(**common, default_params=INDIA, result_limit=5)
    maps = maps_search(**common, default_params={"hl": "en"}, result_limit=5)
    return [web, news, maps]
