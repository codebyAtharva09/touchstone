"""Custom SerpApi client plugged into serpapi-search-tools via `client=`.

Why a custom client?
  1. Disk cache  -> re-running the same investigation costs 0 SerpApi credits.
  2. Search budget -> one investigation can never burn more than N live searches.
  3. Search log  -> the UI shows every engine + query the agents used.
  4. Never raises -> a failed search becomes a readable note for the agent
                     instead of crashing the whole run.

Contract (from the package source): the object needs a synchronous
`search(params)` method. In the package's default Markdown mode, params
contain output="md" and the client must return a *string*. In JSON mode
(and for our own Google Jobs tool) it returns a dict.
"""

from __future__ import annotations

import hashlib
import json
import os
import pathlib
import threading
from typing import Any

import serpapi

CACHE_DIR = pathlib.Path(os.getenv("PARAKH_CACHE_DIR", ".serp_cache"))


class CachedBudgetClient:
    def __init__(self, api_key: str | None = None, budget: int = 12, use_cache: bool = True):
        self.api_key = api_key or os.getenv("SERPAPI_API_KEY") or os.getenv("SERPAPI_KEY")
        self.budget = budget
        self.use_cache = use_cache
        self.live_calls = 0
        self.cache_hits = 0
        self.log: list[dict[str, Any]] = []
        self._lock = threading.Lock()
        self._client: serpapi.Client | None = None
        CACHE_DIR.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------ utils
    @staticmethod
    def _cache_key(params: dict[str, Any]) -> str:
        clean = {k: v for k, v in params.items() if k != "api_key"}
        raw = json.dumps(clean, sort_keys=True, default=str)
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]

    @staticmethod
    def _label(params: dict[str, Any]) -> str:
        return str(params.get("q") or params.get("search_query") or params.get("query") or "")

    def _empty(self, params: dict[str, Any], note: str) -> Any:
        """Readable 'no data' response in whichever format the caller expects."""
        if params.get("output") == "md":
            return f"_No search data: {note}_\n"
        return {"search_metadata": {"status": "Success"}, "parakh_note": note}

    def _record(self, params: dict[str, Any], status: str) -> None:
        self.log.append({"engine": params.get("engine"), "query": self._label(params), "status": status})

    # ----------------------------------------------------------------- public
    def search(self, params: dict[str, Any]) -> Any:
        params = dict(params)
        key = self._cache_key(params)
        is_md = params.get("output") == "md"
        path = CACHE_DIR / f"{key}.{'md' if is_md else 'json'}"

        if self.use_cache and path.exists():
            self.cache_hits += 1
            self._record(params, "cached")
            text = path.read_text(encoding="utf-8")
            return text if is_md else json.loads(text)

        with self._lock:
            if self.live_calls >= self.budget:
                self._record(params, "budget-blocked")
                return self._empty(params, "search budget for this investigation is used up. "
                                           "Stop searching and report what you have.")
            self.live_calls += 1

        if not self.api_key:
            self._record(params, "error")
            return self._empty(params, "SERPAPI_API_KEY is not set.")

        try:
            if self._client is None:
                self._client = serpapi.Client(api_key=self.api_key, timeout=30)
            result = self._client.search(params)
        except Exception as exc:  # network / HTTP errors -> note, never crash
            self._record(params, "error")
            return self._empty(params, f"search failed ({type(exc).__name__}).")

        if isinstance(result, str):
            if not is_md:  # unexpected text for a JSON request
                self._record(params, "error")
                return self._empty(params, "unexpected non-JSON response.")
            if self.use_cache and result.strip():
                path.write_text(result, encoding="utf-8")
            self._record(params, "live")
            return result

        data = result.as_dict() if hasattr(result, "as_dict") else dict(result)
        if data.get("error"):
            # e.g. "Google hasn't returned any results for this query."
            self._record(params, "no-results")
            return self._empty(params, str(data["error"]))
        if is_md:
            # Asked for Markdown but got JSON: hand the agent compact JSON text.
            data_text = json.dumps(data, ensure_ascii=False)[:6000]
            self._record(params, "live")
            return data_text
        if self.use_cache:
            path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        self._record(params, "live")
        return data

    def searches_left(self) -> int | None:
        """Remaining credits on the account (the Account API is free)."""
        if not self.api_key:
            return None
        try:
            info = serpapi.Client(api_key=self.api_key, timeout=15).account()
            return info.get("total_searches_left", info.get("plan_searches_left"))
        except Exception:
            return None
