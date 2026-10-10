"""Terminal runner for quick testing:  python cli.py samples/scam_impersonation.txt [--budget 10]"""

from __future__ import annotations

import argparse
import json

from dotenv import load_dotenv

load_dotenv()

from parakh.pipeline import investigate  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Investigate a job or internship offer.")
    parser.add_argument("offer_file")
    parser.add_argument("sender", nargs="?", default="", help="sender email, if not in the message")
    parser.add_argument("--budget", type=int, default=12, help="max live SerpApi searches")
    args = parser.parse_args()
    text = open(args.offer_file, encoding="utf-8").read()
    for ev in investigate(text, args.sender, budget=args.budget):
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
