"""Terminal runner for quick testing:  python cli.py samples/scam_impersonation.txt"""

from __future__ import annotations

import json
import sys

from dotenv import load_dotenv

load_dotenv()

from parakh.pipeline import investigate  # noqa: E402


def main() -> None:
    if len(sys.argv) < 2:
        print("usage: python cli.py <offer.txt> [sender@email]")
        sys.exit(1)
    text = open(sys.argv[1], encoding="utf-8").read()
    sender = sys.argv[2] if len(sys.argv) > 2 else ""
    for ev in investigate(text, sender):
        t = ev["type"]
        if t == "phase":
            print(f"\n=== {ev['name']} ===")
        elif t == "tool_call":
            print(f"  [{ev['agent']}] -> {ev['tool']}({ev['args']})")
        elif t == "tool_result":
            print(f"      <- {ev['preview'][:120].replace(chr(10), ' ')}")
        elif t in {"warning"}:
            print(f"  ! {ev['message']}")
        elif t == "domain":
            print(f"  domain: {ev['data']['status']} - {ev['data']['detail']}")
        elif t == "verdict":
            print("\n=== VERDICT ===")
            print(json.dumps(ev["data"], indent=2, ensure_ascii=False))
        elif t == "stats":
            s = ev["data"]
            print(f"\nlive searches: {s['live_searches']}/{s['budget']}  cache hits: {s['cache_hits']}")


if __name__ == "__main__":
    main()
