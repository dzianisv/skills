---
name: hyperagent-eval-skill
description: Measure and improve an existing SKILL.md by running it through a subagent eval loop — actor subagents execute the skill on frozen cases, a judge subagent scores against a rubric, you fix the prompt by general principle and repeat until scores plateau. Use when asked to "evaluate a skill", "improve a skill with evals", "score this skill", "run an eval loop on this skill", "make this skill better", or to tune any prompt/agent instruction against measurable cases. For first-draft authoring use write-skill; this skill improves one that already exists.
---

# Improve Skill

## START HERE — pick the mode, then act

Two request shapes land here. Read which one you got before doing anything:

- **"Improve / evaluate / score this skill"** with a target skill + at least one case (or cases you can write) → **run the loop, don't just describe it.** Go to the numbered steps below. Don't ask for confirmation before spawning.
- **A question about the method** — "does my plan have holes?", "is adding cases mid-loop right?", "should I ship at 5.0 on train?", "get me to 5.0 fast" → **answer it directly and correctly.** Apply the principle the question turns on (often anti-overfitting or isolation); push back when the ask is wrong (chasing a perfect train score, self-rating instructions). Do not spawn subagents to answer a yes/no question.

When you're in run-the-loop mode:

1. Spawn one **Actor** subagent per `train/` case **in parallel** (one Agent call per case in the same message). Actor prompt: the skill body + the case text. Nothing else — no rubric, no other cases, no instructions from you.
2. Collect their raw responses.
3. Spawn one **Judge** subagent per (case, actor-response) pair. Judge prompt: the case + the actor's response + the rubric. Nothing else — no skill body.
4. Record every score + failure-mode verbatim in `iterations/iter-N.md`.
5. Diagnose the dragging dimension, fix by general principle, archive the old variant.
6. Repeat.

If `evals/` does not yet exist, create it (see **Set up once** below), then return to step 1.

---

Improve a skill by measuring it, not by guessing. This is a hand-run version of a self-improving agent loop (Darwin Gödel Machine / Hyperagents, arXiv 2603.19461): the parts that make it work are **context isolation**, **a frozen held-out test set**, **general-principle edits**, and **a kept archive of variants**.

Pairs with `write-skill` (which authors the prose) and `skill-creator` (which scaffolds the directory). This skill is the measurement-and-iteration layer on top.

The source paper is bundled for reference at `references/hyperagents-2603.19461.txt`. Read it when you need the exact mechanism behind a step below — the archive/stepping-stones selection rule, the metacognitive self-modification argument, the cross-domain transfer ablations, or the auto-developed `PerformanceTracker` + persistent-memory examples.

## Why subagents (the core mechanism)

The single most important design choice is **isolation**, achieved with the `Agent` tool:

- **Actor** subagent: gets *only* the skill body + one case. It cannot see the rubric, the other cases, or your intent — so it can't game the score, and its context can't leak into yours.
- **Judge** subagent: gets *only* the case + the actor's response + the rubric. It cannot see the skill body — so it scores the *output*, not the instructions' good intentions.

Spawn all actors for a round in **one message** (parallel Agent calls) so the round is fast and the runs are independent. Use a cheap model (`sonnet`/`haiku`) for actors and judge; reserve your own context for diagnosis and edits.

## Set up once

Create an `evals/` dir next to the skill:

```
<skill>/evals/
├── RUBRIC.md          # dimensions (0–5) + scoring rules + stop condition
├── cases/             # frozen scenarios, one file each
│   ├── train/         # used to diagnose and drive edits
│   └── holdout/       # NEVER read while editing — measures generalization
├── archive/vN.md      # every scored variant body — kept, never overwritten (incl. branch losers)
├── iterations/iter-N.md   # judge output + diagnosis per round
└── scores.md          # trend table across rounds
```

Versioning is `archive/`, not git history or `iterations/`: keep every variant *body* as `vN.md` (including the losers from a branch) so a later round can graft a discarded edit back in. Linear in-place rewriting throws away those stepping stones.

- **Rubric**: 4–8 named dimensions, each with a concrete 0–5 anchor (5 = exactly right, 3 = right direction soft on specifics, 0 = violates the principle). Name the failure mode and map each miss to the skill section that caused it. Mark dimensions N/A per case where they don't apply.
- **Cases**: real scenarios the skill must handle, frozen as text. Split ~70/30 into `train/` and `holdout/`. **Freeze them before round 1** — adding or editing cases mid-loop invalidates the trend. Aim for ≥6 total; more cases = less overfitting room.

## The loop

One round = one skill variant scored:

1. **RUN** — spawn one actor subagent per `train/` case in parallel. Each adopts the current skill body and responds as the agent would. Collect raw responses.
2. **JUDGE** — spawn the judge subagent on each (case, response) pair. It returns per-dimension scores, a one-line failure mode, and the fix-target section. Record everything verbatim in `iterations/iter-N.md`.
3. **DIAGNOSE** — find the dimension(s) dragging the mean and the *common cause* across cases. A score that's flat across rounds points at a structural gap, not a wording nit. **Immediately check: has this dimension been flat for 2+ prior rounds?** If yes → skip step 4 and go straight to step 5 (branch). If this is the first round it's dragging, proceed linearly and write a note in the insight block so the next round knows to branch if it stalls again.
4. **FIX BY PRINCIPLE** — make the smallest edit that fixes the *category*, not the case. "Name the exact integration point" generalizes; "in case 03, wrap pool.query" overfits. If a fix only helps one case, it's the wrong fix.
5. **ARCHIVE** — keep the prior variant; don't overwrite linearly. When a dimension is stuck, branch 2–3 *different* edits from the best variant, score each, keep the winner — and keep the losers in the archive. Linear v1→v2→v3 gets trapped in local optima; the paper's ablations show open-ended branching is what escapes them.
6. **RECORD** — append a row to `scores.md` (per-dimension means + the change you made) and a synthesized insight to the round file (below). Repeat.

