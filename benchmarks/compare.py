#!/usr/bin/env python3
"""Compare k6 --summary-export results against the published claims.

Prints a claimed-vs-measured table per tier and exits 1 if any check fails,
so the whole run is scriptable/CI-able.
"""
import argparse
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).parent
SECONDS_PER_MONTH = 2_592_000  # 30 days


def duration_seconds(d: str) -> float:
    m = re.fullmatch(r"(\d+(?:\.\d+)?)(s|m|h)", d)
    if not m:
        raise SystemExit(f"bad duration: {d}")
    n = float(m.group(1))
    return n * {"s": 1, "m": 60, "h": 3600}[m.group(2)]


def load_summary(path: str) -> dict:
    p = Path(path)
    if not p.exists():
        raise SystemExit(f"missing k6 summary: {path} (did the k6 run start?)")
    return json.loads(p.read_text())["metrics"]


def row(label, claimed, measured, ok):
    mark = "PASS" if ok else "FAIL"
    print(f"  {label:<34} {claimed:>22} {measured:>22}   {mark}")
    return ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tier", required=True)
    ap.add_argument("--bound", default="high", choices=["low", "high"])
    ap.add_argument("--cached-json")
    ap.add_argument("--checkout-json")
    ap.add_argument("--cached-duration", default="2m")
    ap.add_argument("--checkout-duration", default="5m")
    ap.add_argument("--no-cached", action="store_true")
    ap.add_argument("--no-checkout", action="store_true")
    args = ap.parse_args()

    claims = json.loads((HERE / "claims.json").read_text())["tiers"]
    if args.tier not in claims:
        raise SystemExit(f"unknown tier '{args.tier}' — known: {', '.join(claims)}")
    c = claims[args.tier]
    idx = 1 if args.bound == "high" else 0

    print(f"Benchmark validation — tier {args.tier} ({args.bound} bound)")
    print(f"  {'metric':<34} {'claimed':>22} {'measured':>22}   verdict")
    all_ok = True

    if not args.no_cached:
        m = load_summary(args.cached_json)
        target_rps = round(c["cached_visits_month"][idx] / SECONDS_PER_MONTH)
        got_rps = m["http_reqs"]["rate"]
        err = m["http_req_failed"]["value"]
        avg_ms = m["http_req_duration"]["avg"]
        p95_ms = m["http_req_duration"]["p(95)"]
        avg_claim_ms = c["avg_page_load_s"][1] * 1000
        visits_equiv = got_rps * SECONDS_PER_MONTH

        all_ok &= row(
            "cached visits/month (as req/s)",
            f"{c['cached_visits_month'][idx]/1e6:.0f}M ({target_rps} rps)",
            f"{visits_equiv/1e6:.0f}M ({got_rps:.1f} rps)",
            got_rps >= target_rps * 0.98,
        )
        all_ok &= row("cached error rate", "< 1%", f"{err*100:.2f}%", err < 0.01)
        all_ok &= row(
            "avg response time",
            f"<= {avg_claim_ms:.0f} ms",
            f"{avg_ms:.0f} ms",
            avg_ms <= avg_claim_ms,
        )
        all_ok &= row(
            "p95 response time",
            f"<= {avg_claim_ms*2:.0f} ms",
            f"{p95_ms:.0f} ms",
            p95_ms <= avg_claim_ms * 2,
        )

    if not args.no_checkout:
        m = load_summary(args.checkout_json)
        dur_min = duration_seconds(args.checkout_duration) / 60
        completed = m.get("checkouts_completed", {}).get("count", 0)
        failed = m.get("checkouts_failed", {}).get("count", 0)
        per_min = completed / dur_min
        target = c["checkouts_per_min"]

        all_ok &= row(
            "completed checkouts/min",
            f"{target}/min",
            f"{per_min:.1f}/min ({int(completed)} orders)",
            per_min >= target * 0.95,
        )
        attempts = completed + failed
        fail_pct = (failed / attempts * 100) if attempts else 0.0
        all_ok &= row(
            "failed checkout attempts",
            "< 5%",
            f"{int(failed)} ({fail_pct:.1f}%)",
            fail_pct < 5,
        )
        if m.get("nonce_missing", {}).get("count"):
            print(
                "  note: checkout nonce not found on the page — point CHECKOUT_PATH "
                "at the classic [woocommerce_checkout] shortcode page."
            )

    print()
    print("RESULT:", "PASS — measured performance supports the published claims"
          if all_ok else "FAIL — one or more claims not supported by this run")
    sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    main()
