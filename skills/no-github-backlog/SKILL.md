---
name: no-github-backlog
description: Drain a GitHub issue backlog autonomously. Spawns isolated subagents per issue across 7 stages (investigate, implement, review, security-review, qa, fix, merge), logs every stage to backlog.csv. Use when user asks to clear, drain, close, or resolve an issue backlog.
argument-hint: [owner/repo] [optional filter, e.g. "state:open label:bug"]
allowed-tools: Bash(gh *) Bash(git *) Bash(mkdir *) Bash(printf *) Bash(date *) Bash(flock *) Bash(jq *) Read Write Edit Grep Glob
---

# no-github-backlog

Autonomous backlog drain. Main agent = orchestrator. Each stage = fresh subagent. Per-issue work is parallel; per-issue stages are sequential.

## Stop contract

Only stop condition: user explicitly says `STOP_GOAL` (or equivalent: "stop", "halt", "done for now").

- **Never** mark a run complete while new issues exist or in-flight stages remain.
- **Never** stamp `completed_at` in status.json mid-run — only on `STOP_GOAL`.
- After each batch drains, re-fetch the backlog (new issues may have opened) and loop.
- Do not pause, wrap up, or send a final summary while the goal remains active.

## Inputs

- `$REPO` — repo `owner/name` (e.g. `VibeTechnologies/VibeWebAgent`); first skill argument
- `$FILTER` — optional `gh issue list` flags (default: `--state open`); second skill argument

> **Note:** Orchestrator uses `$ISSUE` for the issue number internally. Templates receive `$ISSUE_NUMBER` as a substituted parameter — orchestrator sets `ISSUE_NUMBER=$ISSUE` when building each template prompt.

## Per-pipeline context variables

Orchestrator maintains these per issue being processed. Capture from `gh issue list` JSON and subagent results. Pass them to the CSV append (rule 7) on every stage exit.

| Variable | Source |
|---|---|
| `$ISSUE` | `gh issue list` JSON `.number` |
| `$ISSUE_TITLE` | `gh issue list` JSON `.title` |
| `$ISSUE_URL` | `gh issue list` JSON `.url` |
| `$STAGE` | Orchestrator — current stage name |
| `$DECISION` | Subagent JSON result field `decision` or `verdict` |
| `$REASON` | Subagent JSON result field `reason` or `findings` summary |
| `$SUBAGENT_TYPE` | Hardcoded per stage (`general-purpose`) |
| `$MODEL` | Hardcoded per stage (`sonnet`) |
| `$TEMPLATE` | Template filename, e.g. `investigate.md`; empty for orchestrator-only stages |
| `$PR_NUMBER` | IMPLEMENT result `.pr_number`; carry forward to subsequent stages |
| `$PR_URL` | IMPLEMENT result `.pr_url`; carry forward |
| `$CI_STATUS` | REVIEW result `.ci_status`; update at QA and MERGE |
| `$DURATION_S` | Wall-clock seconds: `$(( $(date +%s) - STAGE_START ))` |

Set `STAGE_START=$(date +%s)` immediately before each Agent spawn. Reset per stage.

## Setup / resume

Before fanning out, check for an unfinished prior run.

```!
REPO="${1:?'Usage: /no-github-backlog owner/repo [optional-filter]'}"
FILTER="${2:---state open}"
gh auth status --hostname github.com || { echo "ERROR: gh not authenticated"; exit 1; }
mkdir -p .agents/no-github-backlog
DEFAULT_BRANCH=$(gh repo view "$REPO" --json defaultBranchRef --jq '.defaultBranchRef.name' 2>/dev/null || echo "main")
[ -f .agents/no-github-backlog/backlog.csv ] || \
  printf 'date|run_id|issue|issue_title|issue_url|stage|decision|reasoning|subagent_type|model|prompt_template|pr_number|pr_url|ci_status|duration_s\n' \
  > .agents/no-github-backlog/backlog.csv

# Find any in-progress run (status.json missing completed_at).
RESUME_RUN=$(ls -t .agents/no-github-backlog/run-*.status.json 2>/dev/null \
  | xargs -I{} sh -c 'jq -e "select(.completed_at == null)" {} >/dev/null 2>&1 && echo {}' \
  | head -n1)

if [ -n "$RESUME_RUN" ]; then
  RUN_ID=$(jq -r .run_id "$RESUME_RUN")
  echo "RESUMING run $RUN_ID"
else
  RUN_ID=$(date -u +%Y%m%dT%H%M%SZ)
  printf '{"run_id":"%s","started_at":"%s","cycle":0,"queued":0,"running":0,"done":0,"failed":0,"quarantined":0,"completed_at":null}\n' \
    "$RUN_ID" "$(date -u +%FT%TZ)" > .agents/no-github-backlog/run-$RUN_ID.status.json
  echo "NEW run $RUN_ID"
fi
export RUN_ID
```

