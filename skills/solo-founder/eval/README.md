# solo-founder: cross-session tracking + evaluation

Track where solo-founder runs and score its work later.

## How it works
1. **Capture (hook).** `hooks/track.sh` is a `PreToolUse` hook on the `Skill` tool. When the
   `solo-founder` skill is invoked, it upserts a registry record keyed by the **real session id**
   (which hooks receive; the agent itself has no session-id env var):
   ```
   ~/.local/run/solo-founder/<session_id>.json
   { session_id, transcript_path, cwd, repo, branch, goal, first_seen, last_seen }
   ```
   Register once in `~/.claude/settings.json`:
   ```json
   { "matcher": "Skill", "hooks": [ { "type": "command",
     "command": "/Users/<you>/.claude/skills/solo-founder/hooks/track.sh" } ] }
   ```

2. **Evaluate (script).** `eval/evaluate.py` reads the registry, digests each session's transcript
   (user goals + shipping actions from Bash + recent assistant accounts), and scores the work with
   an LLM judge (`claude -p`) on: ship_real, verify_real_channel, blocked_routing, honest_metric,
   no_fakedone.
   ```bash
   python3 ~/.claude/skills/solo-founder/eval/evaluate.py            # all sessions
   python3 ~/.claude/skills/solo-founder/eval/evaluate.py <session>  # one
   python3 ~/.claude/skills/solo-founder/eval/evaluate.py --since 2026-06-01 --json
   ```
   Env: `SF_EVAL_MODEL` (default `sonnet`).

## Notes
- The judge reads only the digest; for very long sessions the digest is tail-biased (last ~16k
  chars of assistant accounts + all user goals + all shipping actions) — fine for focused runs.
- Capture is passive: it never blocks the tool call (always exits 0).
