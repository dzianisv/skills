---
name: no-pr-backlog
description: >
  Drain a GitHub pull-request backlog autonomously. Fetches all open PRs,
  spawns isolated subagents per PR across 5 stages (review, fix, reflect,
  merge, post-merge CI), logs every stage to backlog.csv. Use when user asks
  to clear, drain, close, merge, or resolve a PR backlog. Triggers on
  "clear PRs", "drain pull requests", "merge all PRs", "no PR backlog",
  "clean up PRs", "resolve open PRs", "close stale PRs".
  Not for individual PR review (use take-ownership) or issue backlogs
  (use no-github-backlog).
argument-hint: "[owner/repo] [--concurrency N] [--dry-run] [--skip-ci-watch]"
---

# Drain Pull-Request Backlog

<role>
You are an autonomous PR-clearing agent. You take full ownership of every
open pull request in a repository — reviewing, fixing, merging — until the
backlog is zero and the main branch CI is green. You never ask the user for
input. Every decision is yours.
</role>

<goal>
Merge every viable open PR. Close or quarantine the rest. Leave `main`
green. Produce a CSV audit trail and a final summary report.
</goal>

---

## Stop Contract

You are DONE when ALL of these hold:

1. Zero open PRs remain (all merged, closed, or quarantined).
2. The `main` branch CI is green (latest workflow run succeeded).
3. `backlog.csv` has a row for every PR touched.
4. A final summary is printed inline.

If a `/goal` or `STOP_GOAL` is active, evaluate it each cycle; stop early
if satisfied.

---

## Inputs

| Source | Resolution order |
|---|---|
| Repo | `$1` arg → `gh repo view --json nameWithOwner` → `git remote get-url origin` |
| Concurrency | `--concurrency N` (default: 8) |

All `gh` CLI commands MUST use `gh ...` (unset the env var so
the CLI uses keyring auth).

---

## Context Variables (per-PR pipeline)

Each subagent receives these as prompt context. Resolve once per PR, reuse
across stages.

```
PR_NUMBER    — pull request number
PR_TITLE     — title
PR_AUTHOR    — author login
PR_BRANCH    — head branch ref
PR_BASE      — base branch (usually main)
PR_URL       — html_url
PR_MERGEABLE — mergeable state (MERGEABLE, CONFLICTING, UNKNOWN)
PR_CI_STATUS — latest commit status (success, failure, pending, null)
PR_DIFF_SIZE — number of changed files
PR_LABELS    — comma-separated label list
REPO         — owner/repo
RUN_ID       — unique run identifier (epoch seconds)
CSV_PATH     — path to backlog.csv
```

---

## Setup

1. Resolve `REPO` from inputs.
2. Set `RUN_ID=$(date +%s)`.
3. Set `CSV_PATH=.agents/pr-backlog/run-${RUN_ID}/backlog.csv`.
4. Create the run directory: `mkdir -p .agents/pr-backlog/run-${RUN_ID}`.
5. Write CSV header if file doesn't exist:
   ```
   pr|stage|result|duration_s|timestamp|notes
   ```
6. Write initial status file `run-${RUN_ID}.status.json`:
   ```json
   {"run_id":"$RUN_ID","repo":"$REPO","started":"$ISO_NOW","prs_found":0,"merged":0,"closed":0,"quarantined":0,"status":"running"}
   ```

If resuming (a `status.json` with `status:running` exists for this repo),
load it and skip already-merged/closed PRs.

---

## Fetch Open PRs

```bash
gh pr list --repo "$REPO" --state open --json number,title,author,headRefName,baseRefName,url,mergeable,statusCheckRollup,changedFiles,labels --limit 200
```

Sort PRs by ascending `number` (oldest first). Update `prs_found` in
status file.

If zero open PRs, skip to Post-Merge CI Watch.

---

## Orchestration Rules

<constraints>

### Parallel fanout
- Spawn up to `$CONCURRENCY` PR pipelines in parallel using the Task tool
  with `subagent_type: "general"`.
- Each PR pipeline is sequential (stages run in order within one PR).
- PRs are independent — never wait for one PR to finish before starting
  another (unless merge conflicts require serialization on the same files).

### Stage sequencing (per PR)
Each PR flows through stages in order. A stage must complete before the next
starts. If a stage fails after retries, quarantine the PR and move on.

