# Parakh 🕵️ — a multi-agent investigator for fake job & internship offers

**SerpApi India Hackathon 2026 · Track: AI Agents**

> **Parakh** (परख) is Hindi for testing whether something is genuine, the way a jeweller tests gold.

- **Live app:** <DEPLOYED URL>
- **Demo video:** <YOUTUBE LINK>

## The problem
Students in India receive fake internship and job offers that impersonate real companies
and ask for a "refundable" registration or laptop deposit over UPI, with a 24-hour deadline.
Existing checkers ask an LLM whether a message *sounds* like a scam. Nobody checks the claims,
so a polished scam passes and a clumsy but genuine startup offer gets flagged.

## The insight
Every offer makes checkable claims: who is hiring, for which role, from which office,
through which email domain. A genuine offer holds up against **live search data**. A fake one does not.
Parakh cross-examines each claim, and an adversarial **Skeptic agent** searches for proof the offer
is genuine, so real employers are not falsely accused.

## What the user gets
1. A live trace of every agent step and every SerpApi search as it happens.
2. A verdict: **LIKELY SCAM / SUSPICIOUS / NOT ENOUGH EVIDENCE / LIKELY LEGIT**, with a 0–100 risk score.
3. An **evidence ledger**: each claim marked ✅ verified, ❌ contradicted or ❔ unverified, with source links.
4. Red flags and signs of legitimacy, side by side.
5. A ready-to-send **verification email** to the company's *official* contact, which the agents found through search.
6. Next steps, including cybercrime.gov.in and the 1930 helpline if money was requested.

## How it works
```mermaid
flowchart TD
    A[Offer text + sender email] --> B[1. Claim Extractor<br/>LLM · structured output]
    A --> C[Deterministic text checks<br/>fee / UPI / deadline regex]
    B --> D[2. Investigator agent<br/>tool-calling]
    C --> D
    D -->|serpapi-search-tools| W[web_search · Google]
    D -->|serpapi-search-tools| N[news_search · Google News]
    D -->|serpapi-search-tools| M[maps_search · Google Maps]
    D -->|serpapi-search-tools| Y[videos_search · YouTube]
    D -->|custom tool| J[google_jobs_search · Google Jobs]
    D -->|deterministic tool| DC[compare_domains]
    D --> E[Domain check vs official site found]
    E --> F[3. Skeptic agent<br/>hunts for proof of legitimacy]
    F -->|serpapi-search-tools| W2[web · news · maps]
    F --> G[4. Judge<br/>structured Verdict]
    G --> H[Guardrails<br/>money + non-official domain ≠ LEGIT]
    H --> I[Verdict · Evidence ledger · Verification email · Next steps]
```

| Agent | What it does |
|---|---|
| Claim Extractor | Turns a messy WhatsApp or email message into structured, checkable claims |
| Investigator | Plans and runs live searches across 5 SerpApi engines |
| Skeptic | Searches for evidence of legitimacy and challenges each red flag |
| Judge | Produces the verdict, a claim-by-claim evidence ledger and a verification email |

## How SerpApi is used (and why it matters)
| Engine | Via | Why Parakh needs it |
|---|---|---|
| Google Search | `serpapi-search-tools` `web_search` | Find the official website and careers page, plus the company's own fake-offer warnings |
| Google News | `news_search` | Police and media reports of scams using this company's name |
| Google Maps | `maps_search` | "Ghost office" check: is there really an office at the stated address? |
| YouTube | `videos_search` | Scam-exposure videos naming the company or recruiter |
| Google Jobs | custom tool (direct engine call) | Is this role publicly advertised at all? |

All searches go through `CachedBudgetClient`, plugged into `serpapi-search-tools` through its
`client=` hook. It provides:
- a disk cache, so re-runs cost 0 credits
- a per-investigation search budget
- a search log shown in the UI
- graceful failure handling, so a failed search becomes a note for the agent instead of a crash

Without SerpApi, Parakh has no evidence, only guesses.

## Run locally
Requires Python 3.10+.
```bash
git clone <REPO URL> && cd parakh
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env               # add SERPAPI_API_KEY and a free GOOGLE_API_KEY (or GROQ_API_KEY)
streamlit run app.py
```
CLI: `python cli.py samples/scam_impersonation.txt`

## Deploy (Streamlit Community Cloud)
1. Fork or push this repo to GitHub.
2. On [share.streamlit.io](https://share.streamlit.io), create an app from the repo with main file `app.py` and Python 3.12.
3. Under **Advanced settings → Secrets**, paste:
   ```toml
   SERPAPI_API_KEY = "..."
   LLM_PROVIDER = "gemini"
   GOOGLE_API_KEY = "..."
   GEMINI_MODEL = "gemini-3.8-flash"
   PARAKH_PUBLIC = "1"          # caps credits: forced cache + per-visit limit
   PARAKH_MAX_BUDGET = "10"
   PARAKH_SESSION_LIMIT = "3"
   ```

## Responsible design
- The verdict cites sources. Every claim check links to evidence.
- The Skeptic agent and the NOT ENOUGH EVIDENCE verdict reduce false accusations against small companies.
- Deterministic guardrails: money requested plus a non-official domain can never be rated "legit".
- Search results are treated as untrusted data (prompt-injection defence).
- Both files in `samples/` are synthetic and labelled as such.
- Public mode protects the shared search quota (budget cap, forced cache, per-visit limit).

## Limitations
- Very new or tiny companies may have little online footprint, which leads to NOT ENOUGH EVIDENCE.
- Free LLM tiers can rate-limit. Switch `LLM_PROVIDER` between `gemini` and `groq` in `.env`.

## Roadmap
- Hindi and Marathi output
- Google Lens reverse-image check on recruiter profile photos
- Supplier verification for MSMEs
- A browser extension for Gmail and WhatsApp Web

## AI tools used
- Claude: idea refinement, architecture, code generation and documentation
- Gemini / Groq models run inside the product
