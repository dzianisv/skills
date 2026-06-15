# AGENTS.md — take-ownership skill

Guidance for any agent editing this skill.

## MANDATORY: eval-score regression gate

This skill is graded by a frozen eval suite (`evals/`). The judge mean is the
contract — it is how we know a change improved the skill instead of quietly
breaking it.

**Before AND after every change to `SKILL.md` (or `evals/RUBRIC.md`), you MUST
record the eval judge score keyed by the git commit:**

```bash
python evals/driver/score_only.py
```

This scores the current skill across all `evals/cases/{train,holdout}` cases and
writes three artifacts (it NEVER mutates `SKILL.md`):

- `evals/score-history.jsonl` — append-only, one rich record per run, keyed by
  `commit` + `dirty`, with overall mean, per-dimension means, and per-case detail.
- `evals/score-history.csv` — flat log regenerated from the JSONL each run, one
  row per metric: `commit_id, ts, dirty, kind, name, score` where `kind` ∈
  {`overall`, `dimension`, `case`} and `name` is the eval/rubric name. This is
  the easy-to-diff record — grep a commit, or a dimension's trend, in one line.
- `evals/SCOREBOARD.md` — human-readable table, newest run on top.

Rules:

- **Score before you edit** (baseline for the current commit) and **after you
  edit** (so the delta is attributable to your change).
- **A drop of more than 0.1 vs the median of the last 3 prior runs is a
  regression — do not ship it.** The gate (`regression_delta()` /
  `confirm_regression()` in `score_only.py`) medians the prior runs AND, on a
  flag, **resamples the new run** (re-scores up to `RESAMPLE_N`=3 times) and
  decides on the median of the new samples — so neither a noisy prior nor a
  noisy-low *new* run false-flags (the LLM judge has σ≈0.1). Resampling costs
  nothing on the common no-flag path. The recorded `mean` is the median of all
  samples drawn (`samples` field); `dims`/`cases` are from the first sampling run
  (diagnostic). Find which dimension fell, fix the cause in `SKILL.md`, re-score
  until it recovers. The gate logic is tested by `evals/driver/test_gate.py`
  (deterministic, no cost) — run it after editing `score_only.py`.
- **Commit `score-history.jsonl`, `score-history.csv`, and `SCOREBOARD.md`
  together with the `SKILL.md` change**, so the score is permanently tied to the
  commit that produced it and the history is auditable.
- New behavior in the skill needs a matching frozen case in `evals/cases/` and,
  if it tests a new property, a new dimension in `evals/RUBRIC.md` — otherwise
  the score can't see whether the behavior works.

**Known gate limitation:**

- **Dirty runs count toward the median.** The gate's reference median is the mean
  of the last 3 prior ledger rows regardless of their `dirty` flag, so a score
  taken with an uncommitted tree still shapes the bar. Prefer scoring on a clean
  tree; treat the `dirty` column as a trust signal when reading history.

  (The noisy-*new*-run false-flag is now handled automatically — see the
  resample-on-flag behavior above, #10.)

The full self-improving loop (`evals/driver/driver-to.py`) is a separate,
expensive DGM-H meta-rewrite loop (~$22, opus). Use `score_only.py` for the
regression gate; reserve the full driver for deliberate improvement runs.

## Source-of-truth note

The canonical copy is this repo (`skills/take-ownership/`). The live runtime copy
at `~/.claude/skills/take-ownership/` (the driver's `SUT_PATH`) must be kept in
sync — after editing here, copy `SKILL.md` + `evals/` across before scoring, or
the score will reflect the stale runtime copy.
