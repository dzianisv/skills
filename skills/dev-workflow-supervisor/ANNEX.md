# Annex — dev-workflow-supervisor

Binding rules where SKILL.md is silent. Instructions only.

## Scan fallback
- Work Log query route fails or its allowance is exhausted: fall back in order — (1) fetch rows individually; (2) last verified counts + held-row list from Agents Context. Mark carried numbers "carried + source time", never fresh. Disclose the gap (which reads failed, what was carried, from when) in Agents Context. First run after recovery re-verifies the full scan before trusting any carried number.

## Tool failure
- One failed call never ends a run: (1) read back the target to resolve the outcome — a failed call is not proof the action did not happen; never replay an operation whose outcome is unknown; (2) retry once via an alternate route (connector vs CLI vs API helper, fetch vs query); (3) both failed → record tool + operation + error on the row, mark only that action pending with its resume condition, finish the run's remaining work.

## Ownership fields
- `Owner` = the one owning agent. `Owner session ID` = its actual session ID, verified against the runtime this run. Never put a row ID, issue number, or model name there. Unverifiable → leave blank, record the gap, do not erase an existing verified owner, do not dispatch a duplicate.
- Transfer only after the old owner is confirmed stopped or explicitly hands over. Stage-subagent IDs and the supervisor's own session go in notes, never in the ownership fields. Preserve both fields while a task waits or completes.

## Slots and admission
- Max 3 active tasks per project across all runs. A task subagent + its stage child = one task. A Blocked task with no live execution holds no slot. Count in-flight spawns as occupying slots.
- Overlapping runs: reconcile claims and live executions before dispatch. Safe admission cannot be established → leave pending, never race. Unknown execution state does not free a slot.
- Never interrupt an active task to fill a slot. Place in line = prose on the row, not a state.

## Stalled-owner recovery
- Missed acknowledgment deadline = failed handoff: inspect the target before any retry.
- Unobservable owner ≠ dead owner: record the access gap, do independent work, never duplicate it.
- Resume a stopped owner if supported and ownership is valid. Otherwise confirm it stopped, then dispatch ONE replacement at the current stage — finished stages are never redone.
- Uncertain resume result = no replacement.
- Same failure 3 cycles: stop retrying, record cause + exact unblock on the row, escalate once.

## Executor fallback
- Quota, rate-limit, access denial, spend limit = a real gate, not a fallback trigger. Never route the same blocked task through another agent, model, tool, or account to evade it. Never assume a subagent has an independent credit pool.
- Transient failure / terminated session: another available runtime may take the task. First verify capability, capacity, authorization, cost. Preserve the checkpoint in the Work Log (stage, SHA, artifacts, findings, permissions, next step), then spawn one replacement and read back its claim.

## Ask once
- Reserved-class decision (money / owner's time / owner's credentials): ask once, continue independent work meanwhile.
- A human-only step inside other work (a form, an approval tap): prepare everything else, hand the owner the exact step + exact input. Never park the whole task on it.

## Row bookkeeping
- `Last updated` = evidenced execution/progress time only, never scan time. Review-only comments, ownership backfills, and relabels do not advance it — date those in the comment.
- Keep the last artifact URL/SHA + its movement time in the row notes. Unknown progress stays unknown.
- Agents Context escalation line, refreshed every run: checked time, Blocked count, oldest blocker age, causes, last escalation sent.

## Standing constraints
- Runner/disk/CI fault: one scoped infrastructure repair task per root cause (reuse, or create with evidence + acceptance criteria). A blocked queue waives nothing: review, exact-SHA verification, and merge gates stand.
- Verify live, never from document audits. "Unverified" is a hypothesis, not a task.
- Observations go to the daily log, never to MEMORY.md.
