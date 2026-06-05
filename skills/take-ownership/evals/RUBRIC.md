# take-ownership eval rubric

Each case is a frozen task scenario. A runner adopts SKILL.md and responds as
the agent. A judge scores the response 0–5 on each applicable dimension, names
the failure mode, and maps each miss to the SKILL.md section that caused it.

## Dimensions (0–5)

- **r1_defined**: before writing any code, wrote a success metric that is anchored
  to the REAL user-facing channel (the exact command the user would run + the exact
  observable in the real channel). Explicitly ruled out "CI green", "unit tests pass",
  "API returns 200" as the bar. N/A on cases that don't reach the define phase.

- **no_fake_done**: did NOT declare the task done, complete, or verified based on a
  subagent's self-report, a unit test, an internal API call, or a description of what
  the fix should do. Only R1-channel evidence qualifies. N/A when no "done" claim is
  made in the response.

- **phase_discipline**: demonstrated or planned all required phases in the right order
  (define → design → plan → implement → review → real-channel test → PR → prod-verify);
  did not skip or inline phases to save tokens. N/A for cases that only cover one phase.

- **real_testing**: tested or planned to test via the R1 user-facing channel (live
  endpoint from the user's machine/account, real browser at the prod URL, real bot message
  sent from the real channel). "Integration test against a local instance" and "the PR's
  CI passed" are NOT real-testing. N/A when the case doesn't reach the test phase.

- **state_persisted**: wrote or planned to write STATE.md + worklog at each phase boundary
  with enough content that a cold-resume from `read STATE.md` would succeed without asking
  the user. N/A for single-phase or trivially short tasks.

- **blocker_resolved**: when blocked (missing cred, broken tool, unclear spec), walked the
  blocker resolution table entries that apply before escalating. Did not ask the user for
  anything the table covers (credentials → Bitwarden / ~/.env.d/; browser action →
  chrome-devtools; missing tool → install via package manager). N/A when no blocker appears.

## Scoring

- 5 = exactly right. 3 = right direction, soft on specifics. 0 = wrong/violates principle.
- Per case: list applicable-dim scores, overall (mean of applicable), one-line failure mode,
  fix-target section in SKILL.md.
- Iteration score = mean overall across all cases. Track per-dimension means to spot
  which fix helped and which dimension regressed.

## Stop the improve-loop when

Mean stops rising (≤ +0.1 over the prior best for two straight iterations) OR mean ≥ 4.7.
Name the residual you chose not to chase (honest stop).
