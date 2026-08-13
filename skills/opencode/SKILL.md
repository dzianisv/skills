---
name: opencode
description: Control a remote or local OpenCode server via opencode-cli (or its REST API directly). Use when asked to create sessions, send prompts, check status, find stuck/idle sessions, hand off tasks, or interact with OpenCode programmatically. Triggers on "opencode", "opencode server", "opencode CLI", "opencode API", "send prompt to opencode", "opencode session", "stuck session".
---

# OpenCode Server Control

Control `opencode serve` (local or remote) using **`opencode-cli`**, a thin wrapper around the
REST API purpose-built for agents. Prefer it over hand-rolled curl+jq — it handles auth, timeouts,
JSON shapes, busy/idle cross-referencing, and error messages consistently. A raw REST reference is
kept at the bottom for the few things the CLI doesn't wrap (fork, shell, file search, worktrees).

## Multi-project scoping — read this first

**opencode servers scope sessions by project directory.** A plain `GET /session` — and so
`opencode-cli sessions` / `stuck` without `--directory` or `--all-projects` — only
returns the server's own default project. Sessions in every other project directory are
**invisible**, not filtered-and-empty. This is the default behavior, not an opt-in filter, and it
silently produces a false "nothing going on" for a supervisor sweeping for stuck work. Confirmed
live on opencode v1.17.9: a bare `sessions` call returned 32 sessions (one project); `--all-projects`
against the same server returned 293 sessions across 8 different projects in the same 26h window.

- **List/status/create/permissions are project-scoped**: `GET /session`, `GET /session/status`,
  `POST /session` (create), `GET /permission`. Pass `?directory=<abs path>` — a project's `worktree`
  from `GET /project` — to target one project, or enumerate all of them.
- **`/session/status` absence ≠ idle.** It's project-scoped exactly like `/session` and
  `/permission` above — an *unscoped* call only reports busy/retry/fallback sessions in the
  server's own default project, so a busy session in another project is simply missing from the
  response, not filtered out as idle. Treating that absence as proof of "idle" is the exact mistake
  that makes a working fleet look quiet: confirmed live on v1.17.9, an unscoped `/session/status`
  showed **1** busy session while a full per-project fan-out showed **15** busy across 5 projects
  (AgentPodMobile 2, vibebrowser 4, KineticAiCoach 4, TaroAiScanner 1, OpenClawBot 4) — two
  independent code paths (a manual per-project loop and the `sessions --all-projects` aggregation)
  agreed exactly. Only a *scoped* call (or `--all-projects`) for that session's own project is
  evidence of idle. Note `opencode-cli status` itself only takes `--directory` (one project at a
  time), not `--all-projects` — for a fleet-wide busy view use `sessions --all-projects` (STATUS
  column) or `stuck --all-projects`, both of which fan `/session/status` out per project internally.
- **Single-session-ID endpoints are global**: `GET /session/:id`, `GET/POST /session/:id/message`,
  abort/delete/children/diff resolve by session ID regardless of `directory` (verified: identical
  content with no directory param, the correct directory, and a deliberately wrong one).
- **Default to `sessions --all-projects` / `stuck --all-projects`** for any sweep unless you already
  know the single project you're checking — it calls `GET /project` and queries every worktree,
  tagging rows with a `project` column. Use `opencode-cli projects` to see the worktree list itself.
- **The web UI and the REST API use different URL shapes.** The web UI's
  `/{base64-encoded-directory}/session/...` path is a **frontend SPA route only** — hitting it on the
  server falls through to the catch-all and serves `index.html` (confirmed: HTTP 200,
  `Content-Type: text/html`, not JSON). The REST API never takes a base64 path segment; it always
  takes `directory` as a plain query param (or `x-opencode-directory` header). A base64 blob in a
  URL is a browser tab to look at, not an endpoint to curl.

## Permission requests — unblocking frozen sessions

A session waiting on a permission prompt looks **plain idle** — it does NOT appear in `GET
/session/status` (that endpoint only lists busy/retry/fallback sessions) **even when the call is
correctly scoped to its own project**. There is no status bit that flips when a session freezes on
a permission; it just silently stops making progress. (If the call isn't scoped to that project
either, absence from `/session/status` is doubly uninformative — see Multi-project scoping above,
which lists `/session`, `/session/status`, and `/permission` together as the same class of bug.)
Checking `sessions`/`status`/`stuck` and seeing nothing busy does **not** mean nothing is stuck — the
only reliable signal is a pending permission, and that lives in a different endpoint entirely.

