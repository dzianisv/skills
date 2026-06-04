# Rubric — hyperagent-eval-skill

Score each dimension 0–5. 5 = exactly right · 3 = right direction, soft on specifics · 0 = violates the principle.

**What you are grading.** The response is a *single advisory turn* — the agent
answering a user who asked about improving a skill. It cannot literally spawn
subagents or run a multi-round loop inside one turn, so grade whether its
**guidance correctly applies each principle** (does it prescribe the actor/judge
split, the frozen holdout, principle-edits, the archive, the honest stop), not
whether it physically executed them. A response that lays out the right method
and commits to the right first concrete action scores 5.

**Per-case applicability.** Each case declares `applies: [...]` in its frontmatter
naming the only dimensions it exercises. Score **only those**; the driver omits
the rest. A "should I add cases mid-loop?" question tests `frozen_holdout`, not
`isolation` — do not penalise a focused answer for staying on topic.
Map each miss to the skill section that caused it.

## isolation
Does the response **prescribe the actor/judge subagent split** with correct blindness?
- 5 = actor gets only skill body + one case; judge gets only case + response + rubric, NOT the skill body; run as separate subagents.
- 3 = mentions separate evaluation but lets judge see the skill, or runs actor in the main context.
- 0 = scores the skill by reading the instructions; no isolation.
- Fix-target: "Why subagents".

## frozen_holdout
Does it **freeze cases before round 1** and split train/holdout, never reading holdout while editing?
- 5 = explicit train/holdout split, frozen before iterating, holdout untouched during edits, scored periodically for generalization.
- 3 = has a test set but reads/edits against it, or adds cases mid-loop.
- 0 = no split, or tunes directly on the only cases it has.
- Fix-target: "Anti-overfitting".

## general_principle
Are edits made **by category, not by case**?
- 5 = the proposed fix names a general principle that generalizes across cases.
- 3 = fix is half-general, half-anchored to one scenario.
- 0 = patches the exact failing case ("in case 03, wrap pool.query").
- Fix-target: "The loop / FIX BY PRINCIPLE".

## archive_branching
Does it **keep prior variants and branch** when a dimension is stuck?
- 5 = keeps an archive, branches 2–3 different edits from the best variant when stuck, keeps losers.
- 3 = keeps versions but only linear v1→v2→v3.
- 0 = overwrites in place, no archive.
- Fix-target: "ARCHIVE / stepping-stones".

## honest_stop
Does it stop on **holdout plateau**, not a perfect train score, and name a residual?
- 5 = stop = holdout plateau OR budget; refuses "until perfect"; names a deliberate unchased residual with reason.
- 3 = stops on train plateau but forgets holdout, or chases a high train score.
- 0 = aims for 5.0 on train as the goal.
- Fix-target: "Stop the loop when / Done when".

## measurement
Does it drive edits from **cases + judge + a recorded trend**, not guessed improvements?
- 5 = lays out the loop (actor → judge → scores.md trend) and diagnoses the dragging dimension from data.
- 3 = scores once but doesn't track a trend, or reasons about quality without measuring.
- 0 = edits the skill by intuition, no measurement.
- Fix-target: "The loop / Persistent insight-memory & trend".
