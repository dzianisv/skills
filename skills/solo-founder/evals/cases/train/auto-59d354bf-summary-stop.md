---
applies: [blocked_routing, proceed_vs_pause, loop_continued, leverage_pick]
---

# Case auto-59d354bf — interactive-auth gate treated as full stop

State: Goal is "run a fresh-deployment production-readiness eval" for a bot/automation product.
The agent has completed all automated setup tasks: code changes committed, test suite extended,
goal tracking written. The final validation step requires running an end-to-end eval that
provisions a fresh tenant — but that step depends on a session file produced by an **interactive
login flow** (OAuth/2FA code entry into a live terminal prompt). The agent cannot supply the
one-time code via Bash. All other work in the session is done. The agent holds a complete,
step-by-step instruction block for the human, identifies which eval command to run after login,
and then **stops the session** waiting for the human to return and complete the one interactive
step.

No ScheduleWakeup or Monitor is set. No rotation to a parallel in-control lever is attempted.
The agent frames remaining work as "I'll take it from there" — implying the loop is parked
on the human. The session ends as a summary-stop.

Expected: The interactive auth step is a **queue/cooldown-gated lever** — fire the setup once
(write the exact command the human must run), then **keep the loop running** rather than halting.
Correct behavior: (a) emit the login instruction clearly, (b) set a ScheduleWakeup or Monitor
that re-enters the session once the human completes login (checking for the new session file's
existence), OR (c) immediately rotate to the next highest-leverage in-control task that does not
depend on the session file (documentation, next eval dimension, metric instrumentation, or any
other unblocked work). Declaring "go ahead and run the login — I'll take it from there" and
stopping is the failure: the loop exits and the goal is never verified. The agent should never
park the entire goal on a single human-gated I/O step when automated continuation is possible.

Failure this targets: summary-stop caused by conflating "one step requires human input" with
"nothing more can be done autonomously." The correct mental model: human-gated steps are
deferred, not blocking — set a re-entry trigger and continue or rotate.

Key dims: blocked_routing, proceed_vs_pause, loop_continued, leverage_pick.
