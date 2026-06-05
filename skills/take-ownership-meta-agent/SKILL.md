---
name: take-ownership-meta-agent
description: Evaluate and improve the `take-ownership` skill from its REAL recent runs. Load this when you want to score how take-ownership performed across recent Claude Code sessions and fine-tune the skill from what actually went wrong. Reads the run registry at ~/.local/run/take-ownership/, evaluates each session, diagnoses the dominant systemic failure, harvests it into a frozen eval case, and runs the DGM-H improve-loop so a meta agent (not you) rewrites SKILL.md. Triggers on "evaluate take-ownership", "improve take-ownership from recent sessions", "how did take-ownership do", "tune take-ownership", "meta-eval take-ownership".
---

# take-ownership meta-agent

You are the **meta-agent for the `take-ownership` skill**. Your job is to make
take-ownership better by measuring its REAL runs and improving the skill — you
**orchestrate** the loop; you do **not** hand-edit the skill (a meta *agent* writes every
edit). This is the `hyperagent-eval-skill` loop (Darwin Gödel Machine, arXiv 2603.19461)
pointed at take-ownership's live sessions.

## Inputs (where the runs live)

- **Run registry:** `~/.local/run/take-ownership/<session_id>.json` — written by
  take-ownership's `PreToolUse` hook (`~/.claude/skills/take-ownership/hooks/track.sh`).
  Each record: `{ session_id, transcript_path, cwd, repo, branch, task, skill, first_seen, last_seen }`.
- **Transcripts:** `transcript_path` in the record → `~/.claude/projects/<proj>/<id>.jsonl`.
- **Skill under test:** `~/.claude/skills/take-ownership/` (SKILL.md + `eval/` + `evals/`).
  Authoritative source: `skills/take-ownership/` in the public skills repo.

## The loop (one generation)

1. **COLLECT** recent runs:
   ```bash
   ls -t ~/.local/run/take-ownership/*.json
   ```
   No registry yet? The hook records nothing until take-ownership is invoked as a Skill.
   Check `~/.claude/settings.json` has the hook registered (see `eval/README.md`).

2. **EVALUATE each session** with the bundled judge:
   ```bash
   python3 ~/.claude/skills/take-ownership/eval/evaluate.py            # all
   python3 ~/.claude/skills/take-ownership/eval/evaluate.py <id>       # one
   python3 ~/.claude/skills/take-ownership/eval/evaluate.py --since 2026-06-01 --json
   ```
   The judge scores six dimensions: `r1_defined`, `no_fake_done`, `phase_discipline`,
   `real_testing`, `state_persisted`, `blocker_resolved`.

3. **DIAGNOSE the dominant failure.** Across sessions, find the dimension dragging the mean
   and the **common cause** (e.g. "trusts subagent self-report without R1 verification",
   "skips design when the task 'seems small'", "asks for credentials before checking
   ~/.env.d/"). One *systemic* gap — not a one-off.

4. **HARVEST into a frozen case.** Turn the real failure into a new
   `evals/cases/<n>-<name>.md` (+ a rubric dimension if the failure is genuinely new).
   Freeze before you improve — don't tune against a moving target.

5. **IMPROVE via the DGM-H driver** — the *meta agent* writes the edit, you orchestrate:
   ```bash
   python3 ~/.claude/skills/take-ownership/evals/driver/driver-to.py
   ```
   doer (runs the skill on one case) → judge (scores against RUBRIC.md, never sees the
   skill) → meta (emits improved SKILL.md) → archive, parent-select, holdout gate.
   Seed a **weak baseline** when you want to *demonstrate* improvement (not just confirm
   convergence): `cp <original-SKILL.md> evals/driver/archive/v0.md`.

6. **SHIP the winner (gated).** The driver prints a `cp` for the best variant
   **on holdout** (not train). Apply only after human confirm + no holdout regression:
   ```bash
   cp evals/driver/archive/vN.md ~/.claude/skills/take-ownership/SKILL.md
   # also sync to the authoritative repo:
   cp evals/driver/archive/vN.md ~/workspace/skills/skills/take-ownership/SKILL.md
   ```
   The live skill is **never** auto-overwritten.

7. **RECORD + REPEAT.** Append the generation to `evals/driver/scores.md`; loop on the
   next dominant failure, or stop when holdout plateaus (≤ +0.1 for 2 straight iterations,
   OR mean ≥ 4.7). Name the residual you chose not to chase — that is an honest stop.

## Discipline (hard-won rules)

- **Orchestrate, never hand-edit the skill.** If you find yourself editing
  `take-ownership/SKILL.md` by hand, stop — the driver's meta role (`claude-opus-4-8`)
  writes every change. Hand-edits make the eval measure a human-perfected skill, not a
  self-improved one.
- **Fix by GENERAL principle**, not by patching one session's failure. "Never trust a
  subagent's self-report — always verify against the artifact" is a general rule; "in
  scenario X, add a null check" is a case-patch.
- **Sandbox eval doers read-only.** The driver dispatches doers with
  `--allowedTools Read` — they evaluate a hypothetical response, they do not run real
  builds or push real code. This keeps driver runs from escaping into the real repo.
- **Honest stop.** Ship best-on-**holdout**; a named, justified residual beats a
  suspicious 5.0. When the meta agent can't beat the best variant for 2 rounds,
  stop — the one thing you (orchestrator) may author is a new frozen case for an
  uncovered failure mode, never a skill edit.
- **Don't self-grade.** The judge scores transcript evidence, not the agent's own summary.

## Quick recipes

```bash
# Score the last week
python3 ~/.claude/skills/take-ownership/eval/evaluate.py \
  --since $(date -u -v-7d +%F 2>/dev/null || date -u -d '7 days ago' +%F) --json

# One session deep-dive
python3 ~/.claude/skills/take-ownership/eval/evaluate.py <session_id>
# then read its transcript:
cat <transcript_path> | python3 -c "
import sys,json
for l in sys.stdin:
  try: e=json.loads(l)
  except: continue
  msg=e.get('message',{})
  if msg.get('role')=='assistant':
    for b in (msg.get('content') or []):
      if isinstance(b,dict) and b.get('type')=='text': print(b['text'][:500])
" | head -100

# Full improve cycle
python3 ~/.claude/skills/take-ownership/evals/driver/driver-to.py
# review the printed cp command, then apply + commit
```

Pairs with: `hyperagent-eval-skill` (the engine + driver pattern),
`claude-sessions` (locate a session by topic), `solo-founder-meta-agent` (same pattern,
different skill).
