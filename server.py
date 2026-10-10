"""Touchstone web server: FastAPI backend + the built React frontend (frontend/dist).

Run locally:   uvicorn server:app --reload       (http://localhost:8000)
Frontend:      cd frontend && npm install && npm run build   (or `npm run dev` for hot reload)

POST /api/investigate streams the pipeline's events as Server-Sent Events, so the
frontend can show every agent step and SerpApi search live.
"""

from __future__ import annotations

import asyncio
import json
import os
import pathlib
import queue
import threading
import time
from collections import defaultdict

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, HTTPException, Request  # noqa: E402
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from touchstone.pipeline import investigate  # noqa: E402
from touchstone.serp_client import CachedBudgetClient  # noqa: E402

ROOT = pathlib.Path(__file__).parent
WEB = ROOT / "frontend" / "dist"
SAMPLES = {"scam": ROOT / "samples" / "scam_impersonation.txt",
           "genuine": ROOT / "samples" / "genuine_offer.txt"}

# Public deployments (TOUCHSTONE_PUBLIC=1) protect the SerpApi quota: capped budget,
# cache always on, and a per-IP daily investigation limit.
PUBLIC = os.getenv("TOUCHSTONE_PUBLIC", "0") == "1"
MAX_BUDGET = int(os.getenv("TOUCHSTONE_MAX_BUDGET", "16"))
DAILY_LIMIT = int(os.getenv("TOUCHSTONE_DAILY_LIMIT", "3"))
_runs: dict[str, list[float]] = defaultdict(list)
_runs_lock = threading.Lock()

app = FastAPI(title="Touchstone", docs_url=None, redoc_url=None)


class InvestigateRequest(BaseModel):
    offer: str = Field(min_length=20, max_length=8000)
    sender: str = Field("", max_length=200)
    budget: int = Field(12, ge=4, le=16)


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "?")


def _take_run(ip: str) -> int | None:
    """Record a run for this IP. Returns runs left today, or None if over the limit."""
    now = time.time()
    with _runs_lock:
        recent = [t for t in _runs[ip] if now - t < 86400]
        if len(recent) >= DAILY_LIMIT:
            _runs[ip] = recent
            return None
        recent.append(now)
        _runs[ip] = recent
        return DAILY_LIMIT - len(recent)


@app.get("/api/config")
def config() -> dict:
    return {
        "public": PUBLIC,
        "max_budget": min(MAX_BUDGET, 16),
        "daily_limit": DAILY_LIMIT if PUBLIC else None,
        "llm": os.getenv("LLM_PROVIDER", "gemini"),
        "ready": bool((os.getenv("SERPAPI_API_KEY") or os.getenv("SERPAPI_KEY"))
                      and (os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
                           or os.getenv("GROQ_API_KEY"))),
    }


@app.get("/api/samples/{name}")
def sample(name: str) -> dict:
    path = SAMPLES.get(name)
    if not path:
        raise HTTPException(404, "Unknown sample")
    return {"text": path.read_text(encoding="utf-8")}


@app.get("/api/credits")
def credits() -> dict:
    return {"searches_left": CachedBudgetClient().searches_left()}


@app.post("/api/investigate")
async def run_investigation(body: InvestigateRequest, request: Request):
    budget = min(body.budget, MAX_BUDGET)
    if PUBLIC and _take_run(_client_ip(request)) is None:
        return JSONResponse(
            {"error": f"Demo limit reached ({DAILY_LIMIT} investigations per day). "
                      "Run Touchstone locally for unlimited checks."}, status_code=429)

    q: queue.Queue = queue.Queue()

    def worker() -> None:
        try:
            for ev in investigate(body.offer, body.sender, budget=budget, use_cache=True):
                q.put(ev)
        except Exception as exc:  # surface any pipeline crash to the UI instead of hanging
            q.put({"type": "error", "message": f"{type(exc).__name__}: {str(exc)[:300]}"})
        finally:
            q.put(None)

    threading.Thread(target=worker, daemon=True).start()

    async def stream():
        while True:
            try:
                ev = await asyncio.to_thread(q.get, True, 10)
            except queue.Empty:
                yield ": keep-alive\n\n"  # stops proxies closing an idle stream during LLM calls
                continue
            if ev is None:
                yield "data: {\"type\": \"done\"}\n\n"
                return
            if ev.get("type") == "agent_done":
                continue  # internal, large, not needed by the UI
            yield f"data: {json.dumps(ev, ensure_ascii=False, default=str)}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/")
def index() -> FileResponse:
    return FileResponse(WEB / "index.html")


app.mount("/", StaticFiles(directory=WEB), name="web")
