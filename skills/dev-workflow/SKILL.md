---
name: dev-workflow
description: "Run a development task end to end: claim, context, design, implementation, review, merge, validation."
---

# The Workflow — every development task

One task = one GitHub issue + one Work Log row + ONE owning task subagent (the lead). The lead runs Stages 0–6 by spawning stage subagents; it never implements inline. Stage subagents execute only their stage, inherit the lead's claim, never re-claim or restart the workflow. The main session never implements; it monitors via Work Log + GitHub readbacks and intervenes on stalls.

## Run checklist
- [ ] Board pulled fresh (`pull_status.py`); cross-checked against the live subagent list.
- [ ] Start order: issue (scope + acceptance criteria) → Work Log row → one lead dispatched (3-task limit, priority order).
- [ ] Stage 0: nobody-else check (48h); claim comment posted + read back; issue updated at design-done / fix-shipped / merge.
- [ ] Stage 1: context brief in hand; context pack created on the issue.
- [ ] Pattern-expressible defect: scripted repo-wide sweep is the first artifact; command + full hit list on the issue.
- [ ] Stage 2: lane chosen; feature-lane design in Notion + independent review PASS before implementation.
- [ ] Bug: design gap recorded before the fix starts.
- [ ] Stage 3: implementation subagent only; PR opened linking the issue; implementer never merges.
- [ ] Stage 4: review per `claude-code-review`; loop until clean; sweep re-run = zero unfixed hits; test-count delta recorded.
- [ ] Stage 5: verdict comment read back via API before merge; merge verified by SHA readback.
- [ ] Stage 5.5: Design/PRD sync checked after merge; outcome recorded on the issue either way.
- [ ] Stage 6 (critical bugs + incidents only): validation by a non-implementer, live; only then issue closes + row Done. Everything else closes at Stage 5 + 5.5.

## Board
Pull, never from memory: `python3 ~/workspace/custom-skills/dev-tasks/scripts/pull_status.py` (per-project variants exist, e.g. `pull_status_vibebrowser.py`). Cross-check against the live subagent list: items with an agent, agents on dead items, items with no agent and no gate.

### Den's status request (trigger: `dev-workflow-supervisor` step 13)
1. Table from the fresh pull. Columns: task **title** (number is a link only) | what it resolves, one plain line | status.
2. Stall reflection per row: my stall = a stage finished and the next never started — name it. A gate (money, sign-in, fleet, CI, third party) is verified against the exact step + current evidence and exempts only the dependent work, never the whole task; name its unblock in one phrase.
3. Push in the same turn: steer the live lead; dispatch actionable unclaimed work under the slot/priority rules after claim checks. One line per push under the table. A status answer that lists stalled actionable work without pushing it is a failed run.

### Starting a task
Order: (1) issue exists with scope + acceptance criteria; (2) Work Log row created — no row, no start; (3) one lead dispatched within the project's 3-active-task limit, priority order. A lead that ends without Done/Closed leaves a continuation receipt on the row (blocker, done, remains); the Supervisor starts the next lead in the same run. A gate with its own Work Log row is a separate task with its own lead.
Every stage brief names: the lead, the inherited claim, the assigned stage, the goal, the issue, design/PRD links, prior decisions, acceptance criteria, permissions, a stopping condition, and the context pack. Every handoff returns: result, evidence, unresolved issues, recommended next step.

### Keep the chain running
- On every stage result: read back the artifact + acceptance evidence, update the context pack, start the next allowed stage via the message/resume tool. Reporting a result is not continuation.
- Verify a child's PASS/Blocked against the artifacts before acting (Standing rules: reports are not evidence). For Blocked: check the exact dependency + alternatives, continue independent substeps, or record the gate with evidence, owner, resume condition. A gate stops only dependent work.
- Before yielding, persist in the context pack: lead ID, current stage, stage-subagent IDs, artifact links. On resume/replacement: adopt or steer live children; confirm a child stopped before replacing it; never restart finished stages from chat memory.
- One active stage subagent per task by default. Model choice: bounded work with clear checks → cheaper capable model; ambiguous architecture or hard debugging → stronger model. Reviewer ≠ implementer, always.

