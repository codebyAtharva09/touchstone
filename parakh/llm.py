"""Free-tier LLM factory. Switch providers with LLM_PROVIDER in .env."""

from __future__ import annotations

import os


def get_llm(temperature: float = 0.0):
    provider = os.getenv("LLM_PROVIDER", "gemini").lower().strip()
    if provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI

        return ChatGoogleGenerativeAI(
            model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
            google_api_key=os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY"),
            temperature=temperature,
            max_retries=4,
        )
    if provider == "groq":
        from langchain_groq import ChatGroq

        return ChatGroq(
            model=os.getenv("GROQ_MODEL", "openai/gpt-oss-120b"),
            temperature=temperature,
            max_retries=4,
        )
    raise ValueError("LLM_PROVIDER must be 'gemini' or 'groq'")