**Discovery is project-scoped — the same trap as `/session` and `/session/status` above.** A bare
`GET /permission` only returns permissions in the server's own default project. Confirmed live on opencode v1.17.9: it
returned `0` while four sessions in other projects sat frozen waiting for approval. You must
enumerate `GET /project` (skip the synthetic `/` "global" entry) and fan out one scoped
`GET /permission` per worktree — anything less silently misses frozen sessions:

```bash
# 1. Enumerate real projects (skip worktree == "/")
curl -s -u "opencode:$OPENCODE_SERVER_PASSWORD" "$OC_URL/project" | jq -r '.[] | select(.worktree != "/") | .worktree'

# 2. One scoped GET per worktree — repeat for each line from step 1
curl -s -u "opencode:$OPENCODE_SERVER_PASSWORD" --get \
  --data-urlencode "directory=/Users/engineer/workspace/backtest" "$OC_URL/permission"

# x-opencode-directory header works identically for discovery, if you prefer headers to query params:
curl -s -u "opencode:$OPENCODE_SERVER_PASSWORD" \
  -H "x-opencode-directory: /Users/engineer/workspace/backtest" "$OC_URL/permission"
```

Each pending permission looks like this (both `metadata.command` and `metadata.description` are
frequently absent — handle missing fields):

```json
{"id":"per_...","sessionID":"ses_...","permission":"external_directory",
 "patterns":["/tmp/*"],
 "metadata":{"command":"...","description":"...","directories":["/tmp"],"patterns":["/tmp/*"]},
 "always":["/tmp/*"],
 "tool":{"messageID":"msg_...","callID":"toolu_..."}}
```

### Replying — which route actually works

| Route | Scope | Reliability |
|---|---|---|
| `POST /session/{sessionID}/permissions/{permissionID}` | session-ID-scoped | **Reliable** — works regardless of project scoping. Use this. |
| `POST /permission/{requestID}/reply` | server's own default project only | Unreliable — `404 PermissionNotFoundError` outside that scope. `?directory=` and the header do **not** fix it. Fallback only. |

Body: `{"response":"once"|"always"|"reject"}` on the reliable route, vs.
`{"reply":"once"|"always"|"reject","message"?:"..."}` on the fallback (note the different key —
`response` vs `reply` — and that only the fallback accepts a `message`). A `404` on either route
usually just means the permission was already resolved or expired — new permissions arrive
continuously, so races are normal. Treat it as "already gone," not a hard failure worth retrying.

### Preferred path: `opencode-cli`

```bash
opencode-cli permissions --all-projects          # find every frozen request, fleet-wide
opencode-cli permissions --all-projects --json    # machine-readable

opencode-cli approve per_XXXX                     # --response once (default), looks up sessionID for you
opencode-cli approve per_XXXX --response reject
opencode-cli approve per_XXXX --session ses_XXXX  # skip the lookup if you already know the session
opencode-cli approve --all                        # drain the whole queue: re-scans after each pass
                                                   # (stop at 0 pending or 3 passes) since new
                                                   # permissions keep arriving mid-drain
```

`permissions` columns: `project, id, session, type, patterns, what` (`what` = `metadata.description`,
falling back to a truncated `metadata.command`, else `-`). `approve` always replies via the
session-scoped route and reports `404` as "already resolved" rather than an error; exit code is
non-zero only on a real failure. `--directory` narrows both the lookup and `--all` to one project;
omit it and `approve` fans out across every project, same as `permissions --all-projects`.

