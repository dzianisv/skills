#!/usr/bin/env python3
"""Deterministic test for the noise-robust regression gate (issue #4).

Exercises the REAL regression_delta() from score_only.py against the actual
recorded noise history and a synthetic genuine drop. No LLM calls, no cost.
Run: python test_gate.py   (exit 0 = all pass)
"""
import importlib.util, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("so", HERE / "score_only.py")
so = importlib.util.module_from_spec(spec); spec.loader.exec_module(so)
rd = so.regression_delta

fails = []
def check(name, cond, detail=""):
    print(f"{'PASS' if cond else 'FAIL'}  {name}  {detail}")
    if not cond:
        fails.append(name)

# Real recorded history of (near-)identical-content runs — the σ≈0.1 noise that
# the old single-prev gate false-flagged on. A new sample within that band must
# NOT flag.
NOISE = [4.13, 4.43, 4.37, 4.41, 4.30, 4.24]

r = rd(NOISE, 4.30)
check("noise series, new=4.30 -> no flag", not r["regression"],
      f"ref_median={r['ref_median']} delta={r['delta']}")

r = rd(NOISE, 4.24)
check("noise series, new=4.24 (the #3 false-positive) -> no flag",
      not r["regression"], f"ref_median={r['ref_median']} delta={r['delta']}")

# A genuine regression: stable ~4.3 history, new mean craters to 3.9.
r = rd([4.3, 4.35, 4.28, 4.32], 3.90)
check("genuine drop 4.3->3.90 -> FLAG", r["regression"],
      f"ref_median={r['ref_median']} delta={r['delta']}")

# Just past threshold (median 4.30, new 4.19 -> delta -0.11) must flag.
r = rd([4.28, 4.30, 4.31], 4.19)
check("drop just past 0.1 threshold -> FLAG", r["regression"],
      f"delta={r['delta']}")

# Within threshold (median 4.30, new 4.21 -> -0.09) must NOT flag.
r = rd([4.28, 4.30, 4.31], 4.21)
check("drop within threshold (-0.09) -> no flag", not r["regression"],
      f"delta={r['delta']}")

# Insufficient history (<2 prior) -> never flag.
r = rd([4.3], 3.0)
check("only 1 prior run -> no flag (insufficient history)",
      not r["regression"] and r["delta"] is None, f"n={r['n']}")
r = rd([], 3.0)
check("zero prior runs -> no flag", not r["regression"], f"n={r['n']}")

# Median uses only the last k=3, so an ancient low outlier is dropped from the
# reference entirely. History [2.0, 2.0, 4.3, 4.35] -> last-3 [2.0, 4.3, 4.35],
# median 4.3 (the first 2.0 excluded). If all 4 were used the median would be
# 3.15 and a healthy 4.25 run would look like a +1.1 jump — wrong reference.
r = rd([2.0, 2.0, 4.3, 4.35], 4.25)
check("last-3 median drops the oldest sample", r["ref_median"] == 4.3,
      f"ref_median={r['ref_median']} (expected 4.3)")
check("  -> healthy run near recent median, no flag", not r["regression"],
      f"delta={r['delta']}")

# ── regression_delta with a LIST of new samples (median of new side) ──────────
r = rd([4.3, 4.32, 4.31], [4.18, 4.40, 4.39])   # new median 4.39, not the low 4.18
check("list new_means uses the NEW median (4.39) -> no flag", not r["regression"],
      f"new_median={r['new_median']} delta={r['delta']}")
r = rd([4.3, 4.32, 4.31], [3.9, 3.95, 4.0])     # all new low -> median 3.95
check("list new_means all-low (median 3.95) -> FLAG", r["regression"],
      f"new_median={r['new_median']} delta={r['delta']}")

# ── confirm_regression: resample ONLY on an initial flag ─────────────────────
cr = so.confirm_regression
PRIOR = [4.30, 4.32, 4.31]   # median 4.31

# (c) no initial flag -> resample_fn NEVER called, single sample kept
calls = [0]
def never():
    calls[0] += 1; return 0.0
rdc, samples = cr(PRIOR, 4.30, never, n_total=3)
check("no initial flag -> resample_fn not called", calls[0] == 0 and len(samples) == 1,
      f"calls={calls[0]} samples={samples}")
check("  -> not a regression", not rdc["regression"], f"delta={rdc['delta']}")

# (a) initial flag (4.18 vs 4.31) but resamples recover -> reverts to no-flag
calls = [0]
recover = iter([4.40, 4.39])
def resample_recover():
    calls[0] += 1; return next(recover)
rda, samples = cr(PRIOR, 4.18, resample_recover, n_total=3)
check("initial flag, resamples recover -> resample_fn called twice", calls[0] == 2,
      f"calls={calls[0]} samples={samples}")
check("  -> noisy-low single sample REVERTS (no flag)", not rda["regression"],
      f"new_median={rda['new_median']} delta={rda['delta']}")

# (b) initial flag AND sustained low -> stays flagged
calls = [0]
low = iter([3.92, 3.95])
def resample_low():
    calls[0] += 1; return next(low)
rdb, samples = cr(PRIOR, 3.90, resample_low, n_total=3)
check("sustained low -> resampled (2 calls) AND stays FLAGGED",
      calls[0] == 2 and rdb["regression"],
      f"calls={calls[0]} new_median={rdb['new_median']} delta={rdb['delta']} samples={samples}")

# guard: too little prior history -> never resamples, never flags
calls = [0]
rdg, samples = cr([4.3], 2.0, lambda: (calls.__setitem__(0, calls[0]+1) or 4.3), n_total=3)
check("<2 prior runs -> no resample, no flag", calls[0] == 0 and not rdg["regression"],
      f"calls={calls[0]}")

print(f"\n{'ALL PASS' if not fails else 'FAILED: ' + ', '.join(fails)}")
sys.exit(1 if fails else 0)