### Resume protocol (mandatory if `RESUME_RUN` non-empty)

A prior orchestrator session may have crashed, been `/compact`-ed, or had background subagents orphaned. The CSV + status file are the resume ledger. Before spawning **any** new subagent:

1. **Reconcile per issue.** For each issue in the backlog, compute `last_stage|last_decision` from `backlog.csv` (awk returns the last row for that issue, pipe-separated). Field positions: `$3=issue $6=stage $7=decision`.
   ```
   flock .agents/no-github-backlog/backlog.csv.lock \
     awk -F'|' -v iss="#$ISSUE" 'NR>1 && $3==iss {last_stage=$6; last_dec=$7} END {print last_stage "|" last_dec}' \
     .agents/no-github-backlog/backlog.csv
   ```
2. **Skip terminal states.** If `last_dec` ∈ {`close`, `triage`, `skipped`} for stage `investigate`, OR `last_stage=merge` AND `last_dec=merged`, OR any `last_dec=quarantine` → issue done, skip.
3. **Resume at next stage.** Map `last_stage|last_dec` to entry point:
   - `investigate|fix` → `implement`
   - `implement|fix` → **skip INVESTIGATE** (own PR exists); get PR number via:
     ```
     gh pr list --repo "$REPO" --state open --search "#$ISSUE in:body" \
       --json number,headRefName \
       | jq --arg pfx "fix/issue-${ISSUE}-" \
           '[.[] | select(.headRefName | startswith($pfx))] | .[0].number'
     ```
     Start at `review`.
   - `review|approve` → `security-review`
   - `security-review|approve` → `qa`
   - `qa|approve` → `merge`
   - `fix|fix` → `review` (fix was applied; full re-validation)
   - `*|reject` or `*|timeout` → restart that stage as `retry-1` (or `retry-2` if `retry-1` exists; else quarantine)
4. **Detect orphaned own PRs.** For issues where `last_stage=implement` AND `last_dec=fix`: **do not call INVESTIGATE** — it would find the harness's own branch and return `existing_pr` causing a false skip. Query the PR directly as shown in step 3, then enter at `review`.
5. **Clear orphaned harness tasks.** Run `TaskList` — any tasks tagged `no-github-backlog:` from the prior session whose `agentId` is no longer live are dead. TaskUpdate them to `cancelled` with reason `compact-orphan` so the index is clean before new fan-out.

If `RESUME_RUN` is empty, skip this section.

## Fetch backlog

```!
gh issue list --repo "$REPO" --json number,title,labels,url --limit 1000 $FILTER
```

## Orchestration rules

1. **Parallel fanout.** Spawn one INVESTIGATE subagent per issue in a single message (multiple Agent tool calls in one block). Cap concurrency at 10. Queue overflow waits for any in-flight slot to free before dispatching next.
2. **QA concurrency cap.** QA stage runs real services (docker-compose, DBs, test fixtures). Cap parallel QA subagents at **2** (port conflicts, RAM pressure, secret races). Override to 1 if repo requires a singleton service (e.g. shared cloud sandbox). Other stages stay at 10.
   **Enforcement:** maintain a `qa_in_flight` counter. Before spawning QA, if `qa_in_flight >= 2`, push issue to `qa_pending` queue and continue draining other stages. When a QA subagent returns (approve/reject/timeout), decrement `qa_in_flight` and dispatch next item from `qa_pending` if non-empty.
3. **Sequential per-issue gates.** Within an issue, stages run in order. Each stage = new Agent call (fresh context). Never reuse a subagent across stages.
4. **Hard merge gate.** Merge only if review=approve AND security=approve AND qa=approve AND CI=green. No exceptions.
5. **Full re-validation after FIX.** Any FIX commit invalidates prior approvals. After a fix lands on the PR branch, re-run REVIEW + SECURITY-REVIEW + QA in order (full pipeline from REVIEW onward), not just the stage that rejected. A QA-fix can introduce a security regression; a security-fix can break tests.
6. **Per-stage timeouts.** Kill + log `decision=timeout` if a subagent exceeds budget:

   | Stage | Wall-clock budget |
   |---|---|
   | investigate | 10 min |
   | implement | 30 min |
   | review | 10 min |
   | security-review | 10 min |
   | qa | 45 min |
   | fix | 30 min |
   | merge | 30 min (CI watch) |

