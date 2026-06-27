---
name: github-copilot-sessions
description: Find a past GitHub Copilot CLI agent session on this machine by project or topic via BM25 search, then summarize what was done. Use when the user asks "which Copilot session did I do X in", "find the Copilot CLI session where I worked on Y", or wants to locate/recall a previous GitHub Copilot conversation. Reads local ~/.copilot session stores. Not for searching code, git history, or the current live session.
allowed-tools: Bash, Read, Agent, Task
---

# GitHub Copilot Sessions

Locate past GitHub Copilot CLI sessions matching a project and/or topic, then summarize them. Session event logs reach **tens of MB**. Never read a full `events.jsonl` into the main context — rank cheaply with the bundled script, then **dispatch one subagent per top candidate** to grep just the relevant lines.

## Storage facts

Two complementary stores live under `~/.copilot/`:

**1. `~/.copilot/session-store.db`** (SQLite WAL) — the fast BM25 path.
- `search_index` is an FTS5 virtual table; its built-in `rank` column **is** BM25 (lower = better).
- ~15 k indexed rows. `source_type` ∈ `{turn, checkpoint_overview, checkpoint_history, checkpoint_work_done, checkpoint_technical_details, checkpoint_files, checkpoint_next_steps, workspace_artifact}`.
- `sessions(id, cwd, repository, branch, summary, created_at, updated_at, host_type)`.
- `turns(session_id, turn_index, user_message, assistant_response, timestamp)`.

**2. `~/.copilot/session-state/<UUID>/events.jsonl`** — per-session raw event log (one JSON obj/line).
- Each dir also has `workspace.yaml` with `summary:`, `created_at:`, `cwd:`, `repository:`.
- High-value event types: `session.task_complete` → `data.summary` (markdown recap); `session.compaction_complete` → `data.summaryContent` (~9 KB XML); `user.message`, `assistant.message`, `tool.execution_complete`.
- Session id = the UUID directory name.
- Used as BM25 fallback (`--no-db`) and for the deep-read step.

## Procedure

**1. Rank candidates cheaply** — run the bundled script. Never grep raw event logs yourself first.

```bash
python3 <skill-dir>/scripts/search_copilot_sessions.py [--project PATH] [--days N] [--limit N] [--no-db] KEYWORD...
# typical installed path:
python3 ~/.claude/skills/github-copilot-sessions/scripts/search_copilot_sessions.py "docker compose" "deployment"
# with project filter:
python3 ~/.claude/skills/github-copilot-sessions/scripts/search_copilot_sessions.py --project ~/workspace/OpenClawBot "provisioning"
# fallback to pure-Python BM25 over jsonl:
python3 ~/.claude/skills/github-copilot-sessions/scripts/search_copilot_sessions.py --no-db "provisioning"
```

- Default path uses FTS5 (fast, already indexed). Falls through to jsonl BM25 if DB is absent or returns nothing.
- Pass `--no-db` to force the Okapi BM25 path over `events.jsonl` files (stdlib, k1=1.5, b=0.75).
- Pass multiple keyword variants to increase recall (`"merge gate" "PR gate" enforce testing`).
- Output is JSON: `{"query", "project", "source":"fts5"|"jsonl-bm25", "candidates":[…], "count"}`.
- No-results case: JSON with empty `candidates` and a `looked_for` note.
- Browse mode (no keywords): returns most-recent N sessions — use when the user is vague ("what was I doing in X lately").

**2. Deep-read the top 2–4 candidates with subagents — in parallel.** Send all Task calls in a single message so they run concurrently. Each subagent must:

- Know the exact `session_id` and its `events.jsonl` path: `~/.copilot/session-state/<UUID>/events.jsonl`.
- **Grep within the file** for the topic keywords; read only the surrounding lines. Forbid reading the whole file.
- Extract the nearby `user.message` content and any `session.task_complete.data.summary` text.
- Return a compact report: MATCH yes/no + confidence, 3–6 sentence summary of what was done, key files/commands/PRs, session date.

<example>
Subagent prompt:
"Read the Copilot session at ~/.copilot/session-state/4bb4cd86-ab8b-4d6e-9f60-d5d4d16f7237/events.jsonl (JSONL, possibly tens of MB — do NOT read it whole). The user is looking for the session where they worked on **VM provisioning timeouts**. Use `grep -n -i` for 'provisioning', 'timeout', 'hetzner', 'tenant' to find relevant lines, then read only those line ranges (use `sed -n 'START,ENDp'`). Focus on `user.message` content and any `session.task_complete` summary. Report: MATCH yes/no + confidence; 3–6 sentence summary of what was done; key files/PRs/commands; session date. Under 200 words."
</example>

<example>
User: "find the Copilot session where I fixed the AKS managed identity issue"

1. Run the script:
   ```bash
   python3 ~/.claude/skills/github-copilot-sessions/scripts/search_copilot_sessions.py "AKS managed identity" "azure" --limit 6
   ```
2. Script returns top 3 candidates via FTS5. Spawn 3 parallel subagents, one per candidate, each grepping for 'managed.identity', 'AKS', 'azure', 'workload.identity'.
3. Subagent for session `5c73286d` reports MATCH high — found `session.task_complete` summary: "Fixed AKS workload identity binding by patching the federated credential in Terraform."
4. Present: session `5c73286d`, repo VibeTechnologies/OpenClawBot, date 2026-04-18, summary above. Runner-ups: session `a3f1...` (weak match, only 2 keyword hits in turns).
</example>

<example>
User: "what was I doing in ~/workspace/paperclip last week?"

Browse mode — no specific keywords:
```bash
python3 ~/.claude/skills/github-copilot-sessions/scripts/search_copilot_sessions.py --project ~/workspace/paperclip --days 7
```
Returns the 8 most recent sessions for that project. Present titles + dates; ask the user which one to dive into.
</example>

**3. Present the best match.** Lead with the winning session: `session_id`, `cwd`/`repository`, date, and a summary of what was done. List runner-up candidates as one line each (id, date, why weaker). If nothing matches, show the most recent sessions for the project so the user can redirect.

## Notes

- `session.task_complete.data.summary` is the highest-value ranking signal — it is a markdown recap of the full session. Prioritize it in subagent reads.
- GitHub Copilot CLI has no `--resume` equivalent; tell the user the session id and cwd so they can reconstruct context manually.
- Browse mode (no keywords): run the script without `KEYWORD` args, optionally with `--days N`.
- The jsonl BM25 path also covers sessions where `assistant.message` content is encrypted (blank) — it still scores on user messages, tool outputs, and task summaries.

## Done when

The user has the matching session's `session_id`, `cwd`/repository, date, and a clear summary of what was accomplished — produced via targeted subagent greps, with the main context never having ingested a full transcript.
