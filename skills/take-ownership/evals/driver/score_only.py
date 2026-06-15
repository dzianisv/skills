#!/usr/bin/env python3
"""Score the CURRENT take-ownership SKILL.md against all frozen cases and
record the result keyed by git commit, so a future change that lowers the
judge score is caught as a regression.

Reuses driver-to.py's doer+judge. Does NOT run the meta loop and NEVER mutates
SKILL.md. Run: python score_only.py

Outputs (in the git repo, so they are committed alongside the skill):
  evals/score-history.jsonl   append-only ledger, one JSON record per run
  evals/SCOREBOARD.md         human-readable table, newest run on top
"""
import csv, importlib.util, json, os, statistics, subprocess, sys, datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("drv", HERE / "driver-to.py")
drv = importlib.util.module_from_spec(spec); spec.loader.exec_module(drv)

# Ledger lives in the git repo copy of the skill (source of truth), not ~/.claude.
# Default: derive the skill root from this file (evals/driver/score_only.py ->
# parents[2] == the skill dir). Override with TO_REPO_SKILL when the runner is
# copied elsewhere (e.g. ~/.claude) but the ledger should target the repo.
REPO_SKILL = Path(os.environ.get("TO_REPO_SKILL", str(HERE.parents[1])))
LEDGER = REPO_SKILL / "evals" / "score-history.jsonl"
BOARD  = REPO_SKILL / "evals" / "SCOREBOARD.md"
CSV    = REPO_SKILL / "evals" / "score-history.csv"


def regression_delta(prev_means, new_mean, k=3, threshold=0.1):
    """Noise-robust regression check.

    Compare new_mean against the MEDIAN of the last k prior-run means (not the
    single immediately-prior run — the LLM judge has σ≈0.1, so one prior sample
    is too noisy a reference and false-flags on identical input).

    prev_means: list of prior runs' overall means, oldest→newest, EXCLUDING the
    current run. Returns dict {ref_median, delta, regression, n}. With fewer than
    2 prior runs there is no reliable reference, so regression is False.
    """
    n = len(prev_means)
    if n < 2:
        return {"ref_median": None, "delta": None, "regression": False, "n": n}
    ref = statistics.median(prev_means[-k:])
    delta = round(new_mean - ref, 3)
    return {"ref_median": round(ref, 3), "delta": delta,
            "regression": delta < -threshold, "n": n}


def rewrite_csv(rows):
    """Flat CSV regenerated from the JSONL ledger each run (idempotent).
    One row per metric: kind ∈ {overall, dimension, case}; name is the
    eval/rubric name; score is the 0-5 mean (overall + per-dimension) or the
    case mean. Backfills the whole history automatically."""
    with open(CSV, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["commit_id", "ts", "dirty", "kind", "name", "score"])
        for r in rows:
            base = [r["commit"], r["ts"], r["dirty"]]
            w.writerow(base + ["overall", "OVERALL", f"{r['mean']:.3f}"])
            for d, v in sorted(r.get("dims", {}).items()):
                w.writerow(base + ["dimension", d, f"{float(v):.2f}"])
            for case, c in sorted(r.get("cases", {}).items()):
                w.writerow(base + ["case", case, f"{float(c['mean']):.2f}"])


def git(*args, default=""):
    try:
        return subprocess.run(["git", "-C", str(REPO_SKILL), *args],
                              capture_output=True, text=True).stdout.strip() or default
    except Exception:
        return default


def main():
    rubric = drv.read(drv.EVALS / "RUBRIC.md")
    body = drv.read(drv.SUT_PATH / "SKILL.md")
    cases = drv.load_cases("train") + drv.load_cases("holdout")
    if not cases:
        sys.exit("no cases found")

    commit = git("rev-parse", "--short", "HEAD", default="unknown")
    dirty = len([l for l in git("status", "--short").splitlines() if l])
    ts = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    print(f"scoring {len(cases)} cases @ commit {commit}"
          f"{' (+%d dirty)' % dirty if dirty else ''}, SKILL.md={len(body)} bytes\n")
    judged, mean, cost = drv.round_once("score", body, cases, rubric, "inject")

    # per-dimension aggregation
    agg = {}
    for j in judged:
        for d, v in j["dims"].items():
            try: f = float(v)
            except (TypeError, ValueError): continue
            agg.setdefault(d, []).append(f)
    dim_means = {d: round(sum(v) / len(v), 2) for d, v in agg.items()}

    print(f"{'case':38} {'#dims':>5}  mean  failure")
    print("-" * 92)
    for j in sorted(judged, key=lambda x: x["case"]):
        print(f"{j['case']:38} {len(j['dims']):>5}  {drv.dim_mean(j['dims']):0.2f}  "
              f"{j.get('failure','')[:40]}")
    print("-" * 92)
    print(f"OVERALL mean = {mean:0.2f}   cost = ${cost:0.2f}")
    print("per-dimension:", "  ".join(f"{d}={m}" for d, m in sorted(dim_means.items())))

    record = {
        "ts": ts, "commit": commit, "dirty": dirty,
        "mean": round(mean, 3), "cost_usd": round(cost, 2),
        "n_cases": len(cases), "dims": dim_means,
        "cases": {j["case"]: {"mean": round(drv.dim_mean(j["dims"]), 2),
                              "dims": j["dims"], "failure": j.get("failure", "")}
                  for j in judged},
    }
    LEDGER.parent.mkdir(parents=True, exist_ok=True)
    with open(LEDGER, "a") as f:
        f.write(json.dumps(record) + "\n")

    # regression check vs the MEDIAN of the last K prior runs (noise-robust)
    all_rows = [json.loads(l) for l in LEDGER.read_text().splitlines() if l.strip()]
    prev_means = [r["mean"] for r in all_rows[:-1]]   # exclude the row we just wrote
    rd = regression_delta(prev_means, mean)
    delta_note = ""
    if rd["delta"] is not None:
        flag = "  ⚠ REGRESSION" if rd["regression"] else ""
        delta_note = f" (Δ {rd['delta']:+.2f} vs median {rd['ref_median']:.2f}){flag}"
        print(f"median(last {min(3, rd['n'])} of {rd['n']} prior) = {rd['ref_median']:.2f}"
              f" → now {mean:.2f}{delta_note}")
    else:
        print(f"now {mean:.2f} (no regression check — only {rd['n']} prior run(s))")

    # rewrite SCOREBOARD.md newest-first
    rows = [json.loads(l) for l in LEDGER.read_text().splitlines() if l.strip()]
    lines = ["# take-ownership eval scoreboard", "",
             "Judge mean per commit (higher = better). A drop > 0.1 vs the median "
             "of the last 3 prior runs is a regression — do not ship it. See AGENTS.md.", "",
             "| date (UTC) | commit | dirty | mean | cost | per-dim |",
             "|---|---|---|---|---|---|"]
    for r in reversed(rows):
        dims = " ".join(f"{k}={v}" for k, v in sorted(r.get("dims", {}).items()))
        lines.append(f"| {r['ts']} | {r['commit']} | {r['dirty']} | "
                     f"{r['mean']:.2f} | ${r.get('cost_usd',0):.2f} | {dims} |")
    BOARD.write_text("\n".join(lines) + "\n")
    rewrite_csv(rows)

    print(f"\nrecorded → {LEDGER}\nboard    → {BOARD}\ncsv      → {CSV}{delta_note}")


if __name__ == "__main__":
    main()