## Stage 0 — Claim (lead only, before stage work)
1. Issue exists (create if missing, with scope + acceptance criteria).
2. Nobody-else check: issue comments, open PRs, commits from the last 48h. Another active claim → stand down, withdraw your claim, report, pick different work. Bot authors (`vibesoftwareengineer[bot]`, `agentpodsoftwareengineer[bot]`) are shared credentials and prove nothing; an actor is identified only by a self-signed claim (branch prefix `codex/…`, "Codex chat <uuid>", OpenCode `ses_…`) — and those are self-reports.
3. Post the claim comment first: agent name + role + task/branch + scope. No session IDs in public comments — session IDs live in the Work Log ownership fields. Read the claim back. Mark In Progress only after acknowledgment + evidence execution started.
4. Ownership transfer: exactly one owning session per task. The old owner stops its agent FIRST, then hands over in one message: full brief + "you are the single owner now" + "check the issue for a stray claim from the stopped session". The receiver confirms ownership on the issue before working.

## Stage 1 — Context (context subagent)
The context subagent reads the issue completely (body, all comments, linked PRs/issues, labels) + the Notion design and PRD, and returns ONE brief: what is asked, current status, prior decisions, acceptance criteria, existing evidence. Later stages reuse it; refresh changed decisions, ownership, code SHA, and blocker evidence before acting. Never work from the title alone.

### Context pack — one per task, on the issue
One maintained comment on the issue carries all cross-stage state — never session memory. Stage 1's brief is its initial content. The lead updates it at every stage transition, before the next stage brief. Fields:
- Current stage + lead (name/role; session ID only in the Work Log)
- Design / PRD links
- The enumerate-first sweep: exact command + full hit list — or the statement that the defect class is not pattern-expressible
- Every completed stage's verdict with its comment ID (Stage 4 verdict, Stage 5 merge SHA, Stage 5.5 outcome, Stage 6 verdict)
- Decisions taken: what, by whom, when (incl. lane choice and escalations)
- Open residuals, each with owner/gate
- The exact next action

Rules: a stage subagent reads the pack + the full issue thread before acting and says so in its first artifact. A new lead reconstructs state from pack + issue + Work Log row, never from memory. Pack disagrees with artifacts (PRs, comments, SHAs) → artifacts win; fix the pack before any other work. A stage result not reflected in the pack has not been handed off.

## Stage 2 — Design (Notion)
Lane by task type:
- **Feature** (new behavior/surface, or any contract/invariant change): full Stage 2 — design in Notion + independent review PASS before implementation.
- **Bug fix:** light design — root cause + design gap recorded (investigation track step 2); short amendment to the design doc where one exists. No separate design-verification loop — unless the fix changes a contract, invariant, or cross-service behavior → feature lane.
- **Simple / alert fix** (root cause known, one component, no contract change): no design stage — root cause + intended change in one issue comment, straight to Stage 3. Stage 4 applies in full. If the work is not confined, escalate the lane and say so on the issue.

Steps:
1. Find the design + PRD in Notion. Read them.
2. Design exists → spawn a design review subagent. Method = `claude-code-review` applied to architecture: (i) current-state agents map what exists, from code + live system (sweeps and reads, never doc impressions) — components, contracts, invariants; (ii) fit agents check the design against that map — builds into what exists? contracts/invariants preserved? acceptance criteria testable? High-signal only. Every finding is validated by a fresh agent before it can block the PASS; unvalidated findings are filed notes. A PASS names the current-state map it was checked against.
3. Design missing → spawn a design subagent: writes approach, scope boundaries, acceptance criteria into Notion per `dev_docs` (30-second read, concrete nouns and numbers). Then step 2 runs on it.
4. No implementation until the design exists in Notion and passes review.

