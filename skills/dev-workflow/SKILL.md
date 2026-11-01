---
name: dev-workflow
description: "Run a development task end to end through claims, design, implementation, review, merge and live validation, delegating stage work to subagents."
---

# The Workflow — how every development task is worked

Den's standing process for ANY development task (feature, fix, infra code), dictated 2026-10-31. The main session running the Supervisor owns the board. Each task is run end-to-end by ONE task subagent, which spawns its own stage subagents. This skill is the whole dev process: board layer + per-task pipeline. (`dev_tasks` was consolidated into `dev_workflow` 2026-10-31; the pull script keeps its path under `dev-tasks/scripts/`.)

**Goal (Den, 2026-10-31):** bring the product to a public release that can ship without fear — infra proven ready, every offered feature proven working live, never by audit alone. The release tag remains Den's word; proven readiness is the agent's job.

**Compliance is mandatory.** The task subagent opens this skill and runs Stage 0. Stage subagents inherit the task subagent’s claim, read their assigned stage, and execute only that stage; they never claim the task again, restart the whole workflow, or dispatch another task subagent. Every brief names the task subagent, this skill and the assigned stage. Work outside the pipeline is a process violation — stop and return to the task subagent. The backlog cron's dev work follows these stages too.

---

## Board

Pull the board (never from memory):

```
python3 ~/workspace/custom-skills/dev-tasks/scripts/pull_status.py
```

It lists open AgentPod issues with their PRs, open AgentPod PRs with no issue, open AgentPod-Web PRs. Cross-check against the live subagent list: items with an agent, agents on items no longer on the board, items with NO agent and NO gate.

### On Den's status request — table, reflection, push

