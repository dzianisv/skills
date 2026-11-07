---
name: dev-workflow-supervisor
description: "Use when an hourly project check must find stalled tasks, check live subagent ownership, dispatch actionable work, and verify completion."
---

1. **Open the board pull + the Work Log. Read every non-Done/Closed row.**
   - Settle first: book prior receipts from API state.
   - Classify: `cause|evidence+time|held step|owner|next|artifact`. Statuses: Open/In Progress/Blocked/Done/Closed only.
2. **For each Blocked row: resolve the blocker yourself.** (The Blocked test below decides what may stay Blocked.)
   - Blocked only for owner's (a) money, (b) time/presence, (c) credentials, or absent fleet access; tried routes on the row (`tried…|failed because…|changes when…`); readable systems always workable.
   - **Blocked test — a row is Blocked only if ALL three are on the row:** (1) current-state readback this run; (2) ≥1 alternate route tried for the held operation; (3) a repair in flight, OR the held operation is a reserved class (money / owner's time / owner's credentials). An unblock stated as a future event (recalc, reset, expiry) or the owner's payment, with no repair in flight, FAILS the test by definition — the row is In Progress with a subagent, never Blocked.
   - One repair per root cause; verify exact SHA; resume dependents. Canary/CI fail: stop the release, continue the repair; one justified rerun max.
   - Decisions mine except (a)–(c): decide, record, proceed; a known fix is a defect to run, not an owner choice.
   - Release = product owner's call: live-verified (green on exact SHA + live proof) → dispatch same run; never park on the owner's word.
3. **For each In Progress row: check its dev_workflow subagent is live. Not live → start one, same sweep.**
   - Session ID in `Owner session ID`, verified this run.
   - Stalled (no activity + no new artifact since last sweep): verify, close, ONE replacement at the current stage — same sweep.
4. **Count slots: In Progress < 3 and a workable Open/Blocked row exists → start its subagent, move it to In Progress.**
   - Goal-fit — default close: keep only goal-critical (name the failure mechanism) or live execution, keep-reason on the row; close with dated reason + record pointer; never delete.
   - Done = merge SHA + Stage 5.5 + Stage 6 read back; merged-PR sweep every run.
5. **Report, four blocks only: Blocked (+ reflect why I did not resolve each) / Blockers resolved / In Progress now / Open left.**
   - Blocked line: name + reason + (repair: live — owner / or class: a|b|c).
   - In Progress now: name + live subagent (session verified this run); listed without one = run failure. Open left: name + why it stays open.
   - Nothing else; no change = silence (self-edit line excepted).
6. **Rewrite Agents Context.**
   - Self-edits: schedule/delivery/owner/enabled/parameters byte-identical; no authority growth; reported + logged.

State = Work Log only; values from the job body — never invented. I never implement — subagents run `dev-workflow`. Run-end mismatch (In Progress, no live subagent; workable row unstarted, no reason) = run FAILED, escalated.

Rules + rulings: **ANNEX.md**, same folder — binding where silent; this loop wins conflicts.