7. **Log every stage.** Append a row to `backlog.csv` immediately after each subagent returns (success or fail). Use `flock` to serialize writes — parallel subagents WILL race the CSV append otherwise.

   ```
   flock .agents/no-github-backlog/backlog.csv.lock \
     printf '%s|%s|#%d|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%d\n' \
       "$(date -u +%FT%TZ)" "$RUN_ID" "$ISSUE" \
       "${ISSUE_TITLE:-}" "${ISSUE_URL:-}" \
       "$STAGE" "$DECISION" "${REASON:-}" \
       "${SUBAGENT_TYPE:-general-purpose}" "${MODEL:-sonnet}" "${TEMPLATE:-}" \
       "${PR_NUMBER:-}" "${PR_URL:-}" "${CI_STATUS:-}" "${DURATION_S:-0}" \
     >> .agents/no-github-backlog/backlog.csv
   ```

8. **Retry cap + if-stuck protocol.** Same stage may retry once (retry-1). Before reaching retry-2 → apply if-stuck (see section below). If stuck protocol also fails → quarantine. Retry rows append with reasoning prefix `retry-<n>`. Never exceed n=2.

   **Retry count detection** — before each stage dispatch, check how many times this stage has already run for this issue:
   ```
   RETRY_COUNT=$(flock .agents/no-github-backlog/backlog.csv.lock \
     awk -F'|' -v iss="#$ISSUE" -v stg="$STAGE" \
       'NR>1 && $3==iss && $6==stg {count++} END {print count+0}' \
     .agents/no-github-backlog/backlog.csv)
   # 0 = first attempt → run normally
   # 1 = already ran once → this dispatch is retry-1
   # ≥2 = apply if-stuck before running retry-2; quarantine if still failing
   ```
9. **Quarantine.** On quarantine, add two labels: `harness-quarantine` + `harness-stage:<investigate|implement|review|security|qa|ci|merge>`. Comment with last error. Move on.
10. **Worktree isolation.** Each implementation/fix/qa subagent runs in `.claude/worktrees/issue-<N>` via `isolation: "worktree"`. Cleanup automatic if no diff.
11. **Observability.** Update `.agents/no-github-backlog/run-$RUN_ID.status.json` after every stage transition (queued/running/done/failed/quarantined counters). User can `cat` it to see live progress without scraping CSV.
12. **TaskCreate pinning (compact-survival).** Background Agent agentIds live in harness state, not model context — `/compact` can drop them. To survive compaction:
    - **Before** every `Agent(...)` spawn for a stage, create a harness task:
      ```
      TaskCreate description="no-github-backlog:<stage>:#<issue> agentId=<will-fill>" status="pending"
      ```
    - **Immediately after** the Agent call returns its agentId (or for `run_in_background=true` agents), TaskUpdate to set status=`in_progress` and rewrite the description to include the actual agentId:
      ```
      TaskUpdate description="no-github-backlog:<stage>:#<issue> agentId=a54572..." status="in_progress"
      ```
    - **After** the subagent completes (or on quarantine), TaskUpdate status=`completed` (or `cancelled` with reason).
    - Post-`/compact`, the orchestrator re-reads TaskList; any `in_progress` tasks tagged `no-github-backlog:` whose agentId is still live can be resumed via `SendMessage(to=<agentId>, ...)`. Dead agentIds get cancelled per resume rule 5.
    - **Always tag the description with the `no-github-backlog:` prefix** — that's the discriminator for resume reconciliation.

## Stages

### 1. INVESTIGATE (subagent: general-purpose, model=sonnet, effort=high)

Prompt: `templates/investigate.md` with `$ISSUE_NUMBER`, `$REPO` substituted.

Returns JSON: `{decision: "fix"|"close"|"triage", reason, scope_files: [...], loc_estimate, existing_pr: <number|null>}`

`loc_estimate` = net lines added + modified in `scope_files`, excluding generated files, lockfiles, and snapshot fixtures. Strict integer.

