---
name: agent-memory
description: Use when starting any task (retrieve relevant context) or finishing any task (persist discoveries). Also use when asked to remember, forget, or look up something from prior sessions.
---

# Agent Memory

## Overview

Persistent memory lives exclusively in `~/.agents/memory/`. Read the files before making any claim about prior state — never speculate about what they contain.

<memory_structure>
All files live in `~/.agents/memory/`:

| File | Purpose | Cap |
|------|---------|-----|
| `MEMORY.md` | Standing facts: env conventions, toolchain quirks, decisions | ~800 tokens |
| `USER.md` | User profile: preferences, style, things to avoid | ~500 tokens |
| `YYYY-MM-DD.md` | Session notes: task discoveries, open questions | Keep short |

`MEMORY.md` and `USER.md` load into every session — keeping them within cap avoids burning context on every turn.
</memory_structure>

---

## Before Every Task — Retrieve

<retrieval_steps>
1. Read `MEMORY.md` and `USER.md` in full (always small enough to cat whole) — if either doesn't exist yet, treat as empty, no prior state
2. Run BM25 search on dated files using terms relevant to this task
3. If `index.db` does not exist, skip step 2 — this is the first session
</retrieval_steps>

**BM25 search (ranked results):**
```bash
~/.agents/skills/agent-memory/search.py "your search terms"
```

**Quick grep fallback** (no index required):
```bash
rg -C 2 "keyword" ~/.agents/memory/
```

---

## After Every Task — Persist

<persistence_steps>
1. Write discoveries to `~/.agents/memory/YYYY-MM-DD.md`
2. If a standing fact changed, update `MEMORY.md` or `USER.md` — match a substring of the section and replace it
3. Rebuild the BM25 index — a stale index causes missed context on future searches
</persistence_steps>

**Save entries that are non-obvious and won't go stale:** root causes, workarounds, env constraints, one-line decisions with rationale, open questions you didn't resolve.

**Skip entries already readable in the codebase.** Saving config file contents or workflow steps creates duplicate state that drifts from the source of truth — read the file when needed instead.

<example>
Good MEMORY.md entry:
```
## Deploy pipeline
Self-hosted runners (not GitHub-hosted) — cache does NOT persist between runs.
Docker layer caching must be configured manually per workflow.
```

Bad MEMORY.md entry (skip — just duplicates the workflow file):
```
## GitHub Actions
Uses actions/setup-go@v4, actions/checkout@v3, runs go test ./...
```
</example>

**Rebuild index:**
```bash
~/.agents/skills/agent-memory/index.py
```

---

## Save Operations

Search for an existing entry before adding — duplicates drift and cause confusion. Match by substring, not full text.

- **Add** — append under a concise heading
- **Replace** — match a substring of the section, overwrite it
- **Remove** — delete entries that are stale or wrong

When a persistent file nears its cap, consolidate first: merge related entries, drop what's no longer true.

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Speculating about memory contents | Read the files first — never guess |
| Inventing memory locations like `kb/` or `notes/` | Only `~/.agents/memory/` exists |
| Skipping index rebuild after writing | Rebuild every time — stale index = missed context |
| Saving what's already in the codebase | Read the source file when needed instead |
| Adding a new entry when one already exists | Search first, update the existing entry |