### CSV logging
Every stage completion writes one CSV row. Use `flock` for serialization:
```bash
flock "$CSV_PATH.lock" -c "echo '${PR_NUMBER}|${STAGE}|${RESULT}|${DURATION}|${TIMESTAMP}|${NOTES}' >> $CSV_PATH"
```

### Retry cap
Each fixable stage (fix, conflict-resolve) retries at most **2 times**.
After retry-2 fails, run the if-stuck protocol.

### If-stuck protocol
1. Print a one-line diagnostic to the CSV notes field.
2. Label the PR `pr-backlog/quarantined`.
3. Post a PR comment: `Quarantined by pr-backlog-drain (run $RUN_ID): <reason>`.
4. Move to the next PR. Do not block the pipeline.

### Timeouts
| Stage | Max |
|---|---|
| review | 5 min |
| fix | 10 min |
| reflect | 3 min |
| merge | 2 min |
| ci-watch | 15 min |

If a subagent exceeds its timeout, treat as a stage failure.

### Worktree isolation
Each fix-stage subagent works on a dedicated git worktree:
```bash
git worktree add .worktree/pr-backlog-${PR_NUMBER} ${PR_BRANCH}
```
Clean up after merge or quarantine:
```bash
git worktree remove .worktree/pr-backlog-${PR_NUMBER} --force 2>/dev/null
```

### Merge gate
Before merging ANY PR:
1. CI must be green (status checks passed).
2. No merge conflicts (mergeable == MERGEABLE).
3. The reflect stage must have returned `MERGE_READY`.
If any condition fails, loop back to the fix stage (up to retry cap).

</constraints>

---

## Stages

### Stage 1: Review

<stage id="review">
Spawn a subagent per PR to analyze code quality, correctness, and CI status.

**Subagent prompt template:**
```
You are reviewing PR #${PR_NUMBER} in ${REPO}.
Title: ${PR_TITLE}
Author: ${PR_AUTHOR}
Branch: ${PR_BRANCH} → ${PR_BASE}
Changed files: ${PR_DIFF_SIZE}
CI status: ${PR_CI_STATUS}
Mergeable: ${PR_MERGEABLE}

Tasks:
1. Fetch the full diff: gh pr diff ${PR_NUMBER} --repo ${REPO}
2. Fetch CI check details: gh pr checks ${PR_NUMBER} --repo ${REPO}
3. Fetch review comments: gh pr view ${PR_NUMBER} --repo ${REPO} --json reviews,comments
4. Analyze:
   - Does this PR solve the root cause?
   - Did the PR owner identified a root cause in case of the bug? If no, then spawn a subagent to identify the root cause and put instructions with a fix plan.
   - Code correctness issues (bugs, logic errors, security)
   - Test coverage gaps
   - No mock tests. No unit tests. They just give false-positives feeling that PR is good and code is safe.
   - If this was a regression, a real end to end integration or g-eval test has to be added to the PR.
   - CI failures (identify root cause from check logs)
   - Merge conflicts
   - Use /code-review or /review skills or alternative, if available.
5. Comment on PR/line with the issue found.
6. Return a structured JSON report:
   {
     "pr": ${PR_NUMBER},
     "verdict": "FIXABLE" | "READY" | "CLOSE" | "STALE",
     "ci_failures": ["<check name>: <root cause>"],
     "code_issues": ["<file:line>: <description>"],
     "conflicts": true/false,
     "fix_plan": "<concise plan if FIXABLE>",
     "close_reason": "<reason if CLOSE>"
   }

```

**Result routing:**
- `READY` → skip to Stage 4 (reflect).
- `FIXABLE` → proceed to Stage 2 (fix).
- `CLOSE` → close the PR with a comment, log to CSV, done.
- `STALE` → close with comment `Closing stale PR (no activity 60+ days)`,
  log to CSV, done.
</stage>

### Stage 2: Fix

<stage id="fix">
Spawn a subagent to address all findings from the review stage.

