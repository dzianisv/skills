# Autonomous eval driver

Paper-style outer loop (DGM-H, arXiv 2603.19461) for `hyperagent-eval-skill`. The
improvement loop is a **Python process**, not an agent's context — so it runs
iteration-after-iteration and never "suddenly stops". Each iteration shells out to
`claude -p` in fresh processes for three roles. State lives on disk; a crash → restart
resumes.

```
driver.py    the loop: doer → judge → meta, parent-select, stop logic, holdout gate
harvest.py   mine real cases from ~/.claude/projects/*.jsonl session transcripts
```

## Roles (fresh `claude -p` each, paper's two-agent split)

| role  | sees | writes | model |
|-------|------|--------|-------|
| doer  | skill body + ONE case | nothing (read-only) | sonnet |
| judge | case + response + rubric, NOT the skill body | nothing | sonnet |
| meta  | current variant + judge diagnoses + cross-run memory | emits revised body (stdout) | opus |

`run_agent()` is the agent-agnostic seam — swap its body for `opencode run …` and the
loop is unchanged.

**Per-case dimensions.** Each case declares `applies: [dim, …]` in YAML frontmatter
naming the only rubric dimensions it exercises. The driver strips that frontmatter
before the doer sees it (so the doer can't game which dims are measured) and passes
the list to the judge, which scores only those and omits the rest. The doer answers
in one read-only advisory turn — it cannot spawn real subagents or run a multi-round
loop — so the judge grades whether the **guidance** correctly applies each principle,
not whether it physically executed. This keeps scores trustworthy: a focused answer to
"should I add cases mid-loop?" is graded on `frozen_holdout`, not punished for not
spawning actors.

## Skill loading — two modes

- `--mode inject` (default): doer gets the variant as its **system prompt**
  (`--append-system-prompt-file`). Agent-agnostic, isolated, tests the prose.
- `--mode stage`: variant is written as a **real skill** under an isolated
  `runs/iter-N/.claude/skills/<name>/`, doer launched with that `cwd` so it loads via
  normal discovery — exercises frontmatter + `references/` + trigger. Claude-specific.

## Run

```bash
python3 driver.py --init        # scaffold evals/ skeleton
# author RUBRIC.md dims, freeze cases/train (70%) + cases/holdout (30%), ≥6 total
python3 driver.py               # run loop until stop; resumes from disk if interrupted
python3 driver.py --mode stage  # high-fidelity load path
```

## Stop condition

`(train plateau AND holdout flat) OR iters>=MAX_ITERS OR cost>=BUDGET_USD`.
Never "until perfect" — chasing 5.0 on frozen train cases overfits. The shipped
variant is the best on **holdout**, not train.

## Cost

Each `claude -p` call has a ~$0.09 floor (harness system-prompt cache creation).
Budget ≈ `(cases × 2 roles + 1 meta) × iters × $0.13`. Tune `MAX_ITERS`, `BUDGET_USD`,
`PARALLEL` and the `MODEL_*` constants at the top of `driver.py`.

## Safety

- Doer/judge are **read-only** (`--allowedTools Read`). Meta emits text, also read-only.
- Variants are written to `evals/archive/`; the **live `SKILL.md` is never auto-overwritten**.
  Shipping prints a `cp` command for a human to confirm — the one irreversible step is gated.

## Continuous improvement from real usage

`harvest.py <skill>` scans Claude Code JSONL sessions where the skill fired and stages
the triggering user turns as candidate cases (`evals/cases/_harvested/`). Review, then
promote into `train/`+`holdout/` and **freeze before the next run**. Continuous between
epochs, frozen within one — preserves the anti-overfitting invariant.

## Outputs

```
evals/
├── archive/v0.md, v1.md …   variant bodies (v0 = live baseline)
├── scores.json              archive state (means, children, holdout) — resume source
├── scores.md                human-readable per-iter trend table
├── memory.json              PerformanceTracker: cross-run scores, trend, regressions
├── iterations/iter-N.md     raw judge output per round
└── runs/iter-N/             Mode-B staged skill scratch
```