Gate:
- `close` → orchestrator runs `gh issue close <N> --repo <repo> --comment "<reason>"`, log `stage=investigate,decision=close`, stop.
- `triage` → vague/ambiguous issue; orchestrator adds label `harness-needs-triage`, comments with the agent's `reason`, log `stage=investigate,decision=triage`, stop.
- `existing_pr` present AND NOT `internal_pr` → external PR exists; log `stage=investigate,decision=skipped,reasoning="existing PR #<n>"`, stop. Do not open duplicate PR.
- `existing_pr` present AND `internal_pr=true` → own harness PR found (stale run); treat as `implement|fix` row and start at REVIEW (skip IMPLEMENT).
- `fix` + `loc_estimate>300` → quarantine with `harness-stage:investigate`, log `stage=investigate,decision=skipped,reasoning="loc>300"`.
- `fix` + `loc_estimate<=300` → log `stage=investigate,decision=fix`, proceed to IMPLEMENT.

### 2. IMPLEMENT (subagent: general-purpose, model=sonnet, effort=high, isolation=worktree)

Prompt: `templates/implement.md` with issue context + scope_files from INVESTIGATE.

Subagent must:
- Create branch `fix/issue-<N>-<slug>`
- Make minimal diff scoped to listed files
- Push branch
- Open draft PR with `Closes #<N>`
- Return JSON: `{pr_url, pr_number, branch}`

Gate: missing PR URL → quarantine with `harness-stage:implement`. Log `stage=implement,decision=quarantine`.

### 3. REVIEW (subagent: **general-purpose**, model=sonnet, effort=high)

Note: `caveman:cavecrew-reviewer` outputs line-format text, not JSON, and refuses to suggest fixes — incompatible with this stage's contract. Use `general-purpose`.

**Diff-grounded review.** Subagent fetches diff itself via `gh pr diff`. May read PR body/title for context, but findings must cite code, not author intent. Commit messages are out of scope.

Prompt: `templates/review.md` with `$PR_NUMBER`, `$REPO`, `$SCOPE_FILES` (pipe-separated list from INVESTIGATE output; used for scope-creep check). Exception to context-isolation: scope_files is INVESTIGATE output passed as a substituted parameter, not shared agent context.

Returns JSON: `{verdict, findings: [...], ci_status, failing_checks, ci_break_predicted, scope_creep, regression_risk}`.

Gate:
- approve → log `stage=review,decision=approve`, proceed to SECURITY-REVIEW.
- reject → spawn FIX subagent, then **re-run from REVIEW** (full chain: REVIEW → SECURITY-REVIEW → QA). Second reject at REVIEW → quarantine with `harness-stage:review`.

### 4. SECURITY-REVIEW (subagent: general-purpose, model=sonnet, effort=high)

**Independent context.** Reads diff + project security policies if present (`SECURITY.md`, `CLAUDE.md` security sections).

Prompt: `templates/security-review.md`.

Returns JSON: `{verdict, severity: "critical"|"high"|"medium"|"low"|"none", findings: [...]}`.

Gate:
- approve OR (reject AND severity ∈ {low, medium}) → log `stage=security-review,decision=approve` (post low/medium findings as PR comment for visibility), proceed to QA.
- reject AND severity ∈ {critical, high} → spawn FIX subagent, **re-run from REVIEW** (a security fix may affect logic/scope). Second high+ reject → quarantine with `harness-stage:security`.

### 5. QA (subagent: general-purpose, model=sonnet, effort=high, isolation=worktree, concurrency_cap=2)

**Independent context.** Fresh subagent. Validates the change actually works against the real product and is covered by real tests. NO mocks. NO isolated unit tests of trivial functions. Real product, real data, end-to-end.

Prompt: `templates/qa.md` with `$PR_NUMBER`, `$ISSUE_NUMBER`, `$REPO`.

Subagent must:
- Check out PR branch in worktree.
- Map: what changed (files, functions), what existing tests cover those paths, what the user-visible behavior is supposed to be.
- Check CI config (`.github/workflows/*`, `package.json` scripts, `pytest.ini`, `go.mod`, etc.) and run the same E2E/integration suites CI runs — locally — against real services or live fixtures.
- If a behavioral change is NOT covered by an existing real E2E/integration test: ADD one. Real HTTP, real DB, real product surface. No mocking of the system under test. No mocked external boundary unless it is genuinely unreachable from CI (document why).
- Verify the original issue's reproduction case no longer reproduces.
- Verify added tests **fail without the fix and pass with it** using **two separate worktrees** (one on PR base, one on PR HEAD) — do not stash/checkout-toggle the working tree (migrations/build artifacts may not roll back cleanly and produce false greens).
- If new tests added: commit + push to the same PR branch.