Fallback (no `bun` on the host, or an endpoint the CLI doesn't wrap):

```bash
curl -s -u "opencode:$OPENCODE_SERVER_PASSWORD" -X POST \
  "$OC_URL/session/$SID/permissions/$PERMISSION_ID" \
  -H 'Content-Type: application/json' -d '{"response":"once"}'
```

### What to approve vs reject

| Approve | Reject |
|---|---|
| Reads (file/network/search) | Anything that deletes data |
| Builds, tests, lint/typecheck | Force-pushes |
| Writes scoped to `/tmp` or the project workspace | Touches production (deploy, prod DB, prod infra) |
| | Spends money (paid API calls beyond trivial, purchases) |
| | Exfiltrates secrets (uploads/pastes to a third-party service) |

A command that would echo secret bytes into the transcript (e.g. printing an env var to debug it) —
approve `once` with a correction message telling the agent to stop printing secrets, never
`always`. `always` on a secret-echoing pattern blanket-approves every future occurrence too, which
compounds the leak instead of stopping it.

## Setup

`opencode-cli` is a self-contained `bun` script, no install step needed:

```bash
# already on PATH if ~/.local/bin is on PATH:
opencode-cli health

# otherwise use the absolute path:
~/.agents/skills/opencode/bin/opencode-cli health
```

Location: `~/.agents/skills/opencode/bin/opencode-cli` (symlinked from `~/.local/bin/opencode-cli`).
Requires `bun` on PATH. Every subcommand supports `--json` for machine-readable output; default is
human-readable. All requests time out at 10s except sync `send` (300s). On connection failure or
HTTP error, it prints a clear message to stderr and exits non-zero — check `$?` in scripts.

### Why a dedicated CLI instead of the upstream `opencode` binary

The forked `opencode` repo's own CLI (`packages/opencode/src/cli`) does **not** offer general remote
session control: `opencode session list/delete` only reads **local** on-disk state (no `--hostname`/
`--port`/remote flags at all), and `opencode run --attach <url>` can attach to a remote server and
send one prompt, but has no list/status/abort/delete/stuck-detection/children/diff. `opencode-cli`
fills that gap without patching the fork (keeps the fork clean of skill-tooling patch burden).

## Connection & Auth

| Setting | Env var | Default |
|---|---|---|
| Server URL | `OPENCODE_URL` | `http://127.0.0.1:4096` |
| Basic-auth password | `OPENCODE_SERVER_PASSWORD` | (none — unauthenticated) |
| Basic-auth username | `OPENCODE_SERVER_USERNAME` | `opencode` |

`~/.env.d/opencode.env` is auto-sourced if present (already-exported env vars win). Never print
`OPENCODE_SERVER_PASSWORD`'s value in output or logs.

To control a remote server, override the URL for one call:

```bash
OPENCODE_URL=http://100.68.120.26:4096 opencode-cli sessions --main --recent 24
```

## Supervisor Workflow (the golden path)

The loop for a supervisor checking on delegated work:

```
sessions --all-projects --main --recent H  →  stuck --all-projects --recent H  →  show <sid>  →  judge  →  send <sid> --async "…"
        (what's out there, everywhere)              (idle + snippet)             (full context) (you)     (push it forward)
```

```bash
# 1. What main sessions have moved recently? --all-projects: a supervisor's delegated work is
#    almost never all in one project directory — see "Multi-project scoping" above.
opencode-cli sessions --all-projects --main --recent 4

# 2. Of those, which are idle (not busy) right now, with a snippet of their last word?
opencode-cli stuck --all-projects --recent 4

# 3. Snippet looks ambiguous or cut off — pull full recent history for that session
#    (show/send/etc. don't need --directory even for a session found via --all-projects —
#    they resolve by session ID globally)
opencode-cli show ses_06c0ee4bfffeePqCPheEfxElmx --limit 10

# 4. Judged stuck (see heuristics below) — nudge it forward asynchronously (fire-and-forget,
#    does not spend your own turn waiting on it)
opencode-cli send ses_06c0ee4bfffeePqCPheEfxElmx "Continue: finish the CTA link fix and confirm CI is green." --async
```

`stuck` only *surfaces candidates* (idle main sessions + last-assistant snippet) — judging
stuck-vs-done is still on you, using the heuristics below. Never run bare `send` (sync) as a
default — it blocks up to 300s waiting for a full reply and spends real tokens; use `--async`
unless you specifically need the reply inline.

## Command Reference

| Command | Purpose |
|---|---|
| `health` | Check server health/version |
| `projects [--json]` | List all projects: id, worktree, vcs |
| `sessions [--main] [--recent H] [--directory <path>\|--all-projects] [--json]` | List sessions: id, project, title, directory, updated, status |
| `status [--directory <path>]` | Raw `/session/status` for **one project** (busy/retry/fallback only; no `--all-projects` on this command — use `sessions --all-projects` for a fleet-wide busy view) |
| `stuck [--recent H] [--directory <path>\|--all-projects] [--json]` | Idle **main** sessions + last-assistant-text snippet (300 chars) |
| `permissions [--directory <path>\|--all-projects] [--json]` | List pending permission requests: project, id, session, type, patterns, what |
| `approve <permissionID>\|--all [--response once\|always\|reject] [--session <sid>] [--directory <path>] [--json]` | Reply to permission request(s) — see [Permission requests](#permission-requests--unblocking-frozen-sessions) above |
| `show <sid> [--limit N] [--json]` | Last N messages (role + text), default N=20 |
| `send <sid> "<text>" [--async] [--model p/m] [--json]` | Send a prompt |
| `new "<title>" [--directory <path>] [--json]` | Create a session, prints its id |
| `abort <sid>` | Abort a running session |
| `delete <sid>` | Delete a session |
| `children <sid> [--json]` | List child sessions of a parent (auto-scopes to parent's project) |
| `diff <sid> [--json]` | Session file diff |

`--directory` and `--all-projects` are accepted by every command (see Multi-project scoping above)
but only change behavior for list/status/create — it's a harmless no-op on `show`/`send`/`abort`/
`delete`/`children`/`diff`, which resolve by session ID globally.

### `sessions` — real example output (trimmed)

```
$ opencode-cli sessions --main --recent 48
ID                              TITLE                                     DIRECTORY        UPDATED                   STATUS
------------------------------  ----------------------------------------  ---------------  ------------------------  ------
ses_06c0ee4bfffeePqCPheEfxElmx  SEO blog posts for agentlabs.cc: AI rep…  /Users/engineer  2026-07-24T18:46:03.749Z  idle
ses_06b94d7a9ffeK2XB8HM8tN95On  Play Billing Library 9.x upgrade for My…  /Users/engineer  2026-07-24T18:44:03.479Z  idle
ses_06cd39f0affefkViEcqplRuPez  SEO product pages for agentlabs.cc: bui…  /Users/engineer  2026-07-24T18:42:28.875Z  idle
```

`--json` gives full (untruncated) `title`/`directory` plus `parentID` and boolean `busy` per session
— use it when you need to feed the result to another tool rather than read it.

### `sessions --all-projects` — real example output (trimmed)

The single-project example above only ever sees one directory. Same server, `--all-projects` added,
same moment in time:

```
$ opencode-cli sessions --all-projects --main --recent 4
ID                              PROJECT                   TITLE                                     DIRECTORY                       UPDATED                   STATUS
------------------------------  ------------------------  ----------------------------------------  ------------------------------  ------------------------  ------
ses_06a7fc1a0ffe2SHt6rOkAT05IK  …orkspace/KineticAiCoach  KineticAiCoach product improvement cycl…  …neer/workspace/KineticAiCoach  2026-07-24T19:05:06.500Z  idle
ses_07072a37effeF158IHjxb68ET1  …r/workspace/vibebrowser  SVG OG images to PNG for social preview…  …ngineer/workspace/vibebrowser  2026-07-24T19:05:04.311Z  idle
ses_07281084dffeQmRnBdC757pDl5  …orkspace/AgentPodMobile  Production readiness for AI Studio app …  …neer/workspace/AgentPodMobile  2026-07-24T19:04:28.349Z  idle
ses_06a7fc189ffebfAPop6hWwVsGO  …neer/workspace/backtest  Crypto daily discussion                   …s/engineer/workspace/backtest  2026-07-24T19:02:23.634Z  idle
...(24 more, across 8 projects total: KineticAiCoach, vibebrowser, AgentPodMobile, backtest,
    OpenClawBot, agents-supervisor, TaroAiScanner, opencode-mobile)
```

28 main sessions across 8 projects, all invisible to the plain `sessions --main --recent 4` call.

### `stuck` — real example output (trimmed to one entry)

```
$ opencode-cli stuck --recent 72
ses_06cd39fd7ffeKwt7pxHjbmBTXs  GitHub Actions workflow for signed APK release automation  (updated 2026-07-24T08:56:58.394Z)
    (assistant message has no text parts — tool-only turn)
```

That last one is a real edge case worth knowing: a session whose last assistant turn was
tool-only (no closing text part) prints that placeholder instead of an empty string — treat it
like an incomplete-signal (see heuristics) and pull `show` for the full picture before deciding.
With `--all-projects`, each row gets a `[project]` tag instead:

```
$ opencode-cli stuck --all-projects --recent 4 | head -6
ses_06a7fc1a0ffe2SHt6rOkAT05IK  [/Users/engineer/workspace/KineticAiCoach]  KineticAiCoach product improvement cycle execution  (updated 2026-07-24T19:05:06.500Z)
    Confirmed the activation gap. Events exist for `sign_in_success` → `program_generated` → ...

ses_07072a37effeF158IHjxb68ET1  [/Users/engineer/workspace/vibebrowser]  SVG OG images to PNG for social preview fix  (updated 2026-07-24T19:05:04.311Z)
    The root cause is already thoroughly documented (3 substantive comments converging on H1)...
```

### `show` — real example output (trimmed to one message)

```
$ opencode-cli show ses_06b695cd2ffe3sGpVIVaI4yyJM --limit 2
--- assistant msg_f9496a3bf001bQ3G5qqy4XVhIF (2026-07-24T14:45:28.128Z) ---
I'll delegate this to a subagent to execute end-to-end.

--- assistant msg_f949d4f93001gFCeyEidHxHBMa (2026-07-24T14:52:45.331Z) ---
Done. AAB built + signature verified against v3.
...
```

### `send` / `new` / `abort` / `delete` / `children` / `diff`

```bash
# Create + push work to a session asynchronously (task handoff pattern)
SID=$(opencode-cli new "Fix canary Unknown error")
opencode-cli send "$SID" "Read handoff.md and follow the instructions to investigate and fix the issue." --async

# Model override — providerID/modelID, split on the FIRST slash (modelID may itself contain slashes)
opencode-cli send "$SID" "Review this code" --model github-copilot/claude-opus-4.8

# Housekeeping
opencode-cli children ses_06b695cd2ffe3sGpVIVaI4yyJM   # subagent sessions spawned from this one
opencode-cli diff ses_06b695cd2ffe3sGpVIVaI4yyJM       # file changes made in this session
opencode-cli abort "$SID"
opencode-cli delete "$SID"
```

Every mutating command (`new`/`send`/`abort`/`delete`) fails loudly and non-zero on a bad session id
— e.g. `send` against a deleted/nonexistent session returns `HTTP 404 ... Session not found` before
any model is invoked, so a failed handoff never silently burns tokens.

## Session Hierarchy: Main vs Child

Sessions have a `parentID` field. A **main session** has `parentID: null` (JSON: `null`, CLI table:
blank). A **child session** (spawned by a subagent via the Task tool) has `parentID` set to its
parent's id. Always default to `--main` when scanning — child sessions are managed by their parent
and should not be acted on independently.

```bash
opencode-cli sessions --main               # top-level sessions only
opencode-cli children ses_XXX               # children of one specific parent
```

## Stuck vs Complete Heuristics

`opencode-cli stuck` finds idle main sessions and hands you a snippet — **you** still judge
stuck-vs-done from it (or from `show` if the snippet is ambiguous):

**Signals a session is stuck** (agent stopped mid-task):
- Last text ends mid-sentence ("Dashboard confirms:", "Let me capture...")
- Last text says "Let me..." but no follow-up action occurred
- Session has 0 messages (empty container — check if children completed instead)
- Last assistant turn was tool-only, no closing text (`stuck` prints a placeholder for this)
- Last message mentions a timeout/error but no resolution
- Idle with a **tool-only final turn and no pending permission** — this is the most common silent
  stall. `permissions` returning `(none)` rules out the permission freeze, so the agent simply
  stopped. A `send --async` restating the concrete remaining steps reliably restarts it; a bare
  "continue" often does not, because the agent has lost the thread of what "done" means.

**Signals a session completed normally:**
- Last text contains a summary/report, scores, "done", "complete", pass/fail results
- Last text is a final answer to the user's question

## Task Handoff Pattern

To hand off a task to a remote OpenCode instance (the remote agent has no shared memory — include
full context in the prompt):

```bash
OPENCODE_URL=http://remote-host:5551 opencode-cli new "Fix canary Unknown error"
# → prints session id, e.g. ses_XXX
OPENCODE_URL=http://remote-host:5551 opencode-cli send ses_XXX \
  "Read handoff.md and follow the instructions to investigate and fix the issue." --async
```

Monitor it later with `sessions --main --recent` / `stuck` / `show` against the same `OPENCODE_URL`.

### When the HTTP execute path itself is broken — diagnose first, SSH + tmux as fallback

**Diagnose before falling back.** Prompt dispatch breaks in at least three distinct ways, and only
one of them justifies abandoning HTTP. Check in this order:

| Symptom | Cause | Fix |
|---|---|---|
| **Every** in-flight session aborts at the *same instant*, then every new prompt fails immediately and the session flips straight back to `idle` | server-side fiber-scope interrupt. Log shows `prompt_async failed ... cause=Cause([Interrupt(<n>)])` with the **same** `<n>` for every session, and earlier `error=Aborted` lines sharing one `run=` id. The `serve` process itself is still up (check `ps -o etime`) and `health` returns OK, so nothing looks wrong from outside | `systemctl --user restart opencode-serve.service`. Confirmed live: 7 concurrent sessions all aborted at 18:45:11 with `Interrupt(43767)`, every subsequent prompt inherited it, restart fixed it instantly. Re-send each session a resume prompt afterwards — they do **not** auto-resume |
| `POST /session/:id/message` → **500 UnknownError** with a `ref`, session *create* still works | server DB schema drift — grep the server log for `SQLiteError: no such column: …` (seen live: `replacement_seq` on `v1.17.17-10-gaab0f9dce-dirty`). A `systemctl restart` does **not** fix it | rebuild/redeploy the server binary+DB together, or have the host owner recover it. Once recovered, HTTP works normally — do not permanently switch to tmux |
| CLI-started runs work but the **web UI shows no sessions** | `opencode run` (CLI) and `opencode serve` are writing to **different databases** on the same host — e.g. `~/.local/share/opencode/opencode-dev.db` vs `opencode.db`. Common on `-dev`/`-dirty` builds | if the sessions must be visible/steerable in the UI, use the HTTP API, not the CLI. Check with `ls -t ~/.local/share/opencode/*.db` |
| HTTP returns 2xx, session **never goes busy**, `show` stays at 0 messages | genuine prompt-dispatch no-op (below) | SSH + tmux fallback |

Cost of guessing wrong: an entire session's work run via CLI is invisible to whoever is watching
the web UI, and looks like nothing was delegated at all.

**Sync `POST /session/:id/message` blocks for the whole turn.** A long task will exceed any sane
client timeout — that is expected, not a failure, and the prompt still runs. Use
`send --async` (or `/session/:id/prompt_async`) for handoffs and poll with `sessions`/`show`.

The genuine no-op case: on some deployments **prompt delivery over HTTP silently no-ops**:
`send <sid> "..." --async`
returns success (`queued async prompt for session ...`, HTTP 2xx) and `new`/`show`/`status` all work
fine, but the session never executes — polling `status`/`show` for 20-25s afterward shows the
session never goes busy even once, `show` stays at 0 messages, and (on servers exposing the newer
`/api/*` surface) `/api/session/{id}/wait` returns 503. This is **not** an auth/routing/CLI problem —
`opencode-cli`'s own request succeeded; the server just never dispatched the prompt to a model. Root
cause not further isolated (headless `serve` process vs. an interactively-authenticated `opencode`
process on the same box are two different things — this may be a provider-session/auth gap specific
to the headless one). Confirm it is genuinely this case (session never goes busy, 0 messages) and
not one of the two rows above, then use the pattern below, which bypasses `serve`'s prompt dispatch
entirely and is confirmed to have produced real merged PRs. **Prefer HTTP whenever it works** —
tmux runs are invisible in the web UI and cannot be steered mid-flight with `send`.

```bash
# 1. Write the task brief locally, then ship it to the box
scp brief.md azureuser@100.108.64.76:~/

# 2. SSH in and run it inside a DETACHED tmux session so it survives your SSH disconnecting.
#    Never reuse or kill an existing tmux session you didn't start (list first: tmux ls).
ssh azureuser@100.108.64.76 '
  tmux new-session -d -s task-$(date +%s) \
    "cd ~/workspace/OpenClawBot && opencode run \"\$(cat ~/brief.md)\" | tee -a ~/brief.run.log"
'

# 3. Check back later by tailing the log or re-attaching, not by polling the HTTP API for this task
ssh azureuser@100.108.64.76 'tail -n 50 ~/brief.run.log'
```

`opencode-cli`/HTTP polling (`sessions`, `stuck`, `show`) still works fine for *reading* state on
these hosts — it's specifically prompt dispatch that's broken. If `opencode-cli sessions` shows a
session created this way, its messages/cost will populate normally once `opencode run` finishes;
you just can't have *started* it over HTTP.

## Fallback: Raw REST API Reference

Use this only for endpoints `opencode-cli` doesn't wrap (fork, slash commands, shell, file search,
worktrees/workspaces), or on a host without `bun`. Default `$OC_URL`: `http://127.0.0.1:4096`; add
`-u "$OPENCODE_SERVER_USERNAME:$OPENCODE_SERVER_PASSWORD"` when auth is set.

**Don't copy paths from the web UI's browser devtools Network tab.** Newer `opencode serve` builds
additionally expose a second, parallel API surface under `/api/*` (e.g. `/api/session`,
`/api/health`) — that's what the *web UI's own frontend* calls, and its responses are wrapped in a
`{"data": ...}` envelope, unlike everything below. Both surfaces are real and both work; they are
not a case of "the API moved." `opencode-cli` and every path in this reference target the
**unprefixed** surface (`/session`, `/project`, `/global/health`, ...), confirmed live against
`100.108.64.76` v`0.0.0-dev-202608120305`: unprefixed routes return raw arrays/objects, `/api/*`
routes return `{"data": [...]}`. If your hand-rolled curl+jq only "worked" under `/api/*`, that's a
sign you pasted a devtools request rather than following this doc — switch to `opencode-cli` or the
unprefixed paths below.

### Global
| Method | Path | Description |
|--------|------|-------------|
| GET | `/global/health` | Health + version |
| GET | `/global/event` | SSE event stream |

### Projects
| Method | Path | Description |
|--------|------|-------------|
| GET | `/project` | List all projects: `[{id, worktree, vcs?, time, sandboxes}]` |
| GET | `/project/current` | Current project (given `?directory=`, else server default) |

### Sessions
Every row below also takes `?directory=<abs path>` — **required** on `GET /session` and
`GET /session/status` to see anything outside the server's default project (see Multi-project
scoping); a no-op on the session-ID-scoped rows.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/session` | List sessions **in one project** (default: server's own) |
| POST | `/session` | Create session `{title?, parentID?}` — in `?directory=`'s project if given |
| GET | `/session/status` | Status of all non-idle sessions **in one project** |
| GET | `/session/:id` | Get session details |
| DELETE | `/session/:id` | Delete session |
| POST | `/session/:id/abort` | Abort running session |
| POST | `/session/:id/fork` | Fork at message `{messageID?}` |
| GET | `/session/:id/children` | List child sessions |
| GET | `/session/:id/diff` | Get session diff |

### Messages
| Method | Path | Description |
|--------|------|-------------|
| GET | `/session/:id/message` | List messages `?limit=N` |
| POST | `/session/:id/message` | Send message (sync, waits for full reply) |
| POST | `/session/:id/prompt_async` | Send message (async, 204 immediately) |
| POST | `/session/:id/command` | Execute slash command |
| POST | `/session/:id/shell` | Run shell command |

Message body: `{ parts: [{type:"text", text:"..."}], model?: {providerID, modelID}, agent?, system?, tools? }`.
**Note:** `model` is an object `{providerID, modelID}`, not a string.

### Files & Search
| Method | Path | Description |
|--------|------|-------------|
| GET | `/find?pattern=<pat>` | Search text in files |
| GET | `/find/file?query=<q>` | Find files by name |
| GET | `/find/symbol?query=<q>` | Find workspace symbols |
| GET | `/file?path=<p>` | List directory |
| GET | `/file/content?path=<p>` | Read file content |

### Other
| Method | Path | Description |
|--------|------|-------------|
| GET | `/provider` | List providers |
| GET | `/agent` | List agents |
| GET | `/config` | Get config |
| GET | `/mcp` | MCP server status |
| GET | `/doc` | OpenAPI 3.1 spec |

### Worktrees / Workspaces (experimental)
| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/experimental/worktree?directory=<repo>` | List / create worktree |
| DELETE | `/experimental/worktree?directory=<repo>` | Remove worktree `{directory}` |
| GET/POST | `/experimental/workspace` | List / create workspaces |
| DELETE | `/experimental/workspace/:id` | Delete workspace |