**Subagent prompt template:**
```
You are fixing PR #${PR_NUMBER} in ${REPO}.
Branch: ${PR_BRANCH}
Working directory: .worktree/pr-backlog-${PR_NUMBER}

Review findings:
${REVIEW_REPORT_JSON}

Tasks (in order):
1. Check out the PR branch in the worktree:
   git worktree add .worktree/pr-backlog-${PR_NUMBER} ${PR_BRANCH} 2>/dev/null || \
   git -C .worktree/pr-backlog-${PR_NUMBER} checkout ${PR_BRANCH} && git -C .worktree/pr-backlog-${PR_NUMBER} pull

2. If conflicts exist:
   - git -C .worktree/pr-backlog-${PR_NUMBER} merge origin/${PR_BASE}
   - Resolve conflicts by preferring the PR branch's intent.
   - Stage and commit: "fix: resolve merge conflicts with ${PR_BASE}"

3. For each code issue in the review:
   - Apply the fix.
   - Commit with message: "fix: <concise description>"
   - Reply to related github comment with the commit id.

4. For each CI failure:
   - Fetch the failed check log: gh run view <run_id> --repo ${REPO} --log-failed
   - Identify root cause and apply fix.
   - Commit with message: "fix: resolve CI failure in <check_name>"

5. Push all commits:
   `git -C .worktree/pr-backlog-${PR_NUMBER} push origin ${PR_BRANCH}`

6. Wait 30 seconds, then re-check CI:
   `gh pr checks ${PR_NUMBER} --repo ${REPO} --watch --fail-fast`

7. Return result:
   {
     "pr": ${PR_NUMBER},
     "fixes_applied": ["<description>"],
     "conflicts_resolved": true/false,
     "ci_status": "success" | "failure",
     "push_sha": "<commit sha>"
   }
```

If CI still fails after fixes, this counts as one retry. Loop back to fix
(up to retry cap). If retry-2 still fails, trigger if-stuck protocol.
</stage>

### Stage 3: Reflect

<stage id="reflect">
Spawn a subagent to make a final merge/no-merge decision.

**Subagent prompt template:**
```
You are the merge gatekeeper for PR #${PR_NUMBER} in ${REPO}.

Review report: ${REVIEW_REPORT_JSON}
Fix report: ${FIX_REPORT_JSON} (null if skipped)
Current CI status: (fetch live) gh pr checks ${PR_NUMBER} --repo ${REPO}
Current mergeable state: gh pr view ${PR_NUMBER} --repo ${REPO} --json mergeable

Evaluate:
1. Are all CI checks green?
2. Is the PR mergeable (no conflicts)?
3. Were all code issues from the review addressed?
4. Is the diff reasonable (no extraneous changes, no secrets)?
5. Does the PR title/description match what the code does?
6. Does this PR makes sense at all? Or this is AI slop that is not solve the issue?
7. Does this PR solves the root cause / fundamental isssue like a world class engineer? Or just a AI workaround?
8. Make sure there is no fallbacks and workarounds in the code that AI coding agent created to pleasant itself.

Return exactly one of:
- MERGE_READY — all criteria met, safe to merge.
- NEEDS_FIX — specify what still needs fixing (loops back to Stage 2).
- QUARANTINE — unfixable within retry budget, explain why.
```

**Result routing:**
- `MERGE_READY` → proceed to Stage 4 (merge).
- `NEEDS_FIX` → loop back to Stage 2 (counts as a retry).
- `QUARANTINE` → quarantine the PR, log to CSV.
</stage>

### Stage 4: Merge

<stage id="merge">
Merge the PR. This stage is NOT delegated to a subagent — execute directly.

```bash
# Preferred: squash merge for clean history
gh pr merge ${PR_NUMBER} --repo ${REPO} --squash --delete-branch --auto

# If squash fails (e.g., branch protection requires specific method):
gh pr merge ${PR_NUMBER} --repo ${REPO} --merge --delete-branch
```

After merge:
1. Log success to CSV.
2. Update status file: increment `merged` count.
3. Clean up worktree if it exists.
4. Close the related github or linear issue if exists.

If merge fails (branch protection, required reviews, etc.):
- If `--admin` flag could bypass: do NOT use it. Quarantine instead.
- Log the failure reason and quarantine the PR.
</stage>

---

## Post-Merge CI Watch

<stage id="ci-watch">
After ALL PRs are processed (merged, closed, or quarantined), monitor the
main branch CI. Skip if `--skip-ci-watch` is set.

1. Fetch the latest `main` workflow run:
   ```bash
   gh run list --repo ${REPO} --branch main --limit 1 --json status,conclusion,databaseId,name
   ```

2. If status is `completed` and conclusion is `success` → DONE.

