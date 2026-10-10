"""Free-tier LLM factory. Switch providers with LLM_PROVIDER in .env."""

from __future__ import annotations

import os

from langchain_core.rate_limiters import InMemoryRateLimiter

# Free tiers allow only a few requests per minute. One shared limiter spaces out every
# LLM call (all agents, all concurrent investigations) instead of tripping a 429.
_RPM = float(os.getenv("PARAKH_LLM_RPM", "10"))
RATE_LIMITER = InMemoryRateLimiter(requests_per_second=_RPM / 60, check_every_n_seconds=0.2,
                                   max_bucket_size=2)


def get_llm(temperature: float = 0.0):
    provider = os.getenv("LLM_PROVIDER", "gemini").lower().strip()
    if provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI

        return ChatGoogleGenerativeAI(
            model=os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite"),
            google_api_key=os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY"),
            temperature=temperature,
            max_retries=4,
            rate_limiter=RATE_LIMITER,
        )
    if provider == "groq":
        from langchain_groq import ChatGroq

        return ChatGroq(
            model=os.getenv("GROQ_MODEL", "openai/gpt-oss-120b"),
            temperature=temperature,
            # Free tier allows ~8k tokens/minute; every agent step resends the whole history,
            # so 429s are routine. The SDK waits out Groq's retry-after; give it room to.
            max_retries=int(os.getenv("PARAKH_GROQ_RETRIES", "10")),
            rate_limiter=RATE_LIMITER,
        )
    raise ValueError("LLM_PROVIDER must be 'gemini' or 'groq'")


def structured(llm, schema):
    """Structured output. Groq's default tool-calling mode rejects near-miss outputs
    (e.g. a string where a list is expected), so use its JSON-schema mode instead."""
    if os.getenv("LLM_PROVIDER", "gemini").lower().strip() == "groq":
        return llm.with_structured_output(schema, method="json_schema")
    return llm.with_structured_output(schema)
