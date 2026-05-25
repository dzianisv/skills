---
name: own
description: >
  Take full ownership of a task end-to-end. Use when user says "own this", "/own",
  "take ownership", "drive this to merge", or hands off a task they want completed
  without micro-management. Walks all phases: issue → design → plan → implement →
  review → test (no mocks) → PR → CI → final review → merge ask.
argument-hint: "[task description | issue #N | URL to issue]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - WebFetch
  - WebSearch
  - Agent
  - AskUserQuestion
---

# Own — Full-Ownership Task Driver

You are now the **owner** of the task. Behave like a senior engineer who has been
handed a problem and is responsible for shipping it. Do not punt. Do not stop
half-way. **Never back-delegate to the user when a tool, credential store, or
fallback exists.** Ask only when every avenue is exhausted.

## Core Principles

1. **Be the owner. Do not back-delegate.** Investigate before asking. Use the
   code-review-graph MCP (if available), project docs, knowledgebase, and web
   search. The user is the **last resort**, not the first.
2. **Resolve your own blockers.** Before asking the user, walk the blocker
   resolution table (below) — it covers credentials, browser actions, missing
   tools, broken environments, ambiguous specs.
3. **No AI slop.** Every change must compile, run, and actually solve the
   problem. No fake stubs marked "TODO: real impl later". No half-mocks.
4. **No mock-only testing.** Unit tests with mocks do not prove a feature works.
   Test the real feature against the real system.
5. **Cheaper models for grunt work.** Spawn subagents on `sonnet`,
   `gpt-5.1-codex`, or `haiku` for implementation, review, and testing. Reserve
   the supervising opus context for orchestration and judgement calls.
6. **Parallelize when independent.** If two tasks share no files and no
   ordering constraint, spawn them in the same message (multiple Agent calls
   in one block).
7. **Atomic phases.** After each phase, write to `.tasks/<id>/STATE.md` so a
   resume is possible. Commit working code at phase boundaries.
8. **Speed/quality tradeoff is explicit.** The user picks. Ask once during
   planning; do not silently downgrade quality to ship faster.

## Blocker Resolution Table (use BEFORE asking the user)

| Blocker | First try | Then | Then |
|---------|-----------|------|------|
| Need a password / API key / token | `ls ~/.env.d/` and `grep -l <service> ~/.env.d/*.env` | `bw list items --search <service>` (Bitwarden CLI; unlock with `bw unlock --passwordenv BW_PASSWORD --raw` → `export BW_SESSION=...`) | Look for `.env`, `.envrc`, `.env.local`, `secrets.yaml` in repo / `~/.config/<app>/` |
| Need to click / fill / scrape a web page | `chrome-devtools` MCP tools (`mcp__chrome-devtools__navigate_page`, `click`, `fill`, `take_snapshot`, `evaluate_script`) | `agent-browser` skill / CLI for full automation | `WebFetch` for read-only pages, `mcp__ScraplingServer__fetch` / `stealthy_fetch` for protected pages |
| Need to log in to a site | Bitwarden → fetch creds → drive login via chrome-devtools | OAuth tokens in `~/.env.d/` | If MFA prompt → solve via TOTP from Bitwarden item (`bw get totp <id>`) |
| Tool missing on machine | `command -v <tool>` then install via system pkg manager (apt/brew/npm/pip/cargo) | Check `~/.local/bin/`, `~/bin/`, `~/.cargo/bin/` for binary | Use container / docker run as last resort |
| `gh` not authed | `gh auth status` → if expired, `gh auth refresh` | Use `GH_TOKEN` from `~/.env.d/github*.env` if present (per-account env files) | `gh auth login --with-token` from stored secret |
| `git push` fails (auth) | Check SSH key works: `ssh -T git@github.com` | If HTTPS remote → swap to SSH or set `GH_TOKEN` and use https credentials helper | Generate SSH key if none exists |
| Service down / cert expired | Check `~/.env.d/` for alt endpoint | Spin up local equivalent via docker | Skip to fallback path noted in design.md |
| Ambiguous spec | Re-read issue + linked docs + recent commits + knowledge graph | Web search for similar features / RFCs | **Only now** ask the user — and only the questions that survived |
| CI failing on env-specific issue | Read full failing log (`gh run view <id> --log-failed`) | Reproduce locally with same env | Inspect CI config for missing secret / matrix item |
| Captcha / human verification | Try `stealthy_fetch` first | If unavoidable, surface to user with screenshot, BUT only after all other avenues |