Returns JSON: `{verdict, ci_will_pass, tests_run: [...], tests_added: [...], coverage_gap: "none"|"<desc>", reproduction_verified, real_services_used: [...], findings: [...]}`.

Gate:
- approve AND `ci_will_pass=true` → log `stage=qa,decision=approve`, proceed to MERGE.
- reject OR `ci_will_pass=false` → spawn FIX subagent with QA findings, **re-run from REVIEW** (test-driven fix may change behavior). Second QA reject → quarantine with `harness-stage:qa`. Never merge.

### 6. FIX (subagent: general-purpose, model=sonnet, effort=high, isolation=worktree)

Triggered by REVIEW reject, SECURITY-REVIEW reject (high+), QA reject, or CI red on MERGE.

Prompt: `templates/fix.md` with `$FINDINGS`, `$PR_NUMBER`, `$REVIEW_TYPE`. Subagent checks out PR branch, applies fix, pushes.

Returns: `{commit_sha, addressed_findings: [...], files_changed, local_test_evidence}`. Log `stage=fix,decision=fix`.

After return: orchestrator re-enters at REVIEW (see rule 5).

### 7. MERGE (orchestrator, not a subagent)

Split into 7a (ready) + 7b (watch + merge). 7a is fast; 7b can be backgrounded so orchestrator drains other issues while CI runs.

**7a. Ready + pre-flight:**
```
gh pr ready <pr_number> --repo <repo>  # idempotent; no-op if not draft

# Branch protection pre-check — bail early if required approvers can't be satisfied
PROT=$(gh api repos/<repo>/branches/$DEFAULT_BRANCH/protection 2>/dev/null || echo '{}')
REQ_APPROVERS=$(echo "$PROT" | jq -r '.required_pull_request_reviews.required_approving_review_count // 0')
if [ "$REQ_APPROVERS" -gt 0 ] && ! gh pr view <pr_number> --repo <repo> --json reviewDecision | jq -e '.reviewDecision=="APPROVED"' >/dev/null; then
  # Quarantine: needs human approval, bot can't self-approve
  echo "needs-human-approval" ; exit 1
fi
```

**7b. Watch + merge:**
```
# Poll, don't block — sleep 60s between polls so other issues can progress
gh pr checks <pr_number> --repo <repo> --required --json name,bucket,state
```

If all required checks `bucket=pass` → `gh pr merge <pr_number> --squash --delete-branch --repo <repo>`. Log `stage=merge,decision=merged`.

If any required check `bucket=fail` → fetch failing job log (`gh run view --log-failed`), spawn FIX subagent with `$REVIEW_TYPE=ci-failure` and failure context, **re-run from REVIEW** (full pipeline). Second CI fail → quarantine PR with `harness-stage:ci`.

**Never override, force-merge, `--admin`, or admin-merge a red CI. Never mark a required check as not-required to bypass.**

## CSV format (backlog.csv)

Delimiter is `|` (not `,`) — commas appear freely in reason text and would break parsing.

**Schema** (15 fields):
```
date | run_id | issue | issue_title | issue_url | stage | decision | reasoning | subagent_type | model | prompt_template | pr_number | pr_url | ci_status | duration_s
```

**Example rows:**
```
date|run_id|issue|issue_title|issue_url|stage|decision|reasoning|subagent_type|model|prompt_template|pr_number|pr_url|ci_status|duration_s
2026-05-23T14:02:11Z|20260523T140000Z|#883|Fix deprecated Node 16 action|https://github.com/org/repo/issues/883|investigate|fix|v1 action deprecated node16; v2 drops it|general-purpose|sonnet|investigate.md||||42
2026-05-23T14:08:44Z|20260523T140000Z|#883|Fix deprecated Node 16 action|https://github.com/org/repo/issues/883|implement|fix|single-line bump in ci-cd.yml|general-purpose|sonnet|implement.md|1322|https://github.com/org/repo/pull/1322||187
2026-05-23T14:09:30Z|20260523T140000Z|#883|Fix deprecated Node 16 action|https://github.com/org/repo/issues/883|review|approve|diff matches scope; no side-effects; CI green on push|general-purpose|sonnet|review.md|1322|https://github.com/org/repo/pull/1322|green|61
2026-05-23T14:10:12Z|20260523T140000Z|#883|Fix deprecated Node 16 action|https://github.com/org/repo/issues/883|security-review|approve|no auth/secrets/path changes|general-purpose|sonnet|security-review.md|1322|https://github.com/org/repo/pull/1322|green|38
2026-05-23T14:12:40Z|20260523T140000Z|#883|Fix deprecated Node 16 action|https://github.com/org/repo/issues/883|qa|approve|E2E suite passed; added e2e/ci-bump.spec.ts|general-purpose|sonnet|qa.md|1322|https://github.com/org/repo/pull/1322|green|214
2026-05-23T14:15:01Z|20260523T140000Z|#883|Fix deprecated Node 16 action|https://github.com/org/repo/issues/883|merge|merged|PR #1322 squash-merged; required checks green||||||green|28
```

