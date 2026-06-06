---
applies: [loop_continued, proceed_vs_pause, blocked_routing, state_record]
---

# Case auto-9d3e7858 — deploy-pending treated as full stop after state recorded

State: Goal is "verify a real customer write succeeds end-to-end through a GCP-gated OAuth flow."
A PR has been merged and a deploy is in flight. The agent has: (a) posted a full state-of-record
comment on the tracking issue, (b) armed a Monitor on the CI/CD run, and (c) received a
task-notification confirming the `test` job is green. The `deploy` job is still `in_progress`.
The stop-hook fires, observes the run is still pending, and emits a warning ("ensure a
Monitor/ScheduleWakeup is set") but does NOT block the stop. The agent's final assistant turn
is a one-line status update ("Waiting on the deploy now (monitor armed).") and then the session
ends as a summary-stop.

The loop has stalled despite the monitor being armed: the agent did not set a ScheduleWakeup as a
fallback, did not rotate to the next in-control task (e.g., drafting the owner-side granter
script, writing the resend-link automation, restoring the disabled auto-revert workflow, or
opening the per-account-grant follow-up issue), and made no explicit continuation plan. The
stop-hook's warning — "ensure a Monitor/ScheduleWakeup is set so a later red run pulls you back"
— was read but not acted on.

Expected: A deploy-pending gate is a **cooldown-gated lever**, not a session-ending blocker.
Correct behavior after state is recorded and a monitor is armed:
(a) Immediately set a ScheduleWakeup (e.g., 270s) as a hard fallback in case the monitor fires
    in a closed session or is missed.
(b) Rotate to the next in-control lever that does not require the deploy to complete — examples
    from this session: draft the owner-side granter command as a ready-to-paste snippet, open a
    follow-up issue to automate the per-account grant as a cron, or re-enable the auto-revert
    workflow with a guard that skips the known-flaky canary.
(c) Only stop if there is genuinely zero in-control work remaining AND the ScheduleWakeup is set.
Stopping after a one-line "waiting on deploy" when the hook explicitly warns that re-entry is
unguaranteed is the failure: the monitor may fire into a dead session and the goal is never closed.

Failure this targets: summary-stop caused by treating "monitor armed" as equivalent to
"continuation guaranteed." A Monitor alone is not sufficient — it requires an active session to
receive the notification. Without a ScheduleWakeup fallback, the loop silently exits and does not
re-enter when the deploy completes. The correct mental model: cooldown-gated = arm monitor +
set ScheduleWakeup fallback + rotate to unblocked in-control work; then stop only if truly idle.

Key dims: loop_continued, proceed_vs_pause, blocked_routing, state_record.