## Investigation track (bug hunts, root-cause, verdicts)
No Stage 2 upfront.
1. Investigate to a root cause, with evidence. Separate verified from unverified.
2. Bug found → record the design gap before the fix starts: (a) the gap that allowed the wrong implementation (no design at all = the gap; say so); (b) record at the lane's depth — Notion design update for feature-lane, issue comment for simple/alert fixes; (c) fix through the normal stages; review checks the fix against the recorded gap. Stage 5.5 still runs after the merge.
3. No bug (works as designed, external cause) → record the verdict on the issue. A design weakness exposed → step 2 applies.
4. A verdict never dangles: every gap/follow-up it names leaves with an artifact before the session ends — a filed follow-up issue (linked), a fix PR, or an explicit park naming owner/gate. "Recorded for scheduling" is a dropped stage.
5. Sibling sweep: a fix for a shape that can exist in siblings is not done until every sibling call site is checked. For a pattern-expressible defect class, the FIRST artifact is a scripted repo-wide sweep — command + full hit list on the issue before implementation. Implementation fixes the list; Stage 4 re-runs the command and verifies zero unfixed hits. Sweep the SHAPE (the code pattern), not the variable name, across every directory family that can carry it; or bound the sweep explicitly on the issue and file the remainder as a linked follow-up in the same task. Not pattern-expressible → state it plainly on the issue; sampling review is then a known limit.

## When a stage cannot proceed
- Before Blocked, record: `cause | current SHA/run/failed step | exact operation held | owner | next action | expected artifact`. An old pre-fix failure is not proof current code fails. Check an authorized alternative; continue independent substeps. Never wait for a release tag to run an independent workflow.
- Own the dependency: find or create the ONE scoped root-cause repair (per `dev-workflow-supervisor` step 4); send it to the Supervisor for priority + slot admission — never dispatch another task parent inside this task or bypass the 3-task limit. Record this task's gate + resume condition; continue independent substeps; release the slot only through the Supervisor after confirming no execution is live. After verified repair evidence, resume at the owed stage and recheck acceptance. Never weaken a test or change a contract to clear a blocker.
- Failed canary/CI stops the release, not the repair (supervisor rule: one justified diagnostic rerun; a reproducible failure goes to diagnosis + repair).
- Before declaring a secret missing, check the configured credential sources (Secure Vault, 1Password, Bitwarden where configured) with supported tools. Never export a vault or expose secrets to work around a gate.
- On a Supervisor handoff: read new/revised Product Owner guidance first, record the consumed revision in private task notes (no Last updated refresh), check it against current evidence + permissions, resume the permitted stage, link the artifact. An unchanged task count never cancels a handoff — compare SHA, run/attempt, failure cause, acknowledgment, artifact movement. Reuse the existing repair + owner. Step still cannot run → return fresh failure evidence + the smallest decision needed; never repeat an old blocker unchecked.

## Stage 3 — Implementation (implementation subagent)
Brief: issue + Notion design/PRD + acceptance criteria. Works in a branch, opens a PR linking the issue, reports diff summary + its own local test evidence. Never merges.

## Stage 4 — Review loop (review subagent)
1. Reviewer reads the design/PRD + acceptance criteria first, then the PR against them: diff actually read, evidence claims checked, criteria tested one by one.
1a. Method = `claude-code-review` (`~/workspace/custom-skills/claude-code-review/SKILL.md`): parallel compliance + bug agents, high-signal only, independent validation per finding. Only validated findings FAIL a PR; the rest are filed notes.
2. Findings → implementer fixes → re-review. Loop until clean. No "good enough" exits.
3. Two rounds bouncing with substantive findings = structural problem: stop, diagnose the design or the brief, restart the stage.
4. Evidence runs in a REAL git checkout, never a tarball tree (a tarball silently fails ~39 git-dependent tests). Suite cannot complete → bounded head-vs-base comparisons on identical trees; report the hang itself.
5. Test-count delta in every verdict: cases added / removed / test-file count before→after. Net growth fails the review unless an exception is recorded on the issue; the only exception is AC-mapped cases for genuinely new behavior.