**SUMMARY rows** (cycle/run markers — dashboard parser skips these):
```
2026-05-23T15:00:00Z|20260523T140000Z|SUMMARY|||cycle-complete|continue|merged=3 closed=1 triaged=0 quarantined=0||||||||0
```

Append-only. Never edit prior rows. One row per stage per issue. Retry rows: append with reasoning prefix `retry-1` or `retry-2`. Never exceed `retry-2`. All writes via `flock` (rule 7).

**Human-readable view:** run `generate-dashboard.ts` → opens `dashboard.html`. Regenerated automatically at end of each cycle.

## Status file (run-$RUN_ID.status.json)

```json
{
  "run_id": "20260523T140000Z",
  "started_at": "2026-05-23T14:00:00Z",
  "cycle": 2,
  "queued": 12,
  "running": 4,
  "done": 6,
  "failed": 1,
  "quarantined": 1,
  "last_update": "2026-05-23T14:30:11Z"
}
```

Update after every stage transition. User `cat`s this to monitor progress.

## If-stuck protocol

Apply **before** retry-2 quarantine on any stage. Do not stop. Instead:

1. **Reproduce** — re-read the issue body + diff + failure output. Confirm you understand the actual error.
2. **Read logs** — `gh run view --log-failed` for CI failures; re-read test output for QA failures.
3. **Reduce scope** — can the fix be smaller? Can a failing test be broken into smaller assertions?
4. **Try another path** — if the first implementation approach failed, try a structurally different approach (e.g. fix the root cause instead of the symptom, or change the abstraction boundary).
5. **Improve adjacent behavior** — if the exact fix is blocked, is there a related improvement that unblocks it?
6. **Record** — document what was tried and why it failed in the PR body or a comment. Continue.

If all paths exhausted after retry-2 → quarantine with `harness-stage:<stage>` label + comment explaining what was tried.

