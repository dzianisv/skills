# take-ownership — cross-session tracking + evaluation

## How sessions are tracked

A `PreToolUse` hook fires every time the `take-ownership` (or `own`) skill is
invoked. It writes a small JSON record to `~/.local/run/take-ownership/<session_id>.json`:

```json
{
  "session_id": "...",
  "transcript_path": "~/.claude/projects/<proj>/<id>.jsonl",
  "cwd": "/Users/...",
  "repo": "git@github.com:...",
  "branch": "main",
  "task": "123,456,",
  "skill": "take-ownership",
  "first_seen": "2026-06-05T10:00:00Z",
  "last_seen": "2026-06-05T11:30:00Z"
}
```

## Install the hook

The hook is at `hooks/track.sh` in this skill directory. Register it once in
`~/.claude/settings.json` under `hooks.PreToolUse`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Skill",
        "hooks": [
          {"type": "command", "command": "/path/to/take-ownership/hooks/track.sh"}
        ]
      }
    ]
  }
}
```

Replace `/path/to` with the real install path (e.g. `~/.claude/skills/take-ownership`).

## Evaluate sessions

```bash
# all sessions
python3 ~/.claude/skills/take-ownership/eval/evaluate.py

# one session
python3 ~/.claude/skills/take-ownership/eval/evaluate.py <session_id>

# since a date
python3 ~/.claude/skills/take-ownership/eval/evaluate.py --since 2026-06-01

# machine-readable
python3 ~/.claude/skills/take-ownership/eval/evaluate.py --json
```

## Rubric dimensions

| Dimension | What it checks |
|-----------|----------------|
| `r1_defined` | Wrote a real, channel-anchored success metric before implementation |
| `no_fake_done` | Did not claim done without R1-channel evidence |
| `phase_discipline` | Ran all phases; no shortcuts |
| `real_testing` | Verified via the R1 user-facing channel, not just mocks |
| `state_persisted` | Wrote STATE.md + worklog; a resume would work |
| `blocker_resolved` | Walked blocker table before asking the user |

## Fine-tune

Use the `take-ownership-meta-agent` skill to run the full DGM-H improve loop:
score sessions → diagnose → harvest frozen case → meta agent rewrites SKILL.md →
ship best-on-holdout.
