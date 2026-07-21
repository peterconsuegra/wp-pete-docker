#!/usr/bin/env python3
"""Turn a breaking-point sweep into a table and name the knee.

Usage: analyze-breaking-point.py <results_dir> [step_duration]

A step is "healthy" when it delivers >=95% of the requested orders, keeps
failures under 1%, and holds p95 latency under 2s. The ceiling is the highest
healthy rate; the breaking point is the first unhealthy one.
"""
import json
import re
import sys
from pathlib import Path

HEALTHY_DELIVERY = 0.95
HEALTHY_FAIL_PCT = 1.0
HEALTHY_P95_MS = 2000


def dur_min(d):
    m = re.fullmatch(r"(\d+(?:\.\d+)?)(s|m|h)", d)
    if not m:
        return 2.0
    n = float(m.group(1))
    return n / 60 if m.group(2) == "s" else n * 60 if m.group(2) == "h" else n


def main():
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "results/breaking-point")
    minutes = dur_min(sys.argv[2] if len(sys.argv) > 2 else "2m")

    rows = []
    for f in sorted(out.glob("rate-*.json"), key=lambda p: int(re.search(r"\d+", p.name).group())):
        rate = int(re.search(r"\d+", f.name).group())
        try:
            m = json.loads(f.read_text())["metrics"]
        except Exception as e:
            print(f"  (skipping {f.name}: {e})")
            continue
        done = m.get("checkouts_completed", {}).get("count", 0)
        failed = m.get("checkouts_failed", {}).get("count", 0)
        attempts = done + failed
        achieved = done / minutes
        delivery = achieved / rate if rate else 0
        fail_pct = (failed / attempts * 100) if attempts else 0.0
        d = m.get("http_req_duration", {})
        healthy = (
            delivery >= HEALTHY_DELIVERY
            and fail_pct < HEALTHY_FAIL_PCT
            and d.get("p(95)", 0) < HEALTHY_P95_MS
        )
        srv = (out / f"server-{rate}.txt")
        rows.append(
            dict(rate=rate, done=int(done), achieved=achieved, delivery=delivery,
                 fail_pct=fail_pct, avg=d.get("avg", 0), p95=d.get("p(95)", 0),
                 healthy=healthy, server=srv.read_text().strip() if srv.exists() else "")
        )

    if not rows:
        sys.exit("no rate-*.json summaries found")

    print("Checkout breaking-point sweep")
    print(f"  {'target':>8} {'achieved':>10} {'delivered':>10} {'fail%':>7} {'avg ms':>8} {'p95 ms':>8}   state")
    for r in rows:
        print(f"  {r['rate']:>5}/min {r['achieved']:>9.1f} {r['delivery']*100:>9.0f}% "
              f"{r['fail_pct']:>6.1f} {r['avg']:>8.0f} {r['p95']:>8.0f}   "
              f"{'ok' if r['healthy'] else 'DEGRADED'}")

    healthy = [r for r in rows if r["healthy"]]
    broken = [r for r in rows if not r["healthy"]]
    print()
    if healthy:
        print(f"Highest healthy rate ....: {max(r['rate'] for r in healthy)} checkouts/min")
    else:
        print("No step met the healthy criteria — the ceiling is below the lowest rate tested.")
    if broken:
        first = min(r["rate"] for r in broken)
        print(f"Breaking point starts at : {first} checkouts/min")
        if healthy:
            hi = max(r["rate"] for r in healthy)
            print(f"True ceiling lies between {hi} and {first} — bisect to narrow it.")
    else:
        print("Nothing broke — the real ceiling is above the highest rate tested.")

    print("\nServer during each step:")
    for r in rows:
        if r["server"]:
            print(f"  {r['rate']}/min: " + " | ".join(r["server"].split("\n")))


if __name__ == "__main__":
    main()
