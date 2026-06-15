#!/usr/bin/env python3
"""Deterministic test for the N-vote judge aggregation (issue #11).

Exercises the REAL aggregate_votes() from driver-to.py. No LLM calls, no cost.
Run: python test_votes.py   (exit 0 = all pass)
"""
import importlib.util, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("drv", HERE / "driver-to.py")
drv = importlib.util.module_from_spec(spec); spec.loader.exec_module(drv)
agg = drv.aggregate_votes

fails = []
def check(name, cond, detail=""):
    print(f"{'PASS' if cond else 'FAIL'}  {name}  {detail}")
    if not cond:
        fails.append(name)

# N=1 is a no-op: the single vote is returned verbatim.
one = {"dims": {"a": 4, "b": 2}, "failure": "x", "fix_target": "y", "case": "c1"}
r = agg([one])
check("single vote returned verbatim", r is one, f"{r}")

# Per-dimension median across 3 votes.
votes = [
    {"dims": {"a": 2, "b": 5}, "failure": "low", "fix_target": "f1"},
    {"dims": {"a": 3, "b": 5}, "failure": "mid", "fix_target": "f2"},
    {"dims": {"a": 4, "b": 5}, "failure": "hi",  "fix_target": "f3"},
]
r = agg(votes)
check("median of [2,3,4] -> 3", r["dims"]["a"] == 3, f"a={r['dims']['a']}")
check("median of [5,5,5] -> 5", r["dims"]["b"] == 5, f"b={r['dims']['b']}")

# A single noisy-outlier vote is ignored by the median (the whole point).
votes = [
    {"dims": {"a": 5}, "failure": "good"},
    {"dims": {"a": 5}, "failure": "good"},
    {"dims": {"a": 0}, "failure": "outlier"},  # one judge wildly low
]
r = agg(votes)
check("outlier vote ignored by median (5,5,0 -> 5)", r["dims"]["a"] == 5,
      f"a={r['dims']['a']}")

# failure/fix_target come from the most CENTRAL vote (closest to merged scores).
votes = [
    {"dims": {"a": 2}, "failure": "from-low", "fix_target": "fl"},
    {"dims": {"a": 3}, "failure": "from-mid", "fix_target": "fm"},
    {"dims": {"a": 4}, "failure": "from-hi",  "fix_target": "fh"},
]
r = agg(votes)
check("failure text from the central vote (median 3 -> 'from-mid')",
      r["failure"] == "from-mid", f"failure={r['failure']}")

# A dim missing from one vote: median over the votes that have it.
votes = [
    {"dims": {"a": 4, "b": 3}, "failure": "x"},
    {"dims": {"a": 4},         "failure": "y"},   # no 'b'
    {"dims": {"a": 4, "b": 5}, "failure": "z"},
]
r = agg(votes)
check("missing dim handled (b present in 2 votes -> median 4)", r["dims"]["b"] == 4,
      f"b={r['dims']['b']}")
check("  -> 'a' present in all -> 4", r["dims"]["a"] == 4, f"a={r['dims']['a']}")

# Non-numeric dim value is skipped, not crashed on.
r = agg([{"dims": {"a": 4}}, {"dims": {"a": "N/A"}}, {"dims": {"a": 4}}])
check("non-numeric vote value skipped", r["dims"]["a"] == 4, f"a={r['dims']['a']}")

# Empty input is safe.
r = agg([])
check("empty votes -> safe empty result", r["dims"] == {}, f"{r}")

# JUDGE_VOTES default is 1 (cost parity) — only meaningful when env is unset.
import os
if "JUDGE_VOTES" not in os.environ:
    check("JUDGE_VOTES defaults to 1 when unset", drv.JUDGE_VOTES == 1,
          f"JUDGE_VOTES={drv.JUDGE_VOTES}")
else:
    print(f"SKIP  JUDGE_VOTES default check (env sets it to {os.environ['JUDGE_VOTES']})")

print(f"\n{'ALL PASS' if not fails else 'FAILED: ' + ', '.join(fails)}")
sys.exit(1 if fails else 0)