Stage-specific stuck guidance:
- **implement** stuck: re-read scope_files, check if dependency needs updating, try minimal no-op first to confirm branch/push works.
- **review** stuck (rejected twice): post blocker as PR comment, add `harness-needs-triage` label, skip this issue (don't block queue).
- **qa** stuck: confirm real services are up (`docker ps`, `supabase status`, etc.), check if test isolation is broken by prior run artifacts.
- **ci-failure** stuck: identify the exact failing job + line, not just "CI red". Fix root cause; never silence the check.

## Hard rules (mandatory)

- **NEVER skip a stage.** Even a one-line fix gets review + security-review + qa.
- **NEVER merge without all four gates green** (review approve, security approve, qa approve, CI green).
- **NEVER merge a PR that breaks CI.** If CI is red, the QA subagent and reviewer MUST flag it and the orchestrator MUST block the merge. No `--admin`, no force-merge, no exceptions.
- **NEVER accept mocked tests as coverage.** Real product, real data, real end-to-end. Unit tests of trivial functions and mock-based tests do NOT count toward closing a QA coverage gap.
- **NEVER ship a behavioral change without a real E2E/integration test.** If the diff changes behavior and no real test covers it, QA must add one before approve.
- **NEVER skip re-validation after FIX.** A fix invalidates all prior approvals. Re-run from REVIEW.
- **NEVER append to CSV without `flock`.** Parallel subagents will corrupt rows otherwise.
- **NEVER exceed retry-2 on any stage.** Apply if-stuck protocol at retry-1; quarantine at retry-2 if still failing.
- **NEVER let a stuck issue block others.** Quarantine and move on.
- **NEVER write CSV mid-stage.** Only on stage exit (success or fail).
- **NEVER share context between stages within the same issue.** Each stage = fresh subagent, fresh prompt.
- **NEVER call subagents sequentially when you could parallelize.** Investigate stage for all issues runs in one parallel batch. Per-stage batch across the queue. (QA capped at 2; everything else at 10.)
- **NEVER mark a CI job as not-required to bypass red.** Branch protection is not yours to modify.

## End-of-cycle report + loop

After queue drains (all current issues terminal or in-flight), print a **cycle summary** — concise and factual:

```
Cycle <N> complete. merged=X closed=Y triaged=Z quarantined=Q skipped=S
Next: re-fetching backlog in 300s.
```

Then:
1. Append cycle summary row to backlog.csv:
   ```
   flock .agents/no-github-backlog/backlog.csv.lock \
     printf '%s|%s|SUMMARY|||cycle-complete|continue|merged=%d closed=%d triaged=%d quarantined=%d|||||||||0\n' \
       "$(date -u +%FT%TZ)" "$RUN_ID" "$MERGED" "$CLOSED" "$TRIAGED" "$QUARANTINED" \
     >> .agents/no-github-backlog/backlog.csv
   ```
2. **Do NOT stamp `completed_at`.** Increment `cycle` counter in status.json:
   ```
   jq '.cycle += 1' .agents/no-github-backlog/run-$RUN_ID.status.json > .tmp && \
     mv .tmp .agents/no-github-backlog/run-$RUN_ID.status.json
   ```
3. **Regenerate dashboard:**
   ```
   bun .agents/skills/no-github-backlog/generate-dashboard.ts \
     .agents/no-github-backlog/backlog.csv \
     .agents/no-github-backlog/dashboard.html 2>/dev/null || true
   ```
   Print: `Dashboard updated: .agents/no-github-backlog/dashboard.html`
4. Wait 300s **only if no PRs are currently in merge-watch state** (stage 7b polling). If merge watches are active, continue polling them (60s cadence); start the 300s inter-cycle wait only after the last merge-watch resolves (merged or quarantined).
5. Re-fetch backlog. Each cycle, re-run the per-issue awk check against backlog.csv to determine which issues are terminal — no separate tracking set needed. Dispatch only issues with no terminal last_dec (or no CSV row at all).
6. Loop back to **Fetch backlog**.

### STOP_GOAL handling

When user says `STOP_GOAL` (or "stop", "halt", "done for now"):
1. Let in-flight subagents finish their current stage (do not kill mid-stage).
2. Print final run summary (merged/closed/triaged/quarantined totals across all cycles).
3. Stamp `completed_at`:
   ```
   jq --arg t "$(date -u +%FT%TZ)" '.completed_at=$t' \
     .agents/no-github-backlog/run-$RUN_ID.status.json > .tmp && \
     mv .tmp .agents/no-github-backlog/run-$RUN_ID.status.json
   ```
4. Append final row:
   ```
   flock .agents/no-github-backlog/backlog.csv.lock \
     printf '%s|%s|SUMMARY|||run-complete|stopped|merged=%d closed=%d triaged=%d quarantined=%d|||||||||0\n' \
       "$(date -u +%FT%TZ)" "$RUN_ID" "$MERGED" "$CLOSED" "$TRIAGED" "$QUARANTINED" \
     >> .agents/no-github-backlog/backlog.csv
   ```
5. **Regenerate final dashboard:**
   ```
   bun .agents/skills/no-github-backlog/generate-dashboard.ts \
     .agents/no-github-backlog/backlog.csv \
     .agents/no-github-backlog/dashboard.html 2>/dev/null || true
   ```
6. TaskUpdate all remaining `no-github-backlog:` tasks to `completed` or `cancelled`.

## Templates

- [templates/investigate.md](templates/investigate.md)
- [templates/implement.md](templates/implement.md)
- [templates/review.md](templates/review.md)
- [templates/security-review.md](templates/security-review.md)
- [templates/qa.md](templates/qa.md)
- [templates/fix.md](templates/fix.md)

## Dashboard

- [generate-dashboard.ts](generate-dashboard.ts) — reads `backlog.csv`, writes `dashboard.html` (self-contained HTML; no server needed)
- Output: `.agents/no-github-backlog/dashboard.html`
- Auto-regenerated after every cycle and on STOP_GOAL
- Manual run: `bun .agents/skills/no-github-backlog/generate-dashboard.ts`
