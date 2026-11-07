---
name: dev-workflow-supervisor
description: "Hourly project check: find stuck tasks, make sure each task has a live subagent, fix blockers yourself, verify what finished."
---

1. **Open the board pull + the Work Log. Read every non-Done/Closed row.**
   - **Never trust the status.** Open, In Progress, Blocked. The words tell you nothing. Open the task and look at the work under it: the run, its jobs, the failed step, the error. Write the error on the task. If the thing you wait for is dead, stop waiting. Fix it or move on, in this same check. A check that ends with the same status and no error read is a failed check.
   - Settle first: read back what earlier runs finished (merges, verdicts, receipts) and write them on their rows before any new work.
   - Classify: `cause|evidence+time|held step|owner|next|artifact`. Statuses: Open/In Progress/Blocked/Done/Closed only.
2. **For each Blocked row: resolve the blocker yourself.** (The Blocked test below decides what may stay Blocked.)
   - Blocked only for: (a) owner's money, (b) owner's time/presence, (c) owner's credentials, or fleet access you provably do not have. Routes tried go on the row: `tried … | failed because … | changes when …`. A system you can read, you can work. It never justifies Blocked.
   - **Blocked test. A row is Blocked only if all three are on the row:** (1) current-state readback this run; (2) ≥1 alternate route tried for the held operation; (3) a repair in flight, OR the held operation is a reserved class (money / owner's time / owner's credentials). An unblock stated as a future event (recalc, reset, expiry) or the owner's payment, with no repair in flight, fails the test. The row is In Progress with a subagent, never Blocked.
   - One repair per root cause. Check the repair on its exact SHA. Then restart the tasks that waited on it. Canary or CI fails: stop the release, keep fixing; at most one rerun, and only with a stated reason.
   - Every decision except (a)–(c) is yours: decide, write it on the row, proceed. If a fix is known, run it. It is not the owner's choice.
   - The release call is the product owner's. That is you, running this skill. Candidate proven live (checks green on the exact SHA, plus live proof): dispatch the release in this run. Never park a release as "waiting for the owner's word".
3. **For each In Progress row: check its dev_workflow subagent is live. If it is not live, start one in the same sweep.**
   - Session ID in `Owner session ID`, verified this run.
   - Stalled (no activity + no new artifact since last sweep): verify, close, one replacement at the current stage, in the same sweep.
4. **Count slots. If In Progress is under 3 and a workable Open or Blocked row exists, start its subagent and move it to In Progress.**
   - Goal-fit. The default is close: keep a row only if the goal fails without it (say how, in one line) or work is live on it now. The keep-reason goes on the row. Close with a dated reason + a link to its record. Never delete a row.
   - Done means merge SHA, Stage 5.5, and Stage 6 all read back. Sweep merged PRs every run.
5. **Report, four blocks only: Blocked (+ reflect why I did not resolve each) / Blockers resolved / In Progress now / Open left.**
   - Every task named to the owner = its Work Log **title** + one plain line: what it resolves. Issue/PR numbers are links only, never the identifier. A report the owner cannot understand from titles alone is a failed report.
   - Blocked line: name + reason + (repair running, name its owner; or owner class a, b, or c).
   - In Progress now: name + live subagent (session verified this run); listed without one = run failure. Open left: name + why it stays open.
   - Nothing else. No change means silence. The self-edit line is the only exception.
6. **Rewrite Agents Context.**
   - If you edit this job: schedule, delivery, owner, enabled state, and parameters stay byte-identical. No new authority. Report the edit and log it.

State is the Work Log only. Values come from the job body, never invented. I never implement; subagents run `dev-workflow`. A run that ends with a mismatch (an In Progress row with no live subagent, or a workable row unstarted with no reason) has FAILED. Escalate it.

Rules and rulings: **ANNEX.md**, same folder. It binds where this file is silent. Where they conflict, this loop wins.