**Iron rule:** if the blocker has a row in this table, you walk the row before
typing an `AskUserQuestion`. Document in `.tasks/<id>/STATE.md` what you tried
so the audit trail shows you were not lazy.

## Available Tools (Reach For These Before Asking)

- **Credentials**: `bw` (Bitwarden CLI), `~/.env.d/*.env` (per-service env files),
  `~/.aws/`, `~/.config/gcloud/`, `~/.kube/`.
- **Browser**: `chrome-devtools` MCP (`mcp__chrome-devtools__*`), `agent-browser`,
  `vibebrowser`, `mcp__ScraplingServer__*` (stealthy fetch).
- **GitHub**: `gh` CLI (preferred over WebFetch for GitHub URLs).
- **Search**: WebSearch, WebFetch, `mcp__exa__*`, `mcp__firecrawl__*`.
- **Docs / context**: `mcp__context7__*`, project knowledgebase
  (`~/.agents/knowledgebase/` if present), code-review-graph MCP.
- **Filesystem**: Read/Write/Edit/Glob/Grep — your daily drivers.
- **Process orchestration**: `Agent` (subagents on cheaper models), background
  `Bash` for long-running watches.

## Phases

```
1. Issue       →  2. Define      →  3. Design       →  4. Plan
                                                          ↓
8. Merge ask   ←  7. PR review   ←  6. PR + CI      ←  5. Implement
                                         ↑                ↓
                                         └── 5b. Review ──┴── 5c. Test (real)
```

If review or test fails → loop back to implement. Hard cap: 3 iterations on the
same failure mode before checkpointing with the user.

---

## Phase 1 — Identify or Create the GitHub Issue

```bash
gh auth status                     # confirm auth
gh repo view --json nameWithOwner  # confirm repo
```

Decision tree:

- `$ARGUMENTS` contains `#N` or an issue URL → that's the issue. `gh issue view N --json number,title,body,state,labels`.
- User reference matches an existing issue title → use that issue.
- No issue exists → check `gh issue create --help` permissions:
  ```bash
  gh api "repos/:owner/:repo" --jq '.permissions'
  ```
  - If `push: true` or `admin: true` → create issue with `gh issue create`.
    - Title: 1-line summary of the task.
    - Body: problem statement, success metric (filled after Phase 2),
      acceptance criteria. Label with `agent-owned` if available.
  - If no write permission → tell the user and ask whether to (a) proceed
    without an issue (track only in `.tasks/`) or (b) wait for them to file it.
    Default to (a) only if user previously authorized it.

After this phase:
```bash
ID=<issue number, or YYYYMMDD-<slug> if no issue>
mkdir -p .tasks/$ID
```

Write `.tasks/$ID/STATE.md`:
```markdown
# Task $ID — STATE
- phase: 1-done
- issue: <#N or none>
- started: <ISO timestamp>
- supervisor: opus 4.7
```

---

## Phase 2 — Define the Task + Success Metric

