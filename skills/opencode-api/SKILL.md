---
name: opencode-api
description: Control OpenCode through the REST API exposed by opencode serve. Use when starting a server, listing sessions, sending prompts, streaming events, handling permission requests, and automating follow-up work from external systems.
---

# OpenCode REST API

Use this skill when you need reliable, scriptable control of OpenCode over HTTP.

Default OpenCode server base URL: `http://localhost:4096`.

Canonical docs: https://opencode.ai/docs/server/

## Quick Start

Start a local, protected server:

```bash
export OPENCODE_SERVER_USERNAME=opencode
export OPENCODE_SERVER_PASSWORD="change-me"
opencode serve --hostname 127.0.0.1 --port 4096
```

Basic API helper:

```bash
api() {
  curl -sS --fail \
    -u "$OPENCODE_SERVER_USERNAME:$OPENCODE_SERVER_PASSWORD" \
    -H 'Content-Type: application/json' "$@"
}
```

Health check:

```bash
api "http://127.0.0.1:4096/global/health"
```

## Core Flow

1. Check server health with `GET /global/health`.
2. List sessions with `GET /session`.
3. Create a session with `POST /session` if needed.
4. Send work with `POST /session/{id}/message` or `POST /session/{id}/prompt_async`.
5. Track progress via `GET /session/status` and SSE `GET /event`.
6. Resolve permission requests through `POST /session/{id}/permissions/{permissionID}`.

## Minimal Request Examples

Create a session:

```bash
api -X POST "http://127.0.0.1:4096/session" \
  -d '{"title":"billing-platform-service#761 follow-up"}'
```

Send a normal prompt (waits for response):

```bash
api -X POST "http://127.0.0.1:4096/session/SESSION_ID/message" \
  -d '{
    "parts": [
      {"type":"text","text":"Address unresolved PR feedback and summarize changes."}
    ]
  }'
```

Send async prompt (fire-and-track):

```bash
api -X POST "http://127.0.0.1:4096/session/SESSION_ID/prompt_async" \
  -d '{
    "parts": [
      {"type":"text","text":"Apply requested review updates and report status."}
    ]
  }'
```

Reply to permission request:

```bash
api -X POST "http://127.0.0.1:4096/session/SESSION_ID/permissions/PERMISSION_ID" \
  -d '{"response":"allow","remember":true}'
```

Stream events (SSE):

```bash
curl -N -u "$OPENCODE_SERVER_USERNAME:$OPENCODE_SERVER_PASSWORD" \
  "http://127.0.0.1:4096/event"
```

## API Surface You Will Use Most

- `GET /doc` - OpenAPI spec source of truth.
- `GET /session` - enumerate sessions.
- `GET /session/status` - status for all sessions in one call.
- `GET /session/{id}/message` - read conversation state.
- `GET /session/{id}/todo` - inspect tracked tasks.
- `POST /session/{id}/message` - synchronous prompt.
- `POST /session/{id}/prompt_async` - asynchronous prompt.
- `POST /session/{id}/abort` - cancel stuck work.
- `GET /session/{id}/diff` - inspect produced code changes.
- `GET /find`, `GET /find/file`, `GET /file/content` - pre-read context before prompting.

## Performance and Reliability Optimizations

1. Keep one long-lived server process per workspace to avoid repeated startup and warm-up.
2. Prefer SSE (`/event`) over tight polling loops for status changes.
3. Use `/prompt_async` for fan-out workflows; use `/session/status` for cheap centralized progress checks.
4. Pull context with `/find` and `/file/content` first; then send narrower prompts to reduce token usage.
5. Use stable session titles like `<repo>#<pr> <task>` to make future lookups deterministic.
6. Handle `permission.updated` events immediately to avoid idle stalls.
7. Use `query.directory` when driving multiple projects from one controller.
8. Reuse a keep-alive HTTP client instead of spawning short-lived `curl` in high-volume automation.

## Security Guardrails

- Default bind should stay `127.0.0.1`.
- Always set basic auth if the server is reachable by other processes or hosts.
- Keep CORS explicit and minimal (`--cors` only for trusted origins).
- If exposed remotely, put TLS and access control in front of OpenCode.

## Error Handling

- `400` usually means payload shape mismatch; verify against `/doc`.
- `404` usually means wrong session/message/permission ID.
- If a session appears stuck, call `/session/{id}/abort`, then post a refined follow-up prompt.

## Email-Driven Follow-Up Pattern

For PR-review automation:

1. Ingest actionable review emails from Gmail triage.
2. Extract `repo`, `pr_number`, and requested change.
3. Find or create session titled `<repo>#<pr_number> review-followup`.
4. Post follow-up via `/prompt_async`.
5. Watch `/event` for completion, permission, and error events.
6. Pull `/session/{id}/diff` and `/session/{id}/todo` for summary output.