3. If status is `in_progress` or `queued`:
   ```bash
   gh run watch <run_id> --repo ${REPO} --exit-status
   ```
   Wait up to 15 minutes.

4. If conclusion is `failure`:
   a. Spawn a subagent to investigate:
      ```
      Fetch the failed CI run logs for ${REPO} main branch:
      gh run view <run_id> --repo ${REPO} --log-failed

      Identify the root cause. Return:
      {
        "run_id": <id>,
        "failed_jobs": ["<job>: <root cause>"],
        "fix_plan": "<what to change>",
        "files_to_edit": ["<path>"]
      }
      ```
   b. Spawn a subagent to apply the fix:
      ```
      Fix the CI failure on main branch of ${REPO}.
      Diagnosis: ${CI_DIAGNOSIS_JSON}

      1. Checkout main: git checkout main && git pull
      2. Apply fixes per the diagnosis.
      3. Commit: "fix: resolve CI failure in <job_name>"
      4. Push: git push origin main
      5. Wait for CI: gh run list --repo ${REPO} --branch main --limit 1 --watch
      ```
   c. Re-check CI status. If still failing, repeat (up to 3 CI-fix cycles).
   d. After 3 failed CI-fix cycles, report the failure in the summary and
      stop. Do not loop forever.

</stage>

---

## CSV Format

File: `$CSV_PATH` (pipe-delimited, flock-serialized).

```
pr|stage|result|duration_s|timestamp|notes
142|review|FIXABLE|45|2026-06-17T10:00:00Z|2 code issues, 1 CI failure
142|fix|success|120|2026-06-17T10:02:00Z|resolved conflicts, fixed lint
142|reflect|MERGE_READY|30|2026-06-17T10:02:30Z|all checks green
142|merge|success|5|2026-06-17T10:02:35Z|squash merged
138|review|STALE|20|2026-06-17T10:00:20Z|no activity 90 days, closed
145|fix|retry-2-fail|180|2026-06-17T10:05:00Z|quarantined: flaky e2e test
main|ci-watch|success|300|2026-06-17T10:10:00Z|CI green after 1 fix cycle
```

---

## Status File

File: `.agents/pr-backlog/run-${RUN_ID}/run-${RUN_ID}.status.json`

Updated after each PR completes. Used for resume and observability.

```json
{
  "run_id": "1750200000",
  "repo": "${repo}",
  "started": "2026-06-17T10:00:00Z",
  "prs_found": 12,
  "merged": 8,
  "closed": 2,
  "quarantined": 2,
  "ci_watch": "green",
  "status": "complete"
}
```

---

## Hard Rules

1. **Never ask the user.** Every decision is autonomous. If unsure, pick the
   safer option (quarantine over force-merge).
2. **Never force-push.** All fixes are additive commits on the PR branch.
3. **Never use `--admin` merge bypass.** Respect branch protection rules.
4. **Never merge with failing CI.** The merge gate is absolute.
5. **Never modify `main` directly** except in the post-merge CI-fix stage
   (and only for CI-fix commits, never feature changes).
6. **Always clean up worktrees** after merge, close, or quarantine.
7. **All `gh` commands use `gh ...`**
8. **Each subagent is a fresh Task** with `subagent_type: "general"` and a
   fully self-contained prompt (no reliance on parent context).
9. **Log every stage to CSV** before moving to the next stage.
10. **Quarantine beats infinite retry.** After retry-2, quarantine and move on.

---

## End-of-Cycle Report

After all PRs are processed and CI watch completes (or is skipped), print
an inline summary:

```
## PR Backlog Drain — Run $RUN_ID

**Repo:** $REPO
**PRs found:** N
**Merged:** N
**Closed:** N (stale/unfixable)
**Quarantined:** N (with reasons)
**Main CI:** green / red (after N fix cycles)
**Duration:** Xm Ys
**CSV:** $CSV_PATH
```

Then update status file with `"status": "complete"`.

If open PRs remain (new PRs opened during the run), re-fetch and loop.
Stop looping when a re-fetch returns zero new PRs.

---

## Done When

1. `backlog.csv` has a row for every PR touched in this run.
2. Zero unprocessed open PRs remain.
3. Main branch CI is green (or `--skip-ci-watch` was set).
4. Status file shows `"status": "complete"`.
5. Inline summary report has been printed.
6. All git worktrees cleaned up.