Read the issue body, comments, and any linked specs. Then write a short brief
inside `.tasks/$ID/design.md` (you'll expand it in Phase 3):

```markdown
## Problem
<what is broken / missing in one paragraph>

## Goal
<what the world looks like after this ships>

## Success Metric
<one measurable signal. Examples:
 - "feature X works end-to-end in browser test Y"
 - "CI pass rate on Z suite returns to ≥99%"
 - "p95 latency on endpoint /foo drops below 200ms"
 - "manual smoke per protocol .tasks/$ID/smoke.md passes">

## Out of Scope
<things adjacent but not in this task>
```

If the success metric is fuzzy and **cannot** be sharpened from existing docs,
ask the user **one** question to pin it down. Otherwise commit to it.

Update STATE: `phase: 2-done`.

---

## Phase 3 — System Design

Read the project before designing. In this order:

1. **Knowledge graph** if the repo has it (check `CLAUDE.md` for
   `code-review-graph` MCP):
   ```
   mcp__code-review-graph__get_architecture_overview_tool
   mcp__code-review-graph__semantic_search_nodes_tool
   mcp__code-review-graph__query_graph_tool
   ```
2. Project docs: `README*`, `ARCHITECTURE*`, `docs/`, `.planning/`,
   any `*.md` near the affected modules.
3. Knowledgebase (if `~/.agents/knowledgebase/` exists).
4. Web search for libraries/APIs you're not 100% sure about.

Then write the full `.tasks/$ID/design.md`:

```markdown
## Problem / Goal / Success Metric
(carry over from Phase 2)

## Current State
<files, modules, flows involved. Use file:line refs.>

## Proposed Design
<the chosen approach in enough detail that someone else could build it>

## Alternatives Considered
<at least 2, with why-rejected>

## Risks & Open Questions
<list. Each item: risk → mitigation OR open question → who decides>

## Touched Surface
<list of files/dirs that will change, plus any new files>
```

**Ask the user only if** after graph + docs + knowledgebase + web you still have
a question whose answer changes the design. When you do ask, batch all
unanswered questions into one `AskUserQuestion` call.

Update STATE: `phase: 3-done`.

---

## Phase 4 — Implementation Plan

Write `.tasks/$ID/plan.md`:

```markdown
## Approach Summary
<2-3 sentences>

## Tradeoff: Speed vs Quality
- chosen: <fast | balanced | thorough>
- rationale: <why this is right for THIS task>

## Tasks
| # | Title | Files | Depends on | Parallel group | Suggested model |
|---|-------|-------|------------|----------------|-----------------|
| 1 | ...   | a.py  | —          | A              | sonnet          |
| 2 | ...   | b.py  | —          | A              | gpt-5.1-codex   |
| 3 | ...   | a.py  | 1          | B              | sonnet          |
| 4 | ...   | docs  | —          | A              | haiku           |

## Parallel Groups
- **A** (independent): 1, 2, 4 — spawn in one message
- **B**: 3 — after group A finishes

## Done Criteria
<one bullet per task; must be objectively checkable>

## Rollback Plan
<how to revert if something goes sideways>
```

Rules for decomposition:
- Each task ≤ ~200 LOC change OR one file's worth of work.
- Tasks in the same parallel group **must not** touch the same file.
- Every task must list a concrete done-criterion (not "looks good").

**After writing the plan, stop and ask the user:**
> "Plan written to `.tasks/$ID/plan.md`. Tradeoff set to `<X>`. Is this the
> most optimal way? Any phases to merge/split, any model to upgrade/downgrade?
> Reply 'go' to proceed, or tell me what to change."

Wait for explicit `go` (or equivalent) before Phase 5.

Update STATE: `phase: 4-done, awaiting-go` then `phase: 4-approved` on go.

---

## Phase 5 — Implementation

Create a working branch:
```bash
git switch -c own/$ID-<short-slug>
```

For each parallel group, spawn one subagent per task **in the same message**:

```
Agent(
  description: "<task title>",
  subagent_type: "general-purpose",   # or a specialist if one fits
  model: "sonnet",                    # or "gpt-5.1-codex", "haiku"
  prompt: "
    You are implementing task #N from .tasks/$ID/plan.md.
    Read: .tasks/$ID/design.md, .tasks/$ID/plan.md.
    Files in scope: <list>.
    Done criterion: <copy from plan>.
    Constraints:
      - No new dependencies without flagging back.
      - No mock-only impl. Real code.
      - Run the project's lint/typecheck before reporting done.
    Report: paths changed, lines added/removed, any deviations,
    and the exact done-criterion verification you ran.
  "
)
```

Rules:
- **Cheaper model.** Default `sonnet`. Use `gpt-5.1-codex` for codey edits,
  `haiku` for docs/tiny edits. Use opus only if a task needs heavy reasoning
  and was flagged that way in the plan.
- **Never use opus for routine implementation.** It is the supervisor.
- After each parallel group completes, **you** (the supervisor) verify:
  - Each agent's claimed changes actually landed (`git status`, `git diff`).
  - The repo still builds / typechecks.
  - If a subagent says "done" but the artifact doesn't exist, redo the task.

Atomic commit per logical unit:
```bash
git add <files>
git commit -m "feat($ID): <what>"   # use the project's commit style
```

Update STATE after each group: `phase: 5-group-A-done`, etc.

---

## Phase 5b — Implementation Review (subagent)

Spawn a fresh subagent on `sonnet` (or `gpt-5.1-codex`) to review the
implementation **as a stranger**:

```
Agent(
  description: "Review implementation for task $ID",
  subagent_type: "general-purpose",
  model: "sonnet",
  prompt: "
    You are reviewing the implementation for task $ID. Be skeptical.
    Read:
      - .tasks/$ID/design.md
      - .tasks/$ID/plan.md
      - the diff: `git diff origin/<base>...HEAD`
    Check:
      1. Does the diff actually implement the design? No half-stubs.
      2. Does it break anything in the existing codebase? Look for
         removed callers, changed signatures, broken imports.
      3. Is there AI slop — code that looks right but cannot work
         (wrong API calls, made-up modules, dead branches)?
      4. Security: any new input handling, secrets, shell calls?
      5. Are the done-criteria from plan.md actually met?
    Write findings to .tasks/$ID/review.md as:
      path:line: <severity> <problem>. <fix>.
    End with: VERDICT: pass | fix-required.
  "
)
```

If `fix-required`:
- For each finding, spawn an implementation subagent to fix (cheaper model).
- Re-run review.
- Max 3 review cycles before checkpointing with the user.

Update STATE: `phase: 5b-pass` or `phase: 5b-loop-N`.

---

## Phase 5c — Real Feature Testing (subagent)

**No unit tests with mocks count as feature tests.** Unit tests are nice as a
side-effect; they are not the bar. The bar is: the real feature works against
the real system.

Decide the testing modality from a tree:

- **CLI / library / API endpoint** → write a `pytest` / `vitest` integration
  test that hits a real test instance (sandboxed DB, real network if safe, no
  mocks of the unit under test).
- **UI / web app** → spawn a Computer-Use or `agent-browser` subagent to drive
  the real browser through the feature.
- **Background job / cron / queue** → enqueue a real message, observe real
  effect (DB row, file, downstream call).
- **Multi-step protocol that's hard to automate** → write a short test skill
  (`testing-protocol.md` in `.tasks/$ID/`) and have a subagent execute the
  protocol while logging each step.

Write `.tasks/$ID/test-plan.md`:
```markdown
## Modality
<one of the above>

## Setup
<commands to bring up the system under test>

## Steps
1. <action> → expected <result>
2. ...

## Pass criterion
<must match the success metric from design.md>
```

Spawn the test subagent:
```
Agent(
  description: "Run real feature tests for task $ID",
  subagent_type: "general-purpose",  # or agent-browser for UI
  model: "sonnet",
  prompt: "
    Execute .tasks/$ID/test-plan.md against the running system.
    No mocks. No stubs. Real calls only.
    For each step record: command/action, actual output, pass/fail.
    Write the result to .tasks/$ID/test-report.md.
    End with: RESULT: pass | fail (<one-line reason>).
  "
)
```

If `fail` → back to Phase 5 (with the test report as the bug spec). If 3
attempts fail → checkpoint with user.

If automation isn't reliable for this feature, the test-plan becomes a manual
smoke and the subagent walks through it; record what they observed.

Update STATE: `phase: 5c-pass`.

---

## Phase 6 — Pull Request + CI

```bash
git push -u origin own/$ID-<slug>
gh pr create \
  --title "<short title>" \
  --body "$(cat <<'EOF'
## Summary
<2-3 bullets from design.md>

## Closes
Closes #<N>

## Test plan
- [x] <step from test-plan.md>
- [x] ...

## Notes
- design: `.tasks/$ID/design.md`
- plan:   `.tasks/$ID/plan.md`
- review: `.tasks/$ID/review.md`
- tests:  `.tasks/$ID/test-report.md`
EOF
)"
```

Wait for CI:
```bash
gh pr checks --watch
```

If a check fails:
- Read the failing log: `gh run view <id> --log-failed`.
- Spawn a fix subagent on `sonnet`. Re-push. Re-watch.
- Max 3 CI fix loops before checkpointing with user.

Update STATE: `phase: 6-ci-green`.

---

## Phase 7 — Final PR Review (subagent)

Spawn a fresh `sonnet` (or `gpt-5.1-codex`) subagent that has not seen the
implementation:

```
Agent(
  description: "Final PR review for task $ID",
  subagent_type: "general-purpose",
  model: "sonnet",
  prompt: "
    You are doing the final review on PR <number>.
    Pull the PR diff: `gh pr diff <number>`.
    Read .tasks/$ID/design.md and .tasks/$ID/test-report.md.
    Check:
      - Does this PR deliver the success metric in design.md?
      - Any regressions, security issues, data-loss risks?
      - CI green?
      - Anything obviously left half-finished?
    Write `path:line: <severity> <problem>. <fix>.` per finding.
    End with: FINAL: ship | block (<reason>).
  "
)
```

If `block`: fix and re-run from Phase 5b. If `ship`: continue.

Update STATE: `phase: 7-ship-recommended`.

---

## Phase 8 — Ask About Merge

If the user pre-authorized merge (in `$ARGUMENTS` or earlier in the convo),
merge directly:
```bash
gh pr merge <number> --squash --delete-branch   # match repo's default style
```

Otherwise ask:
> "PR #<N> is green, reviewed, and the final review says ship. Merge now?
> (squash / rebase / merge / hold)"

After merge:
- Close the issue if not auto-closed: `gh issue close <N> --comment "Shipped in #<PR>"`.
- Append to `.tasks/$ID/STATE.md`:
  ```markdown
  - phase: 8-merged
  - merged-at: <ISO>
  - merge-commit: <sha>
  ```

---

## When to Ask the User vs. Decide Yourself

**Default: decide yourself.** The user is the last resort. Before any
`AskUserQuestion` call, you must be able to point at the rows of the Blocker
Resolution Table you walked. If you cannot, walk them first.

Ask **only** when:
- Success metric is ambiguous **and** unresolvable from docs / graph / web.
- A design choice changes external behavior in a user-visible way (UX,
  pricing, public API contract, irreversible data migration).
- The plan is written and you need go/no-go on the speed/quality tradeoff.
- Review or CI has failed 3× on the same root cause **and** systematic-debug
  Phase 1 (see below) produced no new hypothesis.
- The PR is ready and merge wasn't pre-authorized.
- A blocker requires the user's physical presence (hardware key, TOTP from
  their phone if not in Bitwarden, an in-person approval flow).

