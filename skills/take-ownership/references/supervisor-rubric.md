# Patterns & Antipatterns

## Patterns

- Before writing any code, write the R1 success metric anchored to the REAL
  user-facing channel — the exact command the user would run and the exact
  observable result. Explicitly rule out "CI green", "unit tests pass", and
  "API returns 200" as the done bar.
- Write STATE.md at every phase boundary (define → design → plan → implement
  → review → test → PR → prod-verify) with enough detail that a cold resume
  from STATE.md alone continues without asking the user.
- Run all required phases in order. A "small" task shrinks each phase; it
  never deletes one or merges design+plan+review into a single blob.
- Test through the real user-facing channel (live endpoint, real browser at
  prod URL, real bot message in the real channel). "Integration test against
  local instance" and "CI passed" do not count as real-channel tests.
- At review phases (5b and 7), use `/code-review` as the primary engine (high
  pre-PR, ultra/max at final gate), then explicitly grade the diff against all
  five Review-Bar questions. Never rubber-stamp with "LGTM".
- Before merging (Phase 8a), confirm the change is genuinely needed AND is a
  real fix — not a workaround papering over a symptom. Write the blast radius,
  reversibility, and prod failure surface before running the merge command.
- Walk the Blocker Resolution Table entries that apply (Bitwarden for creds,
  chrome-devtools for browser actions, package manager for missing tools)
  before escalating any blocker to the user.
- After each parallel group of subagents, verify GUARD_HEAD and GUARD_DIRTY
  unchanged, and confirm artifacts exist in the worktree.

## Antipatterns

PREMATURE-STOP ANTIPATTERNS: if the agent's last response matches one of
these AND the Stop Contract is not satisfied, the task is NOT complete —
set status "in_progress" and put the concrete next action in remaining_work:

- NO-R1-METRIC: code was written or a PR opened before a runnable R1 success
  metric was stated. "CI green", "tests pass", or "API returns 200" stated as
  the bar. The R1 metric was described but not anchored to the real channel.

- FAKE-DONE: declared the task done, complete, or verified based on a
  subagent's self-report, a unit test, an internal API call, or a description
  of what the fix should do — without R1-channel evidence in the same turn.
  "Task is fully verified E2E" with no R1 command + output pasted is fake-done.

- PHASE-SKIP: skipped or inlined a phase to "save tokens" (e.g., merged
  design+plan into one blob, omitted the 5b review before the PR, jumped from
  implement to PR without real-channel testing). A phase that was "small" but
  present scores correct; a missing phase scores zero.

- MOCK-TESTING: called the task tested based on unit tests with mocks, a local
  stub server, or CI results. The real-channel test (top rung of R2 ladder) was
  not run or was described as "optional" / "flaky".

- STATE-NOT-PERSISTED: omitted STATE.md writes at phase boundaries, or wrote
  STATE.md only at the end rather than incrementally. A cold resume from
  STATE.md would require asking the user.

- LAZY-ESCALATION: asked the user for something the Blocker Resolution Table
  covers (credentials, browser action, missing tool) without first walking the
  table. "I need the API key" without checking Bitwarden / ~/.env.d/ first.

- WORKAROUND-MERGED: merged a PR that papers over a symptom rather than
  solving the fundamental problem (a swallowed-error catch, a default-value
  fallback, a hard-coded bypass). Phase 8a double-think was skipped or passed
  a workaround through.

- REVIEW-RUBBER-STAMP: used `/review` as the sole review tool (not `/code-review
  high/ultra`), or ran code-review but did not explicitly answer all five
  Review-Bar questions in the findings. "LGTM" or "no issues found" without
  per-question evidence is a rubber-stamp.

- SUBAGENT-ESCAPE: spawned a write subagent without recording GUARD_HEAD +
  GUARD_DIRTY first, or trusted the subagent's self-report that it stayed in
  bounds without verifying artifacts in the worktree.

- ANTI-STOP-VIOLATION: ended a turn with "awaiting your review", "should I
  continue?", "I'll pause here", or "let me know if you'd like me to proceed"
  while the Stop Contract was unsatisfied.
