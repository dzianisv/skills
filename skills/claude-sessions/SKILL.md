---
name: claude-sessions
description: Find a past Claude Code session on this machine by project or topic, then summarize what was done in it. Use when the user asks "which session did I do X in", "find the session where I worked on Y", "in project ~/path I worked on Z — find and summarize that session", "what was I doing in <project> last week", or wants to locate/recall/analyze a previous Claude Code conversation. Reads local ~/.claude/projects transcripts. Not for searching code, git history, or the current live session.
allowed-tools: Bash, Read, Agent, Task
---

# Claude Sessions

Locate the past Claude Code session(s) matching a project and/or topic, then summarize them. Sessions are local JSONL transcripts; individual files reach **tens of MB**. Never read full transcripts into the main context — rank cheaply, then **dispatch one subagent per top candidate** to do the heavy read in isolation.

## Storage facts

- Path: `~/.claude/projects/<dashified-cwd>/<sessionId>.jsonl`. The dir name is the project's cwd with every `/` and `.` replaced by `-` (e.g. `~/workspace/OpenClawBot` → `-Users-engineer-workspace-OpenClawBot`).
- One project may have **sibling dir variants** (`…-OpenClawBot`, `…-OpenClawBot-2`) — always consider all of them.
- Each line is a JSON record with a `type`: `user`, `assistant`, `custom-title` (`customTitle`), `last-prompt` (`lastPrompt`), `summary`, `file-history-snapshot`, etc. Records carry an ISO `timestamp`.

## Procedure

**1. Rank candidates cheaply.** Run the bundled ranking script (`scripts/rank_sessions.py`, next to this SKILL.md) — never grep raw transcripts yourself first.

```
python3 <skill-dir>/scripts/rank_sessions.py [--project PATH] [--days N] [--limit N] KEYWORD...
# installed location is usually:
python3 ~/.claude/skills/claude-sessions/scripts/rank_sessions.py --project ~/workspace/OpenClawBot "merge gate" enforce testing
```

- Give `--project` when the user names a path or project; omit it to search every project by topic.
- Pass the user's topic as several keyword variants (`"merge gate" "PR gate" enforce testing`) — more matching keywords ranks a file higher.
- Output is JSON: ranked `candidates` with `session_id`, `path`, `date`, `title`, `last_prompt`, `first_user`, and keyword hit counts.

**2. Deep-read the top candidates with subagents — in parallel.** Dispatch the top 2–4 candidates (one `Agent`/`Task` call each, in a single message so they run concurrently). This keeps multi-MB transcripts out of your context. Each subagent prompt must:

- Name the exact `path`.
- Instruct it to **grep within the file for the topic keywords and read only the surrounding context lines** (e.g. `grep -n -i 'merge gate' FILE`, then extract user/assistant text near those lines). Forbid reading the whole file.
- Return a compact report: does this session match the topic (yes/no + confidence), a 3–6 sentence summary of what was done, key files/PRs/commands touched, and the session date + id.

<example>
Subagent prompt:
"Read the Claude Code transcript at <path> (JSONL, possibly tens of MB — do NOT read it whole). The user is looking for the session where they worked on **PR merge-gate enforcement testing**. Use `grep -n -i` for 'merge gate', 'merge-gate', 'enforce', 'required check', 'branch protection' to find relevant lines, then read only the nearby `user`/`assistant` text records. Report: MATCH yes/no + confidence; a 3–6 sentence summary of what was actually done; key files/PRs/commands; and the session id + date. Keep under 200 words."
</example>

**3. Present the best match.** Lead with the winning session — its summary, `session_id`, `path`, and date. List runner-up candidates as one line each (id, date, why weaker). If nothing matches, say so and show the top recent sessions for the project so the user can redirect.

## Notes

- `summary`/`custom-title` lines are sparse; rank also uses whole-file keyword hit counts, so a high `keyword_file_hits` with zero meta matches is still a strong signal.
- Browse mode: run the script with no keywords (optionally `--days 7`) to list recent sessions when the user is vague ("what was I doing in X lately").
- To resume a found session, tell the user the id — `claude --resume <session_id>`.

## Done when

The user has the matching session's id, path, date, and a summary of what was done there — produced via subagent reads, with the main context never having ingested a full transcript.