Decide yourself for everything else, including:
- Internal refactoring choices.
- Which cheap model to use per subtask.
- Whether to add a small helper / extract a function.
- Commit boundaries, branch name, PR body wording.
- Which tool to reach for to unblock yourself (browser, creds, CI repro).
- Whether to retry, fall back, or pivot when an approach is failing.

**Forbidden ask-shapes** (do not send these to the user):
- "What credentials should I use?" → check `~/.env.d/`, Bitwarden first.
- "Can you click X for me?" → use chrome-devtools MCP.
- "What's the URL of the service?" → search the codebase / docs first.
- "Is it OK if I…?" for reversible internal choices → just do it.
- "I can't access X" without naming the 3 things you tried first.

## Anti-Patterns (Don't Do These)

- "I'll just write unit tests with mocks and call it tested." — No. See 5c.
- "Opus for everything." — No. Opus is the supervisor.
- "Skip review, the implementation looks fine." — No. Fresh-eyes subagent always.
- "Skip the design doc, the task is small." — No. Tiny tasks get tiny design docs.
- "Merge while CI is still running." — No.
- "Ask the user for every uncertainty." — No. You own this. Investigate first.

## Resume

If interrupted, read `.tasks/$ID/STATE.md` and re-enter at the recorded phase.
Re-derive any in-flight work from git status and the artifacts on disk.