When a dimension is **stuck** (flat for 2+ rounds), don't keep editing one line — branch. Fork several *different* edits from the same best parent, score each independently, keep the winner, and **keep the losers in the archive** (they're stepping stones a later round may build on):

<example>
Stuck: `archive_branching` flat at 3.0 for rounds 2–3 (best parent = v3).
Branch three edits from v3, score each on train, don't overwrite:
- v3→v4a: add a worked branching example.            → archive_branching 3→5, others flat. ✓ keep as best
- v3→v4b: rewrite the ARCHIVE prose to be sterner.   → 3→4, measurement dropped 5→4. ✗ keep in archive
- v3→v4c: add a "branch when stuck" rule to the loop.→ 3→4, no movement elsewhere. ✗ keep in archive
Winner v4a is the new parent; v4b/v4c stay in `archive/` — a future round may graft v4c's rule onto v4a.
</example>

Linear v1→v2→v3 gets trapped in local optima; the paper's ablations show this open-ended branching is what escapes them.

## Anti-overfitting (the central lesson)

The paper separates train / validation / test *because judges overfit*. Apply it:

- Edit only against `train/`. **Never open `holdout/` while deciding an edit.**
- Every few rounds, score the current best variant on `holdout/`. If train keeps rising but holdout flattens or drops, you're fitting the cases, not improving the skill — **stop and revert to the last variant whose holdout still rose.**
- The honest stop point is "holdout plateaus", not "train hits 5.0". Chasing a perfect train score on a handful of frozen cases produces a worse skill.

## Persistent insight-memory & trend

Across rounds the diagnoses are the real asset — keep them, don't just keep scores. In each `iter-N.md`, after the raw judge output, write a short synthesized block the next round reads first:

<example>
## Insight (round 3)
- Stuck dim: verify_real_channel flat at 4.0 across rounds 1–2.
- Cause: skill says "prove it works" without naming the observable → actors default to "tests pass".
- Edit this round: require naming endpoint + command + exact observable (status/field/event).
- Watch next round: did over-specifying cause no_overengineering to drop? (over-correction check)
</example>

Track each dimension's value per round in `scores.md` so a **regression or over-correction** is visible immediately (a dimension that jumps then falls means the last edit traded one failure for another). This is the manual form of the paper's auto-developed `PerformanceTracker` + improvement-trend.

## Stop the loop when

- Mean stops rising (≤ +0.1 over the prior best for two straight rounds), **and** holdout has plateaued — OR
- Holdout mean ≥ your target bar and every dimension is above its floor.

Then write a verdict in `scores.md`: the trajectory, which fix moved which dimension, and any residual you deliberately did **not** chase (with the reason — usually "closing it would overfit N frozen cases"). A named, justified residual is a stronger result than a suspicious 5.0.

## Automated driver (run the loop unattended)

The loop above is hand-run. For long runs that must not stall on a filling agent
context, `driver/` ships a paper-style **outer loop in Python** — the loop is the
process, not an agent's context, so it runs iteration-after-iteration and never
"suddenly stops". Each round shells out to `claude -p` in fresh processes for the
three roles (doer / judge / meta); state lives on disk and resumes after a crash.

```bash
python3 driver/driver.py --init     # scaffold evals/
# freeze RUBRIC + train/holdout cases
python3 driver/driver.py            # run til (holdout plateau OR budget); ships best on holdout
python3 driver/harvest.py <skill>   # mine real cases from ~/.claude/projects JSONL sessions
```

`run_agent()` is an agent-agnostic seam (swap `claude -p` for `opencode run`).
Doer loads the skill via system-prompt inject (default) or a staged real-skill dir
(`--mode stage`). Each case declares `applies: [dim, ...]` in its frontmatter (the
doer never sees it); the judge scores only those dimensions and grades the *guidance
quality* of a single advisory turn, not literal multi-round execution. The live
`SKILL.md` is never auto-overwritten — shipping is gated on a human-confirmed `cp`.
See `driver/README.md`.

## Worked example

`~/.agents/skills/solo-founder/evals/` is a complete run of this loop: 7-dimension `RUBRIC.md`, 6 frozen cases, `iterations/iter-1..4.md`, and a `scores.md` trajectory 4.25 → 4.61 → 4.82 → 4.97 with a CONVERGED verdict and a named residual. Copy its structure.

## Done when

- `evals/` has a frozen rubric + train/holdout cases, committed before round 1.
- Each round's judge output and synthesized insight are recorded; `scores.md` shows per-dimension trend.
- The shipped variant is the best on **holdout**, not just train; every edit was a general principle.
- The verdict names the residual and why it wasn't chased.