1. **Table** from the fresh pull (verify rows the script can't classify against GitHub directly). Columns: PR/задача (link; issue link if no PR yet) | что делает (one plain line) | статус — only: **В работе** · **В ревью (субагент)** (a Stage 4 review is running; Den never reviews code) · **Готов к мерджу** · **Ждёт CI / раннер** · **Ждёт Дена: <что именно>** · **Ждёт флот** · **Не начато**.
2. **Stall reflection** per row: *my stall* = a stage finished, the next never started (PR without review, clean review without merge, verdict without a fix agent) — name it plainly. *Den's gate* (money, sign-in, decision) or *external gate* (fleet, CI, third party) must be verified against the exact step and current evidence; it exempts only dependent work, not the whole task.
3. **Push, same turn, no asking:** steer the existing live task subagent; dispatch only actionable unclaimed work under the Supervisor’s task-slot and priority rules, after claim checks or confirmed ownership transfer, briefed with `dev_workflow` and the exact stage owed. One line per push under the table. A status answer listing actionable stalled work without pushing it or recording the gate/capacity wait is a failed run of this skill.

### Starting a task

Order: (1) GitHub issue exists, with scope + acceptance criteria; (2) Work Log row created — no row, no start; (3) ONE task subagent dispatched to own the task end-to-end, within the Supervisor’s project-wide three-active-task limit and priority queue. The task subagent's first action is the Stage 0 claim; it runs Stages 1–6 by delegating substantive stage work and retaining ownership/gate verification — it coordinates and verifies, it does not implement inline. The main session never implements dev work inline and never lets a claimed task sit ownerless; it monitors task subagents via the Work Log and GitHub readbacks and intervenes on stalls.

Every stage brief names the owning task subagent, inherited claim and assigned stage, and carries: the goal, the issue, the Notion design/PRD links, prior decisions, the acceptance criteria, the permissions granted, a stopping condition. Every handoff returns: the result, the evidence, unresolved issues, the recommended next step — never chat memory alone.

### Keep the stage chain running

The task subagent owns the whole task, not just one stage. It spawns separate subagents for substantive stage work; the task subagent retains claims, handoffs and gate/merge verification, and remains responsible after each subagent reports. Use the runtime’s supported completion delivery or wait mechanism. A completion notification is a handoff, not task completion; cron and the user must not be needed to restart the chain. Keep one active stage subagent per task by default. Yield while that child runs; reserve runtime capacity for children before admitting task parents.

On every stage result: read back its artifact and acceptance evidence, update the persistent task record, then actually start the next allowed stage or send failures back through the runtime’s message/resume tool. Reporting the result or promising the next step is not continuation. A child saying PASS or Blocked is input to verify, not a terminal verdict. For Blocked, check the exact dependency and permitted alternatives, continue independent substeps, or record a concrete external gate with evidence, owner and resume condition. A gate stops only dependent work.

Before yielding, persist task-subagent ID, current stage, stage-subagent IDs and artifact links in the task record. On resume or task-subagent replacement, inspect those children: adopt/steer existing work if supported, or confirm it stopped before replacing it. Reload the task record, current ownership and fresh artifacts; never restart finished stages from chat memory. Address instructions to the actual stage subagent through available runtime tools. If delivery fails or no continuation mechanism exists, persist the exact next action and report that limitation to the Supervisor; never imply the chain is running.

Model choice per stage subagent: bounded work with clear checks → cheaper capable model; ambiguous architecture or hard debugging → stronger model. The reviewer is always a different agent from the implementer.

---

## Stage 0 — Claim (task subagent only, before stage work)

1. The task exists as a GitHub issue (create if missing, with scope + acceptance criteria).
2. Check nobody else is working it: issue comments, open PRs, commits from the last 48h. Parallel actors are real (Den's local agent, the fleet). **Another active claim → stand down, withdraw any claim you posted, report, pick different work.** Never race another actor on the same ticket.
   Attribution: bot authors (`vibesoftwareengineer[bot]`, `agentpodsoftwareengineer[bot]`) are shared credentials and prove nothing. Identify an actor only by a self-signed claim (branch prefix `codex/…`, a "Codex chat <uuid>" comment, an OpenCode `ses_…` claim) — and treat even those as self-reports.
3. The task subagent posts a claim comment as its first action: session/agent id + "in progress" + scope. Update the issue at design-done, fix-shipped, merge.
4. **Ownership transfer (lesson 2026-10-31, #3271):** exactly ONE owning session per task. When Den moves a task to another chat: the old owner stops its agent FIRST (a stopped agent can leave a stray claim — name that risk), then hands over in one message: full brief + "you are the single owner now" + "check the issue for a stray claim from the stopped session". The receiver confirms ownership on the issue before working.

## Stage 1 — Context gathering (context subagent)

The task subagent spawns a context subagent. It reads the issue completely (body, all comments, linked PRs/issues, labels) plus the Notion design and PRD, and returns ONE context brief: what is asked, current status, prior decisions, acceptance criteria, existing evidence. Later stages reuse this brief, but refresh changed decisions, ownership, code SHA and blocker/run evidence before acting. Never work from the title alone.

## Stage 2 — Design (Notion is the home of design + PRD)

1. Find the task's design + PRD in Notion. Read them.
2. **Design defined?** → spawn a design/architecture review subagent: it reviews the design's architecture against the ticket and PRD — complete? consistent? acceptance criteria defined? Gaps go back to the design, not into implementation guesses.
3. **Design missing?** → spawn a design subagent: it writes the design (approach, scope boundaries, acceptance criteria) into the Notion page, per the `dev_docs` skill (`~/workspace/custom-skills/dev-docs/SKILL.md`): 30-second read, concrete nouns and numbers. Then step 2 runs on it.
4. No implementation until the design exists in Notion and passes review.

## Investigation track (bug hunts, root-cause, verdicts)

No Stage 2 upfront — there is nothing to design yet.

1. Investigate to a root cause, with evidence. Separate verified from unverified.
2. **Bug found → the fix does not start until the design is repaired:** (a) find the design gap that allowed the wrong implementation (no design at all = the gap; say so); (b) update the design doc in Notion; (c) fix through the normal stages, against the UPDATED design; the review checks the fix against the design change that motivated it. After the fix merges, the Stage 5.5 Design/PRD sync check still runs — the repair covered the gap, the sync check covers everything else the fix changed.
3. No bug (works as designed, external cause) → record the verdict on the issue. If the investigation exposed a design weakness, step 2 applies to it.
4. **A verdict never dangles (weekly review, 2026-10-31):** every gap or follow-up named in a verdict leaves with a concrete artifact before the session ends — a filed follow-up issue (linked), a fix PR, or an explicit park naming the owner/gate. "Recorded for scheduling" is a dropped stage (it happened twice in one day: #5770's promised G1 ticket never filed; #5766's unwired dedup sat as prose while the alert re-paged hourly).

Done right: the lxd-4 ZFS suspension (#5712) — root cause was a design flaw (pool as a sparse file on the host root fs); the durable fix changed the layout in the design/setup, not just the pool.

## When a stage cannot proceed

Before declaring Blocked, record `cause | current SHA/run/failed step | exact operation held | owner | next action | expected artifact`. Separate dependency, permission, access and execution failures from stale claims; an old pre-fix failure is not proof that current code fails. Check an authorized alternative and continue independent substeps. Do not wait for a release tag to run an independent workflow.

Before declaring a required secret missing, check the configured credential sources (including Bitwarden and its session in Credential Store, where configured), using supported tools; install the official client only if authorized. Never export a vault, expose secrets, or create persistent access to work around a gate.

On a supervisor unblock comment, acknowledge the next step, resume the permitted stage, and link the resulting artifact. `Unblocked` means reviewed with an actionable comment, not approval or completion. If the step still cannot run, return fresh failure evidence and the smallest decision needed; never repeat the old blocker without checking it. Keep one owner; escalate rather than silently abandoning the handoff. Existing permission, release, review and validation gates still apply.

## Stage 3 — Implementation (implementation subagent)

The task subagent spawns an implementation subagent. Brief points at: the issue, the Notion design/PRD, the acceptance criteria. It works in a branch, opens a PR linking the issue, reports the diff summary + its own local test evidence. It does NOT merge.

## Stage 4 — Review loop (review subagent)

1. The task subagent spawns a review subagent. It first reads the Notion design/PRD + acceptance criteria, then reviews the PR against them: diff actually read, evidence claims checked, criteria tested one by one.
2. Findings → implementation subagent fixes → re-review. **Loop until clean.** No "good enough" exits.
3. Anomaly rule (task subagent watches): two rounds bouncing with substantive findings = structural problem (bad design, wrong scope, misunderstood ticket). Stop, diagnose, fix the design or the brief, restart.
4. Evidence runs in a REAL git checkout, never a tarball tree (lesson 2026-10-31, PR #5757: a tarball silently fails ~39 git-dependent tests). Suite can't complete (hangs, tooling gaps) → bounded head-vs-base comparisons on identical trees; report the hang itself.

## Stage 5 — Merge (task subagent)

1. Review clean → CI on the PR head → green → merge. Verify the merge by SHA readback. Post the merge comment. The issue does NOT close here — it closes at Stage 6.
   **Gate order (weekly review, 2026-10-31):** "review is clean" = the verdict comment EXISTS on the PR and the task subagent has read it back via API (comment id + head SHA it names). A subagent's delivered PASS is not the gate — PR #5782 was merged at 10:59:50Z on a delivered PASS whose verdict comment landed 11:01:53Z. Read the verdict back first, then merge.
2. **CI globally broken on main** (broken for everyone, not by this PR): do not queue. Fall back in order: full relevant suite locally + merge on local evidence; deploy locally only where a route exists and the action is already authorized (release approval still applies); at minimum merge locally-verified work and record the CI bypass + reason on the issue, for re-verification when CI recovers.

## Stage 5.5 — Design/PRD sync check (after every merge, Den 2026-11-01)

A merged fix can silently make the Notion Design or PRD wrong. Before Stage 6 closes the task, the task subagent checks both, every time:

1. **Design:** does the merged change alter anything the task's Design doc (or a standing design page — Testing & Release Process, Autoscaling, DESIGN) describes — behavior, contracts, invariants, alert/verdict semantics, workflow rules, file/test inventory? Yes → update the doc in the same task (per `dev_docs`: concrete nouns/numbers), read it back, link the update on the issue.
2. **PRD:** does the merged change alter anything the PRD promises — product behavior, user-visible flows, pricing/entitlement mechanics, supported surfaces? Yes → update the PRD the same way. (Internal CI/tooling fixes almost never touch the PRD — but the check is still run and recorded, not assumed.)
3. **Record the outcome on the issue either way:** "Design/PRD sync: Design updated <link> / PRD updated <link>" or "Design/PRD sync: checked — no update needed", with the one-line reason. A task whose sync outcome is not recorded is not closed.
4. The investigation track's design-repair-before-fix (step 2) does NOT replace this check: the pre-fix repair covers the gap that caused the bug; the post-merge check covers everything else the fix changed that the docs describe.

## Stage 6 — Post-merge validation (validation subagent)

Immediately after the merge, the task subagent spawns a validation subagent — never the implementer. It checks the merged result on main: the changed flow works end to end in a real environment (real product flow or live service, per the testing rule), and nothing around it broke (adjacent flows). Evidence goes on the issue + the Work Log row. Failure reopens the relevant stage; the task is not done. **The issue closes and the Work Log row goes Done ONLY when validation passes AND the Stage 5.5 Design/PRD sync outcome is recorded on the issue.**

A merge is not a deploy: production changes only when Den cuts a release tag. When the work deploys, the same validation repeats against live production (real flow, live endpoint, the tenant's actual reply) before the work is reported done. Until then the merge comment classifies the residual as deploy-proof (stall pattern #2) and the work is reported merged-not-deployed, never done.

## Standing rules

- **Testing rule (Den, 2026-10-31; also in the Notion DESIGN page + Testing & Release Process page):** no unit tests, no mock-based tests. A test runs the real product flow end to end (PRD journeys, payment flows) or live against real services. **Do not grow the test count.** Missing coverage → extend an existing integration/e2e test, never a new file. A PR adding a unit or mock-based test fails Stage 4 on that ground alone. (Record: mock mass cut 978 → 79 files, 2026-10-31, PR #5786, issue #5780 — the mock suites passed while production broke.)
- **Customer/tenant/Stripe facts come from the Admin API.** How-to: AgentPod repo `docs/admin.md` + `.agents/skills/admin-console/SKILL.md` (auth via the Notion "🔑 Admin Access" page). Any investigation touching customers, payments, or tenant state routes through it; "console-gated, unverifiable" is not a verdict until that route was tried.
- **Verify live, never from document audits alone.** "Unverified" is a hypothesis, not a finding. A stage counts only with its artifact: Notion page updated, PR open, verdict recorded, merge SHA read back.
- **Subagent reports are not evidence (weekly review, 2026-10-31).** A subagent reported PR #5780 with SHAs and test counts and two reviewers "verified" it — the PR never existed (newest was #5775); another reported its ticket as #5781 when it was #5779. Rule: the task subagent reads back EVERY stage-reported identifier before acting; the main session does the same when reconciling or reporting to Den. Read each identifier (PR/issue number, head SHA, merge SHA, comment) from the GitHub API before acting or reporting to Den; implementation briefs require the subagent to cite API readbacks, not assertions. A number that 404s is reported as unverified, never passed on. Issues and PRs share one number space (lesson 2026-11-01, #5806/#5817): a brief's "fix issue #N" may be PR #N — verify the object type via the API before treating it as an issue, and say which it is in the claim comment.
- **Tooling hygiene:** durable helper scripts live under `~/workspace/`, never `/tmp` (wiped without notice; a GitHub helper was lost mid-session, 2026-10-31). Parallel API calls write to separate output files — two calls sharing one file corrupt both reads.
- Report outcomes to Den, not stage narration. Surface mid-flight only for a genuine blocker you cannot resolve yourself, with what you already tried.
- Non-financial decisions inside a ticket are the main session's — decide and record. Financial impact or Den's credentials/time go back to him.
- **Decision reversal (lesson 2026-10-31, #3271):** when Den reverses a decision recorded on issues/PRs, execute it the same turn, before work on the new direction: post a supersession comment (old decision + new one) on EVERY issue/PR that recorded the old one — duplicates included (#3271's closure also sat on #3334) — and reopen any issue the old decision closed. A stale closed record misleads the next actor.
- **Decision asks present the full menu (lesson 2026-10-31, #3271):** an ask to Den names every disposition the record supports — for money owed: refund / deliver the service / credit / write off — never a single preselected approve/deny. (The refund-only framing reached Den first; his choice, deliver the service, wasn't in it.)
- Never print secret values anywhere (issues, Notion, chat, logs).
- **Local-evidence environment (lessons from #5288, #5803, 2026-10-31):** (a) Exec backends share no system state — apt installs and `/tmp` vanish between calls; `~/workspace` persists. Local Postgres: `apt-get download` the .debs, `dpkg -x` under `~/workspace`, copy to `/tmp`, throwaway user, `initdb`/`pg_ctl` as that user (root is refused; a dropped uid cannot traverse `/home/hatch`); run suites promptly in the same stretch of calls. (b) A backgrounded run reporting exit 0 with empty output is NOT evidence — capture output to a workspace file, cite the summary lines. (c) Subprocess-heavy invariant suites time out under parallel batch load on this VM — run them standalone. (d) Before pushing, diff every touched file against CURRENT main blobs — a stale-base tree silently reverts fresh merges (nearly reverted #5763's ci.yml block); main can move mid-task, so re-read the head SHA immediately before pushing. (e) Test fakes encode contracts: when a fix tightens a consumer to the producer's real shape, update the fake to the real shape and say so in the PR — fixture correction, not test weakening. (f) Reconstructed checkout when clone is blocked: build the tree from the Git Database API (recursive tree + blobs), `git init`, force-add gitignored-but-tracked files (`.env.example`, stray `package-lock.json`), restore symlink modes — valid ONLY when local `git write-tree` equals the API tree SHA of the base commit; if main moved, re-base the changed blobs onto the new tree and re-run the gate on the final tree before the PR. Subtree variant (hit 2026-10-31, #5826): when only the test-relevant surface is content-fetched and the remaining blobs are index-registered by cacheinfo only, git ≥2.43 needs `git write-tree --missing-ok` — valid only paired with per-file sha1 verification of every fetched blob and an API-side check that the created PR tree equals the local final tree. (g) Never `git add -A -f` in a reconstructed checkout AFTER `npm ci` — `-f` overrides .gitignore and stages all of node_modules (hit 2026-11-01, handoff extraction PR #2323): stage before installing, or stage changed files via plumbing (`git read-tree <base-tree>` + `hash-object`/`update-index --cacheinfo` per file) and let the write-tree gate prove the index.

---

## Improving the process (standing duty)

Fold every friction lesson (dropped stages, stale boards, colliding claims, repeating review findings) into this skill at reflection time, before reporting the task done — reflection + skill update closes every task. Keep the pull script honest: if its linking misses a shape (PR references its issue only in a commit message), fix the script and note it here.

Stall pattern #1 (2026-10-31): Stage 4 reviews for smaller PRs (#5765, #5773) sat undispatched while larger items absorbed attention — sweep for un-reviewed PRs at every status request.

Stall pattern #2 (weekly review, 2026-10-31): **merged-but-open issues** (#5722, #5678, #5766: fix merged, issue open on residuals). A merge comment lists every residual and classifies it — deploy-proof / fleet / Den-gate / follow-up ticket (with number) — or the issue reads as done when it is not, and as stalled when it is only deploy-gated. The weekly review sweeps and re-classifies them.

Stall pattern #3 (weekly review, 2026-10-31): **backlog cron spins during other-actor waves.** On 2026-10-30/31 the 30-min job ran dozens of full enumerations ending "no completed unit" because a main-chat wave owned every open item. If the previous run ended no-unit for that reason and neither main's head SHA nor any open PR/issue `updated_at` moved since, the run does a light check (head SHA + updated_at sweep) and ends; full re-enumeration is owed only when something moved.

## Hourly job self-improvement

**Roles.** Each project has ONE hourly cron, the **Supervisor**, running the protocol in **Dev Workflow Supervisor** (`~/workspace/custom-skills/dev-workflow-supervisor/SKILL.md`) — one template over this skill, instantiated per project (`agentpod-hourly`, `vibebrowser-hourly`, `homesteadlink-hourly`, `opencode-hourly`) and differing only in project parameters: Work Log, PRD, Design, Decision Log, repos/pull script, project constraints. The Supervisor scans the Work Log, diagnoses, dispatches, verifies receipts (merge SHA read back, issue closed, deliverable at its recorded path), reflects, and self-edits. It never implements code or runs task stages itself. The Supervisor dispatches one **task subagent** running **dev-workflow** (`~/workspace/custom-skills/dev-workflow/SKILL.md`): it owns one task end-to-end (Stages 0–6) and reports its receipt back. A task with no live task subagent requires diagnosis, claim checks and an actionable next stage before re-dispatch; a live task subagent that went quiet is steered, never duplicated.

**Self-improvement — the final step of every Supervisor run:**

1. Scan the project's Work Log rows and the job's recent runs for REPEATED failure patterns — the same kind of stall, misdiagnosis, wasted check, or wrong stage recurring across tasks/runs. Find where the agent keeps going wrong across the list, and fix that recurring cause in the job's own instructions. One-off incidents are logged, never edited for.
2. If scheduler self-editing is authorized and supported, apply the concrete fix to this job through its actual scheduler tool (for example `cron.update` where available); otherwise record the proposed fix and missing capability/approval, without claiming it was applied. Hard limits: schedule, delivery chat, owner, enabled state, and the verified project parameters (Work Log / PRD / Design / Decision Log links) remain byte-identical; only the loop's working instructions change; a self-edit never expands the job's authority (no new permissions, release actions, chats, or projects).
3. Every self-edit is recorded in the same run: one line in the job's own session chat ("self-edit: <what changed> — <why>"), even when the run otherwise reports nothing, plus a dated entry with the same content in the daily log (`~/memory/YYYY-MM-DD.md`). No silent self-modification.
4. A lesson that applies to all projects is appended to this skill as a lessons/reflection entry (see "Improving the process") — never as a rewrite of the core protocol.

## Work Log (Notion) — the context ledger

One Work Log database per project — no workstream lives only in a chat's context.
- AgentPod: https://app.notion.com/p/2e0b6815aa11436c82cd0882143be573 (database `2e0b6815-aa11-436c-82cd-0882143be573`, data source `collection://98e9d187-9a6f-4e79-8fab-c4cbf624da8b`), child of the AgentPod hub, next to (not inside) the WORKLOG page.
- VibeBrowser: https://app.notion.com/p/93ea3e88ac6f4a7e8785e8be96ef54b6 (database `93ea3e88-ac6f-4a7e-8785-e8be96ef54b6`, data source `collection://d9618867-129c-4f09-a9c6-ae59f763cc5d`), child of the 🌍 Vibe Browser hub, next to the WORKLOG page; set up 2026-10-31 per Den's Product Owner Agent page. Project config: `~/workspace/goals/vibebrowser-public-release-readiness/PROJECT-CONFIG.md`; board pull: `pull_status_vibebrowser.py` (VibeWebAgent + platform); hourly sweep: cron `vibebrowser-hourly`.
- HomeSteadyLink: https://app.notion.com/p/ae5b1c4289224e7a8a8b6ca85b4afb0e (database `ae5b1c42-8922-4e7a-8a8b-6ca85b4afb0e`, data source `collection://8023c83b-bc7d-4aa9-a3b4-b02efa1cf4bf`), child of the "Travel Router - HomeSteadyLink" project page; created 2026-11-01, rows migrated from the "Work Log — BLE provisioning build" page (which keeps the full history); hourly sweep: cron `homesteadlink-hourly`.
- OpenCode Mobile: https://app.notion.com/p/9146ab2c9725404b8c4ac930de651f4e (database `9146ab2c-9725-404b-8c4a-c930de651f4e`, data source `collection://f18cf22d-a1a5-4a3e-9ccc-65a1f289a1e7`), child of the OpenCode Mobile hub; created 2026-11-01; hourly sweep: cron `opencode-hourly`.

Properties, in order: **Title** · **Last updated** (date with time; default view sorts by it descending, stalest at the bottom) · **Description** (one-two lines: what it is + the exact gate) · **Status** (exactly `In progress` / `Blocked` / `Unblocked` / `Not started` / `Done` — `Not started` = a pre-created row for known work not yet claimed; the Supervisor fills available task slots from the priority-ordered READY queue) · **Links** (GitHub issue URL + PR URL) · **Doc** (Notion design/doc URL).

Rules:
- Row created **when work starts** — the same moment it is claimed/dispatched (Starting a task, step 2).
- Row updated **at every status change**: claim → design → PR opened → review → merge → validation → block → done. Every update sets **Last updated** to that moment; refresh Description if the gate changed.
- `Unblocked` = Supervisor reviewed the blocker and posted a concrete next-step comment; it is not permission, resumed execution or Done. Move to In progress after task-subagent acknowledgment and evidence of resumed work.
- Blocked rows name the exact unblock in Description (whose decision, what input, which host). "Blocked" without the unblock is a stall, not a state.
- Every board report reconciles GitHub (pull script) against the Work Log: a row whose GitHub state moved is updated in the same turn; a Done row is verified against GitHub before it is repeated as done.
- **Staleness rule:** no artifact movement **>2h** is a stall candidate, even if Last updated changed. Inspect the live owner/session and fresh gate evidence; steer a live owner, or transfer a stopped owner’s claim before re-dispatching actionable work. Follow `dev-workflow-supervisor`; comments and status edits do not reset the progress clock.
- The hourly per-project Supervisor crons sweep on this rule between board reports; they never replace the in-turn duty to keep rows current.

