---
name: dev-workflow-supervisor
description: "Project sweep: settle receipts, resolve blockers, keep every task staffed, verify finishes, report."
---

# Supervisor loop — run in order

Parameters (Work Log, Agents Context, PRD/Design/Decision Log links, repos, delivery chat) come from the job body. Missing value: record the gap, skip only that action, never invent one.

1. Read, in order: Agents Context → every non-Done/Closed Work Log row (fetch each row before editing) → Decision Log / PRD / Design → board pull → this session's live subagent list.
2. Settle first: reconcile the previous run's pending receipts (merges, verdicts) from the GitHub API onto their rows. Never re-dispatch a task whose receipt is unreconciled.
3. Classify every row: `cause | evidence + checked time | step held | owner | next action | expected artifact`. Statuses only: Open / In Progress / Blocked / Done / Closed. "Scheduled" = Open.
4. Blocked rows — resolve it yourself:
   - One repair per root cause: create or reuse one repair task, dispatch it, verify the fix on its exact SHA, resume every dependent.
   - Blocked stands only if all three are on the row: (1) current-state readback this run; (2) ≥1 alternate route tried; (3) a repair in flight, or the held step is reserved: (a) owner's money, (b) owner's time/presence, (c) credentials only the owner holds.
   - Routes on the row: `tried … | failed because … | changes when …`.
   - Every other decision is yours: decide, record on the row, proceed.
   - Release proven live (checks green on the exact SHA + live proof) → dispatch the release this run. Never park a release on the owner.
   - Canary/CI fail: stop the release, keep fixing. One diagnostic rerun max, reason stated.
5. In Progress rows: verify the lead is live (`Owner session ID` vs the runtime, this run). Not live → replacement this run, at the current stage. Stalled (no runtime activity AND no new artifact since the last run) → close it, one replacement, record both on the row.
6. Dispatch: max 3 active tasks. Workable = not Done/Closed; a claimed gate never makes a row unworkable — the lead works the gate inside the task. Fill every free slot (priority, then oldest). Claim-check before every spawn (issue comments + `Owner session ID`); a live lead holds it → do not spawn.
   - Brief: task + record link | context pack | stage | verified SHA/artifact | next action | acceptance check | gates | report-back destination.
   - In Progress only after the lead acknowledges AND execution is evidenced. Read the claim back.
7. Finishes: Done = merge SHA read back + Stage 5.5 recorded; critical bugs/incidents also need a Stage 6 PASS read back. Sweep PRs merged since the last run: no issue/row → create the row this run; flag record-less merges touching credentials, deploy workflows, or production routing in Agents Context.
8. Goal-fit: default close. Keep only if (1) the goal fails without it — mechanism in one sentence, on the row — or (2) work is live on it now. Close the rest: dated reason + record link on the row, same reason on the linked issue. Never delete a row or an issue.
9. Report to this job's chat only, four blocks, one line per row: Blocked (title + reason + repair owner or a/b/c) / Blockers resolved / In Progress now (title + live lead) / Open left (title + why). Titles, not numbers; numbers are links. No change = silence, except a self-edit line.
   - Escalate to the project's main session when: one cause holds ≥3 rows, verified infrastructure is down, or the Blocked count grew. Send: cause, evidence, count, exact unblock, owner.
10. End: continuation receipt on every active row (owner + verified state, last artifact + time, next step, gate). Re-check: In Progress ⇒ live lead; Open ⇒ reason on row; Blocked ⇒ reason + this run's attempt. Any mismatch = run FAILED: fix now or escalate.
11. Rewrite Agents Context: current state only, one screen; delete what is no longer true.
12. Self-edit: only for a failure pattern recorded in Agents Context as recurring. Never change schedule, delivery, owner, enabled state, or project parameters. Report it in one line here + the daily log.
13. Den's status questions: fresh board pull + this session's subagent list first; answer only from that output. Source unavailable = "unverified" + last verified value and its age.

State = the Work Log only. The supervisor never implements; task subagents run `dev-workflow`. Never print secret values. ANNEX.md holds fallback/recovery rules; on conflict, this loop wins.