## Stage 5 — Merge (lead)
1. Gate: the Stage 4 verdict comment EXISTS on the PR and the lead has read it back via API (comment ID + head SHA it names). A delivered PASS is not the gate. Then: CI green on the PR head → merge → verify by SHA readback → post the merge comment.
2. Merge call cannot run (rate limit, outage) → land the same tree directly on main via the Git Database / Contents API (one commit, base = current main, tree = the reviewed head's tree). Verify by readback that the landed tree equals the reviewed tree. Record on the issue: "landed direct, PR #N superseded" + commit SHA + verdict comment ID. Close the PR with that record when writes allow. Never hold a reviewed change for a rate limit.
3. A check that ran and failed blocks the merge — unless a triage recorded on the PR proves with run IDs that the identical failure occurs on main or is fleet-caused AND this change could not have caused it. Checks that never ran (CI globally unavailable) may use the local-evidence ladder — full relevant suite on the exact SHA, merge on local evidence, bypass + reason recorded on the issue — only where the project rules + user explicitly authorize that path. Queue delays grant no exception. Otherwise keep the merge held and repair the infrastructure.

## Stage 5.5 — Design/PRD sync (after every merge)
1. Design: does the merged change alter anything the Design doc (or a standing design page) describes — behavior, contracts, invariants, alert/verdict semantics, workflow rules, file/test inventory? Yes → update the doc in this task (per `dev_docs`), read it back, link the update on the issue.
2. PRD: does it alter anything the PRD promises — product behavior, user-visible flows, pricing/entitlement mechanics, supported surfaces? Yes → update the same way.
3. Record the outcome on the issue either way: "Design/PRD sync: Design updated <link> / PRD updated <link>" or "checked — no update needed" + one-line reason. No recorded outcome = task not closed.
4. Notion edits: `update_content` matches the page's markdown, not the fetched rendering — anchor on plain-text phrases. Verify every edit by re-fetch before recording it.

## Stage 6 — Validation (critical bugs + incidents ONLY; validation subagent, never the implementer)
Scope: production broken/degraded, user-facing outage, data loss/corruption, security, payment-impacting. Everything else closes at Stage 5 + 5.5: merge SHA read back + sync recorded = Done, issue closed, row Done. Later validation of standard-lane work may run; anything it finds opens a NEW bug task, never reopens the closed one.
For critical/incident tasks, immediately after merge:
1. Verify the merged result on main: the changed flow works end to end in a real environment; adjacent flows unbroken.
2. Re-run the acceptance criteria against account/tier/state variants absent from the committed fixtures (fixtures encode the happy class only).
3. Evidence on the issue + Work Log row in a comment labeled **"Stage 6"**, repeating the test-count delta line. Failure → reopen the relevant stage.
4. Issue closes + row Done ONLY on Stage 6 PASS + the Stage 5.5 outcome recorded.
Deploy is not part of this workflow: whether merged work ships is the product owner's separate release act; it never keeps a task open.

## Standing rules
- **Testing:** no unit tests, no mock-based tests. A test runs the real product flow end to end or live against real services. Do not grow the test count; missing coverage → extend an existing integration/e2e test, never a new file. A PR adding a unit or mock test fails Stage 4 on that ground alone.
- **Customer/tenant/Stripe facts come from the Admin API** (AgentPod repo `docs/admin.md` + `.agents/skills/admin-console/SKILL.md`; auth via the Notion "🔑 Admin Access" page). No customer/payment verdict until that route was tried.
- **Verify live, never from document audits.** "Unverified" is a hypothesis. A stage counts only with its artifact: page updated, PR open, verdict recorded, merge SHA read back.
- **Sweeps close, never delete.** Never delete an issue with a merged PR or any pipeline record.
- **Runner/CI claims are per-lane, per-run facts.** Before citing a runner blocker, read back the exact run's jobs: runner name, requested labels, state. Failed checks ≠ no runner; queued ≠ fleet offline. Never reuse a runner diagnosis without refreshing it.
- **Subagent reports are not evidence.** Read back EVERY reported identifier (PR/issue number, head SHA, merge SHA, comment ID) from the GitHub API before acting or reporting. A number that 404s is unverified — never pass it on. Issues and PRs share one number space: verify the object type via the API and say which it is in the claim comment.
- **A stage agent that ends without a report may still have done the work.** Before re-dispatching, check branch heads vs the last verified SHA, PR comments, evidence files. Re-dispatch only the missing remainder. Recovery search order: (1) recent PRs sorted by creation descending; (2) full branch list, paginated (commit search indexes only default-branch commits; name greps miss unconventional branches).
- **Tooling hygiene:** single-line Notion records — replace the FULL old line, read back that exactly one exists. Helper scripts live under `~/workspace/`, never `/tmp`. Parallel API calls write to separate output files. A half-finished API reconstruction left in a workdir carries a state note (base commit + tree SHA, blobs fetched/total, resume command).
- **Reporting:** outcomes, not stage narration. Surface mid-flight only for a genuine blocker you cannot resolve, with what you already tried.
- **Decisions:** non-financial decisions inside a ticket are the main session's — decide and record. Financial impact or Den's credentials/time go back to him.
- **Decision reversal:** when Den reverses a recorded decision, execute the same turn: supersession comment (old + new) on EVERY issue/PR carrying the old decision, duplicates included; reopen anything the old decision closed.
- **Decision asks present the full menu:** every disposition the record supports (money owed: refund / deliver / credit / write off) — never a single preselected approve/deny.
- Never print secret values anywhere (issues, Notion, chat, logs).

### Local-evidence environment (when a real checkout or local suite is needed)
- Exec calls share no system state: installs and `/tmp` vanish between calls; `~/workspace` persists. Local Postgres: `apt-get download` the .debs, `dpkg -x` under `~/workspace`, run as a throwaway non-root user (root is refused; a dropped uid cannot traverse `/home/hatch`). Run suites promptly in the same stretch of calls.
- A backgrounded run reporting exit 0 with empty output is not evidence — capture output to a workspace file, cite the summary lines.
- Subprocess-heavy suites time out under parallel batch load on this VM — run them standalone.
- Before pushing, diff every touched file against CURRENT main blobs; re-read the head SHA immediately before pushing (main moves mid-task; a stale base silently reverts fresh merges).
- Test fakes encode contracts: a fix that tightens a consumer to the producer's real shape updates the fake to the real shape — say so in the PR (fixture correction, not test weakening).
- Reconstructed checkout (clone blocked): build the tree from the Git Database API (recursive tree + blobs), `git init`, force-add gitignored-but-tracked files, restore symlink modes. Valid ONLY when local `git write-tree` equals the API tree SHA of the base commit; if main moved, re-base the changed blobs onto the new tree and re-run the gate on the final tree. Subtree variant: `git write-tree --missing-ok` (git ≥2.43) is valid only with per-file sha1 verification of every fetched blob + an API check that the PR tree equals the local final tree.
- Never `git add -A -f` after `npm ci` in a reconstructed checkout (stages all of node_modules): stage before installing, or stage per file via plumbing (`git read-tree <base-tree>` + `hash-object`/`update-index --cacheinfo`) and let the write-tree gate prove the index.
- Blob fetches for a reconstruction go serially (parallel fetches hit write EPERMs and rate-limit cooldowns). `/rate_limit` readings flip between credential pools and are not evidence — a real repo call returning 200 is.

## Improving the process
Fold every friction lesson into this skill at reflection time, before reporting the task done. Keep the pull script honest: a linking shape it misses gets fixed in the script and noted here.
Stall patterns to sweep for: (1) Stage 4 reviews undispatched while larger items absorb attention — sweep for un-reviewed PRs at every status request; (2) merged-but-open issues — the merge comment classifies every residual (fleet / Den-gate / follow-up issue with number), the weekly review re-classifies; (3) backlog sweeps spinning during other-actor waves — light check only while every affected task has a verified live owner and nothing changed (SHA, run/attempt, failure cause, acknowledgment, artifact movement); a missing/stopped owner or changed failure requires recovery even at the same task count.

## The Supervisor — pointer
Each project has ONE supervisor job running `dev-workflow-supervisor` (`~/workspace/custom-skills/dev-workflow-supervisor/SKILL.md`), instantiated per project with project parameters only. Roles, the run loop, dispatch, recovery, escalation, and self-improvement are defined there and nowhere else. The `overflow` skill is the task subagent's legacy alias.

## Work Log (Notion) — the context ledger
One Work Log database per project:
- AgentPod: https://app.notion.com/p/2e0b6815aa11436c82cd0882143be573 (database `2e0b6815-aa11-436c-82cd-0882143be573`, data source `collection://98e9d187-9a6f-4e79-8fab-c4cbf624da8b`)
- VibeBrowser: https://app.notion.com/p/93ea3e88ac6f4a7e8785e8be96ef54b6 (database `93ea3e88-ac6f-4a7e-8785-e8be96ef54b6`, data source `collection://d9618867-129c-4f09-a9c6-ae59f763cc5d`); project config `~/workspace/goals/vibebrowser-public-release-readiness/PROJECT-CONFIG.md`; pull `pull_status_vibebrowser.py`
- HomeSteadyLink: https://app.notion.com/p/ae5b1c4289224e7a8a8b6ca85b4afb0e (database `ae5b1c42-8922-4e7a-8a8b-6ca85b4afb0e`, data source `collection://8023c83b-bc7d-4aa9-a3b4-b02efa1cf4bf`)
- OpenCode Mobile: https://app.notion.com/p/9146ab2c9725404b8c4ac930de651f4e (database `9146ab2c-9725-404b-8c4a-c930de651f4e`, data source `collection://f18cf22d-a1a5-4a3e-9ccc-65a1f289a1e7`)

Properties, in order: **Title** · **Last updated** · **Description** (what it is + the exact gate) · **Status** (exactly five: `Open` / `In progress` / `Blocked` / `Done` / `Closed`) · **Owner** (multi-select; one owning agent) · **Owner session ID** (text; the actual owning session ID) · **Links** (issue URL + PR URL) · **Doc** (Notion design/doc URL).

Row rules:
- Row created when work starts (Starting a task, step 2). Updated at every execution milestone: claim → design → PR → review → merge → validation → block → done.
- `Last updated` = actual evidenced execution/progress time, incl. verified artifact movement discovered later — never scan time. Review-only guidance, schema edits, ownership backfills, and Blocked→Open relabels do not advance it; date those in the comment. Refresh Description when the gate changes. Keep artifact URL/SHA + movement time in notes; never invent a date for unknown progress.
- `Owner` = the responsible agent (existing option: Muse, Codex, Hermes), not a human assignee or a stage's model. `Owner session ID` = the owning task session's exact ID, verified from the runtime or an explicit claim. Never copy a Worklog ID, issue number, model name, or guess into it; unavailable → leave blank, record why, resolve ownership before a new dispatch; never erase an existing verified owner. Stage-subagent IDs and the Supervisor session stay in notes. Transfer only after the prior owner stopped or handed over, with the old owner + evidence recorded. On claim/resume: fresh-read the row + competing claims, write + read back both fields, record execution evidence. A review-only comment does not acquire ownership.
- `Open` = not being worked now; the row text carries the concrete next step + what starts it. In progress only after acknowledgment + evidence execution started/resumed — not a comment or a dispatch receipt.
- Blocked rows name the exact unblock in Description (whose decision, what input, which host). "Blocked" without the unblock is a stall, not a state. A Blocked row whose reason cleared is worked the same run, not merely relabeled.
- Done = merge SHA read back + Stage 5.5 recorded; critical bugs/incidents additionally require a Stage 6 PASS. A completed task is Done, never Closed; Closed = closed without being done, reason + record pointer on the row.
- Every board report reconciles GitHub (pull script) against the Work Log; a row whose GitHub state moved is updated in the same turn; a Done row is verified against GitHub before being repeated as done.
- Staleness: no artifact movement >2h = stall candidate even if Last updated changed. Inspect the live owner + fresh gate evidence; steer a live owner; transfer a stopped owner's claim before re-dispatching.

## Skill source and updates
Canonical source for `dev-workflow` + `dev-workflow-supervisor`: https://github.com/dzianisv/skills. Project/runtime copies are mirrors. Before publishing an update: read the current canonical bytes + base commit, apply scoped edits, review the full diff for lost rules. Base changed → re-read and reconcile; never overwrite canonical with an older local file. Refresh both skills from the same reviewed commit, record it, verify bytes. A repo update is not proof the runtime loaded it — verify runtime paths + the scheduled jobs' source separately.
