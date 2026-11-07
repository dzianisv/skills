---
name: dev-workflow
description: "Run a development task end to end through claims, design, implementation, review, merge and live validation, delegating stage work to subagents."
---

# The Workflow — how every development task is worked

Den's standing process for ANY development task (feature, fix, infra code), dictated 2026-10-31. The main session running the Supervisor owns the board. Each task is run end-to-end by ONE task subagent, which spawns its own stage subagents. This skill is the whole dev process: board layer + per-task pipeline. (`dev_tasks` was consolidated into `dev_workflow` 2026-10-31; the pull script keeps its path under `dev-tasks/scripts/`.)

**Goal (Den, 2026-10-31):** bring the product to a public release that can ship without fear — infra proven ready, every offered feature proven working live, never by audit alone. The release tag is the product owner's decision on live-verified readiness; proven readiness is the agent's job.

**Compliance is mandatory.** The task subagent opens this skill and runs Stage 0. Stage subagents inherit the task subagent's claim, execute only their assigned stage, and never re-claim the task, restart the workflow, or dispatch another task subagent. Work outside the pipeline is a process violation — stop and return to the task subagent. The backlog cron's dev work follows these stages too.

## Run checklist

- [ ] Board pulled fresh (`pull_status.py`); cross-checked against the live subagent list.
- [ ] Starting order: GitHub issue (scope + acceptance criteria) → Work Log row → ONE task subagent dispatched (3-task limit, priority order).
- [ ] Stage 0: nobody-else check done (48h); public-safe claim comment posted + read back; issue updates at design-done / fix-shipped / merge.
- [ ] Stage 1: context subagent's brief in hand (issue read completely + Notion design/PRD); context pack created on the issue.
- [ ] Pattern-expressible defect class? Scripted repo-wide sweep = first artifact; command + full hit list on the issue.
- [ ] Stage 2: lane chosen (feature / bug fix / simple fix); feature-lane design in Notion + independent review PASS (rule 2a method) before implementation.
- [ ] Bug: design gap recorded before the fix starts; verdicts never dangle — every follow-up leaves with an artifact.
- [ ] Stage 3: implementation subagent only; PR opened linking the issue; no merge by the implementer.
- [ ] Stage 4: review per `claude-code-review` (rule 1a); loop until clean; sweep re-run = zero unfixed hits; test-count delta recorded, no growth.
- [ ] Stage 5: verdict comment read back via API before merge; merge verified by SHA readback; CI ladder respected.
- [ ] Stage 5.5: Design/PRD sync checked after the merge; outcome recorded on the issue either way.
- [ ] Stage 6: validation subagent (never the implementer) proves the merged result live; evidence labeled "Stage 6"; only then issue closes + row Done.

## Board

Pull the board (never from memory):

```
python3 ~/workspace/custom-skills/dev-tasks/scripts/pull_status.py
```

It lists open AgentPod issues with their PRs, open AgentPod PRs with no issue, open AgentPod-Web PRs. Cross-check against the live subagent list: items with an agent, agents on items no longer on the board, items with NO agent and NO gate.

### On Den's status request — table, reflection, push

0. **Trigger:** owned by `dev-workflow-supervisor` (§7 Report, **Den's questions are run under this skill**) — the main session answers Den's count/state questions in its Supervisor capacity, under that skill. This section supplies the mechanics once that trigger fires.
1. **Table** from the fresh pull (verify rows the script can't classify against GitHub directly). Columns: PR/задача (link; issue link if no PR yet) | что делает (one plain line) | статус — only: **В работе** · **В ревью (субагент)** (a Stage 4 review is running; Den never reviews code) · **Готов к мерджу** · **Ждёт CI / раннер** · **Ждёт Дена: <что именно>** · **Ждёт флот** · **Открыто**.
2. **Stall reflection** per row: *my stall* = a stage finished, the next never started (PR without review, clean review without merge, verdict without a fix agent) — name it plainly. *Den's gate* (money, sign-in, decision) or *external gate* (fleet, CI, third party) must be verified against the exact step and current evidence; it exempts only dependent work, not the whole task. Name the gate's unblock in one phrase.
3. **Push, same turn, no asking:** steer the existing live task subagent; dispatch only actionable unclaimed work under the Supervisor's task-slot and priority rules, after claim checks or confirmed ownership transfer, briefed with `dev_workflow` and the exact stage owed. One line per push under the table. A status answer listing actionable stalled work without pushing it or recording the gate/capacity wait is a failed run of this skill.

### Starting a task

Order: (1) GitHub issue exists, with scope + acceptance criteria; (2) Work Log row created — no row, no start; (3) ONE task subagent dispatched to own the task end-to-end, within the Supervisor's project-wide three-active-task limit, in priority order. The task subagent's first action is the Stage 0 claim; it runs Stages 1–6 by delegating substantive stage work and retaining ownership/gate verification — it coordinates and verifies, it does not implement inline. The main session never implements dev work inline and never lets a claimed task sit ownerless; it monitors task subagents via the Work Log and GitHub readbacks and intervenes on stalls.

**One task, one lead.** Each task has exactly one owning task subagent (its lead); a lead that ends without the task Done or Closed leaves a continuation receipt on the task record (what was blocking, what was done, what remains), and the Supervisor starts the next lead in the same run — or, only when the blocker is genuinely outside the Supervisor's power, the row goes to Blocked with the one reason on the row (see `dev-workflow-supervisor`, §5 Dispatch — the run loop). A completed lead's session never remains the owner of an In progress row. A gate that has its own Work Log row is a separate task with its own lead, never absorbed into a parent task's scope; related tasks coordinate through their records, not shared ownership.

Every stage brief names the owning task subagent, inherited claim and assigned stage, and carries: the goal, the issue, the Notion design/PRD links, prior decisions, the acceptance criteria, the permissions granted, a stopping condition — and the task's context pack (below); a brief without it is incomplete. Every handoff returns: the result, the evidence, unresolved issues, the recommended next step — never chat memory alone.

### Keep the stage chain running

The task subagent owns the whole task, not just one stage. It spawns separate subagents for substantive stage work; the task subagent retains claims, handoffs and gate/merge verification, and remains responsible after each subagent reports. Use the runtime's supported completion delivery or wait mechanism. A completion notification is a handoff, not task completion; cron and the user must not be needed to restart the chain. Keep one active stage subagent per task by default. Yield while that child runs; reserve runtime capacity for children before admitting task parents.

On every stage result: read back its artifact and acceptance evidence, update the persistent task record, then actually start the next allowed stage or send failures back through the runtime's message/resume tool. Reporting the result or promising the next step is not continuation. A child's PASS or Blocked is verified per **Standing rules** (subagent reports are not evidence) before it is acted on. For Blocked, check the exact dependency and permitted alternatives, continue independent substeps, or record a concrete external gate with evidence, owner and resume condition. A gate stops only dependent work.

Before yielding, persist task-subagent ID, current stage, stage-subagent IDs and artifact links in the task record (the context pack carries the cross-run state; the Work Log row carries the ownership fields). On resume or task-subagent replacement, inspect those children: adopt/steer existing work if supported, or confirm it stopped before replacing it. Reload the task record, current ownership and fresh artifacts; never restart finished stages from chat memory. Address instructions to the actual stage subagent through available runtime tools. If delivery fails or no continuation mechanism exists, persist the exact next action and report that limitation to the Supervisor; never imply the chain is running.

Model choice per stage subagent: bounded work with clear checks → cheaper capable model; ambiguous architecture or hard debugging → stronger model. The reviewer is always a different agent from the implementer.

---

## Stage 0 — Claim (task subagent only, before stage work)

1. The task exists as a GitHub issue (create if missing, with scope + acceptance criteria).
2. Check nobody else is working it: issue comments, open PRs, commits from the last 48h. Parallel actors are real (Den's local agent, the fleet). **Another active claim → stand down, withdraw any claim you posted, report, pick different work.** Never race another actor on the same ticket. Attribution: bot authors (`vibesoftwareengineer[bot]`, `agentpodsoftwareengineer[bot]`) are shared credentials and prove nothing. Identify an actor only by a self-signed claim (branch prefix `codex/…`, a "Codex chat <uuid>" comment, an OpenCode `ses_…` claim) — and treat even those as self-reports.
3. The task subagent posts a public-safe claim comment as its first action: agent name + role (e.g. "Muse — task lead, VibeBrowser board push") + task/branch reference + scope, without private runtime/session identifiers (session-ID storage: **Work Log → Ownership fields**). Read back the claim. Mark In progress only after acknowledgment and evidence that execution started; a spawn receipt alone is insufficient. Update the issue at design-done, fix-shipped, merge.
4. **Ownership transfer (lesson 2026-10-31, #3271):** exactly ONE owning session per task. When Den moves a task to another chat: the old owner stops its agent FIRST (a stopped agent can leave a stray claim — name that risk), then hands over in one message: full brief + "you are the single owner now" + "check the issue for a stray claim from the stopped session". The receiver confirms ownership on the issue before working. (Annex A-K1.)

## Stage 1 — Context gathering (context subagent)

The task subagent spawns a context subagent. It reads the issue completely (body, all comments, linked PRs/issues, labels) plus the Notion design and PRD, and returns ONE context brief: what is asked, current status, prior decisions, acceptance criteria, existing evidence. Later stages reuse this brief, but refresh changed decisions, ownership, code SHA and blocker/run evidence before acting. Never work from the title alone.

### Context pack — one per task, on the issue (Den, 2026-11-07)

Context passes between stages and across runs through ONE maintained comment on the task's GitHub issue — the **context pack** — never through session memory. Stage 1's context brief is its initial content. The task subagent updates it at **every stage transition**, before the next stage brief is sent. Fields:

- Current stage + owning task subagent (name/role; session ID only in the Work Log, per Stage 0)
- Design / PRD links (Notion)
- The enumerate-first sweep: the exact command + full hit list — or the statement that the defect class is not pattern-expressible (Investigation track, rule 5)
- Every completed stage's verdict, each with its comment ID (Stage 4 verdict, Stage 5 merge SHA, Stage 5.5 sync outcome, Stage 6 verdict)
- Decisions taken: what, by whom, when (including lane choice and any lane escalation)
- Open residuals, each with its owner/gate
- The exact next action

Rules:

- A stage subagent reads the pack + the full issue thread before acting, and states in its first artifact that it did.
- A new lead, or a new run on an existing task, reconstructs state from the pack + the issue + the Work Log row — never from a previous session's memory. If the pack disagrees with the artifacts (PRs, comments, SHAs), the artifacts win and the pack is corrected before any other work.
- A stage result that is not reflected in the pack has not been handed off.

## Stage 2 — Design (Notion is the home of design + PRD)

**Design depth by task type (Den, 2026-11-07 — simple fixes do not get a long architecture review):**

- **Feature** (new behavior or surface, or any change to a contract/invariant): the full Stage 2 below — design in Notion + independent design/architecture review; no implementation before PASS.
- **Bug fix:** light design — root cause + the design gap recorded (investigation track, step 2), with a short amendment to the design doc where one exists. NO separate design-verification loop — unless the fix changes a contract, invariant, or cross-service behavior, in which case it moves to the feature lane for design.
- **Simple fix / alert fix** (root cause known, change confined to one component, no contract/invariant change): NO design stage in most cases — root cause + the intended change in one short issue comment, then straight to implementation. Stage 4 review and Stage 6 validation still apply in full. If the work turns out not to be confined, the task subagent escalates it to the bug-fix or feature lane and says so on the issue.

1. Find the task's design + PRD in Notion. Read them.
2. **Design defined?** → spawn a design/architecture review subagent: it reviews the design's architecture against the ticket and PRD — complete? consistent? acceptance criteria defined? Gaps go back to the design, not into implementation guesses.
2a. **Design review runs the same method as code review (Den, 2026-11-07 — `claude-code-review` applied to architecture):** parallel independent agents in two groups. (i) **Current-state agents** map what exists — the architecture as it actually is, read from the code and live system (scripted sweeps and reads, never doc impressions): the components, contracts, and invariants the feature must build into. (ii) **Fit agents** check the design against that map: does the feature build into what exists, or does it assume architecture that is not there; are contracts/invariants preserved; are acceptance criteria testable. High-signal only, same false-positive list as the review skill. Every finding is independently validated by a fresh agent before it can block the design PASS; unvalidated findings are filed notes. A design PASS names the current-state map it was checked against.
3. **Design missing?** → spawn a design subagent: it writes the design (approach, scope boundaries, acceptance criteria) into the Notion page, per the `dev_docs` skill (`~/workspace/custom-skills/dev-docs/SKILL.md`): 30-second read, concrete nouns and numbers. Then step 2 runs on it.
4. No implementation until the design exists in Notion and passes review.

## Investigation track (bug hunts, root-cause, verdicts)

No Stage 2 upfront — there is nothing to design yet.

1. Investigate to a root cause, with evidence. Separate verified from unverified.
2. **Bug found → the fix does not start until the design gap is recorded:** (a) find the design gap that allowed the wrong implementation (no design at all = the gap; say so); (b) record it at the depth of the task's Stage 2 lane — a Notion design-doc update for feature-lane work; an issue comment suffices for a simple/alert fix (no Notion round-trip); (c) fix through the normal stages, against the recorded gap; the review checks the fix against the design change that motivated it. After the fix merges, the Stage 5.5 Design/PRD sync check still runs — the repair covered the gap, the sync check covers everything else the fix changed.
3. No bug (works as designed, external cause) → record the verdict on the issue. If the investigation exposed a design weakness, step 2 applies to it.
4. **A verdict never dangles (weekly review, 2026-10-31):** every gap or follow-up named in a verdict leaves with a concrete artifact before the session ends — a filed follow-up issue (linked), a fix PR, or an explicit park naming the owner/gate. "Recorded for scheduling" is a dropped stage. (Annex A-K2.)
5. **Sibling sweep before closing a repeated shape (weekly review, 2026-11-02):** when a fix repairs one call site of a shape that can exist in siblings (a catch that clears state but misses a cancel/cleanup, a probe missing an expected status), grep every sibling call site for the same shape BEFORE the issue closes, and file/fix each hit in the same task. (Annex A-K3.)
   **Enumerate first (Den, 2026-11-07):** for any defect whose class is expressible as a code pattern, the task's FIRST artifact is a scripted repo-wide sweep of that pattern — the command and its full hit list posted on the issue before implementation starts. That list is the scope: implementation fixes the list, and Stage 4 re-runs the same command and verifies zero unfixed hits. A reviewer's hunt is not a sweep; a completeness claim without the committed sweep output behind it is an unproven claim. If the class cannot be expressed as a pattern, the issue states that plainly — sampling review is then a known limit, never a surprise in round 2.
   **Sweep the SHAPE, not the variable name (lesson 2026-11-07, #5958):** grep the code pattern itself (e.g. `dirname…/..`) across every directory family that can carry it, judge each hit at its own depth — or explicitly bound the sweep on the issue and file the remainder as a linked follow-up in the same task. A "sweep complete" claim after a name-scoped grep is a false claim. (Annex A-K4.)

Done right: the lxd-4 ZFS suspension (#5712) — root cause was a design flaw (pool as a sparse file on the host root fs); the durable fix changed the layout in the design/setup, not just the pool. (Annex A-K18.)

## When a stage cannot proceed

Before declaring Blocked, record `cause | current SHA/run/failed step | exact operation held | owner | next action | expected artifact`. Separate dependency, permission, access and execution failures from stale claims; an old pre-fix failure is not proof that current code fails. Check an authorized alternative and continue independent substeps. Do not wait for a release tag to run an independent workflow.

**Own the dependency:** inspect the current cause, then find or create the one scoped root-cause repair per `dev-workflow-supervisor` (**Own the blocker through resolution**) and preserve its owner. The task-side duties: send the dependency to the main session running `dev-workflow-supervisor` for priority and task-slot admission — never dispatch another task parent inside this task or bypass the three-task limit; record this task's gate and resume condition; continue independent substeps; release the slot only through the Supervisor after confirming no execution remains live. After verified repair evidence, resume this task at the owed stage and recheck its acceptance. Never weaken a test or change a contract solely to clear the blocker.

**Failed canary/CI stops release, not authorized repair** — the Supervisor's failed-canary rule governs (one justified diagnostic rerun for suspected transience; a reproducible failure goes to diagnosis and repair, never bypassed checks or untested timeout raises).

Before declaring a required secret missing, check the configured credential sources (including Bitwarden and its session in Credential Store, where configured), using supported tools; install the official client only if authorized. Never export a vault, expose secrets, or create persistent access to work around a gate.

On a supervisor next-step handoff: read any new or revised Product Owner guidance first; record the consumed revision in private task notes (no Last updated refresh). Check it against current evidence and permissions, resume the permitted stage, link the resulting artifact. An unchanged task count/status never cancels the handoff — compare candidate SHA, run/attempt, failure cause, owner acknowledgment, artifact movement. Reuse the existing repair and owner; deduplicate reminders, not authorized recovery. If the step still cannot run, return fresh failure evidence and the smallest decision needed — never repeat an old blocker unchecked. Keep one owner; escalate rather than silently abandon the handoff. Existing permission, release, review and validation gates still apply.

## Stage 3 — Implementation (implementation subagent)

The task subagent spawns an implementation subagent. Brief points at: the issue, the Notion design/PRD, the acceptance criteria. It works in a branch, opens a PR linking the issue, reports the diff summary + its own local test evidence. It does NOT merge.

## Stage 4 — Review loop (review subagent)

1. The task subagent spawns a review subagent. It first reads the Notion design/PRD + acceptance criteria, then reviews the PR against them: diff actually read, evidence claims checked, criteria tested one by one.
1a. **Review method = `claude-code-review` (Den, 2026-11-07):** Stage 4 reviews run the installed skill at `~/workspace/custom-skills/claude-code-review/SKILL.md` (Anthropic's Claude Code code-review method, source anthropics/claude-plugins-official). Parallel compliance + bug agents, high-signal-only flagging, an independent validation pass per finding — only validated findings may FAIL a PR; everything else is a filed note, not a blocker.
2. Findings → implementation subagent fixes → re-review. **Loop until clean.** No "good enough" exits.
3. Anomaly rule (task subagent watches): two rounds bouncing with substantive findings = structural problem (bad design, wrong scope, misunderstood ticket). Stop, diagnose, fix the design or the brief, restart.
4. Evidence runs in a REAL git checkout, never a tarball tree (lesson 2026-10-31, PR #5757: a tarball silently fails ~39 git-dependent tests). Suite can't complete (hangs, tooling gaps) → bounded head-vs-base comparisons on identical trees; report the hang itself. (Annex A-K5.)
5. **Test-count delta line (audit 2026-11-05):** every Stage 4 verdict records the PR's test delta — new test cases added / cases removed / test-file count before→after. Net growth with no recorded exception on the issue fails the review: the standing rule is no growth; AC-mapped cases for genuinely new behavior are the only exception, and the exception is written on the issue, never assumed. (Annex A-K6.)

## Stage 5 — Merge (task subagent)

1. Review clean → CI on the PR head → green → merge. Verify the merge by SHA readback. Post the merge comment. The issue does NOT close here — it closes at Stage 6.
   **Gate order (weekly review, 2026-10-31):** "review is clean" = the verdict comment EXISTS on the PR and the task subagent has read it back via API (comment id + head SHA it names). A subagent's delivered PASS is not the gate — read the verdict back first, then merge. (Annex A-K7.)
2. **CI infrastructure unavailable / checks failed:** diagnose and repair the infrastructure while continuing independent work. A check that ran and failed blocks the merge — UNLESS a triage recorded on the PR proves, with run IDs, that the identical failure occurs on main or is fleet-caused AND could not have been caused by this change; an untriaged failure, or one the change could have caused, is never bypassed. Checks that never ran (CI globally unavailable) may use the local-evidence ladder: run the full relevant suite on the exact SHA, merge on local evidence, and record the bypass + reason on the issue for re-verification when CI recovers — only when the current project rules and user explicitly authorize that exact path, preserving review and merge gates. Queue delays alone grant no exception. Otherwise keep the merge held while repairing.

## Stage 5.5 — Design/PRD sync check (after every merge, Den 2026-11-01)

A merged fix can silently make the Notion Design or PRD wrong. Before Stage 6 closes the task, the task subagent checks both, every time:

1. **Design:** does the merged change alter anything the task's Design doc (or a standing design page — Testing & Release Process, Autoscaling, DESIGN) describes — behavior, contracts, invariants, alert/verdict semantics, workflow rules, file/test inventory? Yes → update the doc in the same task (per `dev_docs`: concrete nouns/numbers), read it back, link the update on the issue.
2. **PRD:** does the merged change alter anything the PRD promises — product behavior, user-visible flows, pricing/entitlement mechanics, supported surfaces? Yes → update the PRD the same way. (Internal CI/tooling fixes almost never touch the PRD — but the check is still run and recorded, not assumed.)
3. **Record the outcome on the issue either way:** "Design/PRD sync: Design updated <link> / PRD updated <link>" or "Design/PRD sync: checked — no update needed", with the one-line reason. A task whose sync outcome is not recorded is not closed.
4. The investigation track's design-repair-before-fix (step 2) does NOT replace this check: the pre-fix repair covers the gap that caused the bug; the post-merge check covers everything else the fix changed that the docs describe.

   *Tooling note (2026-11-01):* Notion `update_content` replacements match the page's markdown, not the fetched rendering — anchor on plain-text phrases; a backticked/code-spanned old_str can no-match even when the rendered text looks identical. Verify every sync edit by re-fetch before recording it. (Annex A-K20.)

## Stage 6 — Post-merge validation (validation subagent)

Immediately after the merge, the task subagent spawns a validation subagent — never the implementer. It checks the merged result on main: the changed flow works end to end in a real environment (real product flow or live service, per the testing rule), and nothing around it broke (adjacent flows). Validation must also re-run the acceptance criteria against relevant account/tier/state variants absent from the committed test fixtures — fixtures encode the happy class only (lesson 2026-11-01, #2154; Annex A-K13). Evidence goes on the issue + the Work Log row, in a comment explicitly labeled **"Stage 6"** (audit 2026-11-05; Annex A-K14). The closing comment also repeats the test-count delta line. Failure reopens the relevant stage; the task is not done. **The issue closes and the Work Log row goes Done ONLY when validation passes AND the Stage 5.5 Design/PRD sync outcome is recorded on the issue. Never close on the merge comment alone.**

**Deploy is not part of this workflow (Den, 2026-11-07 — the deploy step is removed from the protocol).** A task ends at Stage 6: merge SHA read back + Stage 5.5 sync recorded + Stage 6 validation passed on the merged result = Done, issue closed, row Done. Whether and when merged work ships to production is the product owner's separate release act, outside any task's lifecycle; it never keeps a task open and is never a residual class. Release-level live checks belong to the release task itself, not to the work tasks whose merges it ships.

## Standing rules

- **Testing rule (Den, 2026-10-31; also in the Notion DESIGN page + Testing & Release Process page):** no unit tests, no mock-based tests. A test runs the real product flow end to end (PRD journeys, payment flows) or live against real services. **Do not grow the test count.** Missing coverage → extend an existing integration/e2e test, never a new file. A PR adding a unit or mock-based test fails Stage 4 on that ground alone. (Record: Annex A-K8.)
- **Customer/tenant/Stripe facts come from the Admin API.** How-to: AgentPod repo `docs/admin.md` + `.agents/skills/admin-console/SKILL.md` (auth via the Notion "🔑 Admin Access" page). Any investigation touching customers, payments, or tenant state routes through it; "behind the console, unverifiable" is not a verdict until that route was tried.
- **Verify live, never from document audits alone.** "Unverified" is a hypothesis, not a finding. A stage counts only with its artifact: Notion page updated, PR open, verdict recorded, merge SHA read back.
- **Sweeps close, never delete (audit 2026-11-05).** A backlog sweep closes or archives issues; it never deletes an issue that has a merged PR or any pipeline record — deletion destroys the audit trail. (Annex A-K9.)
- **Runner/CI claims are per-lane, per-run facts (weekly review 2026-11-02; Den's correction 2026-11-01 14:04 UTC).** Before citing a runner blocker, read back the exact workflow run's jobs: runner name, requested labels, state. Failed checks ≠ no runner; queued/unassigned ≠ fleet offline. Lanes differ per repo. Never reuse a runner diagnosis without refreshing it. (Annex A-K10.)
- **Subagent reports are not evidence (weekly review, 2026-10-31).** Rule: the task subagent reads back EVERY stage-reported identifier before acting; the main session does the same when reconciling or reporting to Den. Read each identifier (PR/issue number, head SHA, merge SHA, comment) from the GitHub API before acting or reporting to Den; implementation briefs require the subagent to cite API readbacks, not assertions. A number that 404s is reported as unverified, never passed on. Issues and PRs share one number space: a brief's "fix issue #N" may be PR #N — verify the object type via the API before treating it as an issue, and say which it is in the claim comment. (Annex A-K11.)
- **A stage agent that ends without a report may still have done the work.** Before re-dispatching the stage, check the state it may have left: branch heads vs the last verified SHA, PR comments, evidence files on disk. Re-dispatch only the missing remainder — never restart the stage blind (a blind restart risks duplicate verdicts and double pushes). Recovery search order that works: list recent PRs sorted by creation descending FIRST; the commit-search API only indexes default-branch-reachable commits, and branch-name greps miss unconventionally named branches, so both can come up empty while the artifact exists — and paginate the FULL branch list before concluding no branch exists. (Annex A-K12.)
- **Tooling hygiene:** when refreshing a single-line record in Notion (e.g. the Agents Context escalation line), replace the FULL old line and read back that exactly one such line exists — a prefix-only replace leaves the old body appended. Durable helper scripts live under `~/workspace/`, never `/tmp` (wiped without notice). Parallel API calls write to separate output files — two calls sharing one file corrupt both reads. A half-finished API reconstruction left in a workdir carries a state note (base commit + tree SHA, blobs fetched/total, the resume command). (Annex A-K16.)
- Report outcomes to Den, not stage narration. Surface mid-flight only for a genuine blocker you cannot resolve yourself, with what you already tried.
- Non-financial decisions inside a ticket are the main session's — decide and record. Financial impact or Den's credentials/time go back to him.
- **Decision reversal (lesson 2026-10-31, #3271):** when Den reverses a decision recorded on issues/PRs, execute it the same turn, before work on the new direction: post a supersession comment (old decision + new one) on EVERY issue/PR that recorded the old one — duplicates included — and reopen any issue the old decision closed. A stale closed record misleads the next actor. (Annex A-K1.)
- **Decision asks present the full menu (lesson 2026-10-31, #3271):** an ask to Den names every disposition the record supports — for money owed: refund / deliver the service / credit / write off — never a single preselected approve/deny. (Annex A-K1.)
- Never print secret values anywhere (issues, Notion, chat, logs).
- **Local-evidence environment (lessons from #5288, #5803, 2026-10-31):** (a) Exec backends share no system state — apt installs and `/tmp` vanish between calls; `~/workspace` persists. Local Postgres: `apt-get download` the .debs, `dpkg -x` under `~/workspace`, copy to `/tmp`, throwaway user, `initdb`/`pg_ctl` as that user (root is refused; a dropped uid cannot traverse `/home/hatch`); run suites promptly in the same stretch of calls. (b) A backgrounded run reporting exit 0 with empty output is NOT evidence — capture output to a workspace file, cite the summary lines. (c) Subprocess-heavy invariant suites time out under parallel batch load on this VM — run them standalone. (d) Before pushing, diff every touched file against CURRENT main blobs — a stale-base tree silently reverts fresh merges; main can move mid-task, so re-read the head SHA immediately before pushing. (e) Test fakes encode contracts: when a fix tightens a consumer to the producer's real shape, update the fake to the real shape and say so in the PR — fixture correction, not test weakening. (f) Reconstructed checkout when clone is blocked: build the tree from the Git Database API (recursive tree + blobs), `git init`, force-add gitignored-but-tracked files (`.env.example`, stray `package-lock.json`), restore symlink modes — valid ONLY when local `git write-tree` equals the API tree SHA of the base commit; if main moved, re-base the changed blobs onto the new tree and re-run the gate on the final tree before the PR. Subtree variant (hit 2026-10-31, #5826): when only the test-relevant surface is content-fetched and the remaining blobs are index-registered by cacheinfo only, git ≥2.43 needs `git write-tree --missing-ok` — valid only paired with per-file sha1 verification of every fetched blob and an API-side check that the created PR tree equals the local final tree. (g) Never `git add -A -f` in a reconstructed checkout AFTER `npm ci` — `-f` overrides .gitignore and stages all of node_modules: stage before installing, or stage changed files via plumbing (`git read-tree <base-tree>` + `hash-object`/`update-index --cacheinfo` per file) and let the write-tree gate prove the index. (h) Fetch economy (hit 2026-11-01, #5844): blob fetches for a reconstructed checkout go serially (≤4 workers max, and even 4 hit write EPERMs — serial is the reliable default); `/rate_limit` readings flip between surrogate credential pools and are not evidence — a real repo call returning 200 is. (Annex A-K17.)

---

## Improving the process (standing duty)

Fold every friction lesson (dropped stages, stale boards, colliding claims, repeating review findings) into this skill at reflection time, before reporting the task done — reflection + skill update closes every task. Keep the pull script honest: if its linking misses a shape (PR references its issue only in a commit message), fix the script and note it here.

Stall pattern #1 (2026-10-31): Stage 4 reviews for smaller PRs sat undispatched while larger items absorbed attention — sweep for un-reviewed PRs at every status request.

Stall pattern #2 (weekly review, 2026-10-31): **merged-but-open issues** — a merge comment lists every residual and classifies it — fleet / Den-gate / follow-up ticket (with number) — or the issue reads as done when it is not. The weekly review sweeps and re-classifies them.

Stall pattern #3 (weekly review, 2026-10-31): **backlog cron spins during other-actor waves.** Use a light check only while every affected task still has a verified live owner and no new Product Owner guidance, candidate SHA, run/attempt, failure cause, owner acknowledgment or artifact movement requires action. Head SHA and issue `updated_at` alone are insufficient. A missing/stopped owner, failed handoff or changed failure requires recovery even with the same task count; an unobservable owner requires access diagnosis, not duplicate dispatch.

(Annex A-K19.)

## The Supervisor (hourly job) — pointer

Each project has ONE hourly cron, the **Supervisor**, running `dev-workflow-supervisor` (`~/workspace/custom-skills/dev-workflow-supervisor/SKILL.md`) — one template over this skill, instantiated per project (`agentpod-hourly`, `vibebrowser-hourly`, `homesteadlink-hourly`, `opencode-hourly`), differing only in project parameters. Roles, the run loop, dispatch, recovery, escalation and the run-end self-improvement step are defined in that skill and nowhere else. The **Overflow** skill (`~/workspace/custom-skills/overflow/SKILL.md`) is the task subagent's legacy alias.

## Work Log (Notion) — the context ledger

One Work Log database per project — no workstream lives only in a chat's context.

- AgentPod: https://app.notion.com/p/2e0b6815aa11436c82cd0882143be573 (database `2e0b6815-aa11-436c-82cd-0882143be573`, data source `collection://98e9d187-9a6f-4e79-8fab-c4cbf624da8b`), child of the AgentPod hub, next to (not inside) the WORKLOG page.
- VibeBrowser: https://app.notion.com/p/93ea3e88ac6f4a7e8785e8be96ef54b6 (database `93ea3e88-ac6f-4a7e-8785-e8be96ef54b6`, data source `collection://d9618867-129c-4f09-a9c6-ae59f763cc5d`), child of the 🌍 Vibe Browser hub, next to the WORKLOG page; set up 2026-10-31 per Den's Product Owner Agent page. Project config: `~/workspace/goals/vibebrowser-public-release-readiness/PROJECT-CONFIG.md`; board pull: `pull_status_vibebrowser.py` (VibeWebAgent + platform); hourly sweep: cron `vibebrowser-hourly`.
- HomeSteadyLink: https://app.notion.com/p/ae5b1c4289224e7a8a8b6ca85b4afb0e (database `ae5b1c42-8922-4e7a-8a8b-6ca85b4afb0e`, data source `collection://8023c83b-bc7d-4aa9-a3b4-b02efa1cf4bf`), child of the "Travel Router - HomeSteadyLink" project page; created 2026-11-01, rows migrated from the "Work Log — BLE provisioning build" page (which keeps the full history); hourly sweep: cron `homesteadlink-hourly`.
- OpenCode Mobile: https://app.notion.com/p/9146ab2c9725404b8c4ac930de651f4e (database `9146ab2c-9725-404b-8c4a-c930de651f4e`, data source `collection://f18cf22d-a1a5-4a3e-9ccc-65a1f289a1e7`), child of the OpenCode Mobile hub; created 2026-11-01; hourly sweep: cron `opencode-hourly`.

Properties, in order: **Title** · **Last updated** (date with time; default view sorts by it descending, stalest at the bottom) · **Description** (one-two lines: what it is + the exact gate) · **Status** (exactly five values: `Open` / `In progress` / `Blocked` / `Done` / `Closed`; the Supervisor works Open rows in priority order — highest project priority first, oldest first within equal priority) · **Owner** (multi-select agent name; select one owning agent) · **Owner session ID** (text; the actual owning task session ID) · **Links** (GitHub issue URL + PR URL) · **Doc** (Notion design/doc URL).

**Status vocabulary.** Statuses are exactly five — `Open` / `In progress` / `Blocked` / `Done` / `Closed` — defined once in `dev-workflow-supervisor` (§1 Read). A completed task is Done, never Closed; Closed means closed without being done.

### Ownership fields

- `Owner` names the agent responsible for the task (use the existing option, such as Muse, Codex or Hermes), not a human assignee or the model used for one stage. `Owner session ID` is the owning task session's exact runtime identifier, verified from the runtime or an explicit claim and linked to that evidence in the notes (never in public comments — Stage 0, rule 3). A self-reported claim does not prove the session is still live.
- `Worklog ID`, when present, is Notion's generated row identifier. Never copy it, an issue number, a model name or a guessed identifier into `Owner session ID`. If the actual session ID is unavailable, leave that field blank, record why, and resolve ownership before a new dispatch; do not erase an existing verified owner.
- Keep stage-subagent IDs and the main Supervisor session in notes under their roles. They never replace the owning task session. Preserve both ownership fields while a task waits or completes; transfer them only after checking the prior owner has stopped or explicitly handed over, recording the old owner and transfer evidence.
- On claim/resume, fresh-read the row and competing claims, write and read back both ownership fields, then record execution evidence. A review-only comment does not acquire ownership. Backfill only explicit, unambiguous ownership evidence; do not adopt a stale claim as a live session.

Rules:

- A row goes **Done only per Stage 6** (validation PASS + Stage 5.5 sync recorded on the issue) — never on a merge alone. (Evidence: Annex A-K15.)
- Row created **when work starts** — the same moment it is claimed/dispatched (Starting a task, step 2).
- Update the row at each execution milestone: claim acknowledged → design → PR opened → review → merge → validation → execution block → done. Set **Last updated** to the actual evidenced execution/progress time, including verified artifact movement discovered later, not the time of the scan. Refresh Description when the gate changes. Review-only guidance, schema edits, ownership backfills and Blocked → Open relabeling must not advance Last updated; date those observations in the comment instead. Keep artifact URL/SHA and movement time in notes; do not invent a date for unknown progress.
- `Open` = not being worked now; the row text carries the concrete next step and what starts it. A Blocked row whose reason has cleared is worked the same run (see `dev-workflow-supervisor`), not merely relabeled; keep unresolved reasons explicit. The main session sends the handoff through the actual task-subagent tool. Move to In progress only after acknowledgment and evidence that execution started or resumed, not a comment or dispatch receipt.
- Blocked rows name the exact unblock in Description (whose decision, what input, which host). "Blocked" without the unblock is a stall, not a state.
- Every board report reconciles GitHub (pull script) against the Work Log: a row whose GitHub state moved is updated in the same turn; a Done row is verified against GitHub before it is repeated as done.
- **Staleness rule:** no artifact movement **>2h** is a stall candidate, even if Last updated changed. Inspect the live owner/session and fresh gate evidence; steer a live owner, or transfer a stopped owner's claim before re-dispatching actionable work. Follow `dev-workflow-supervisor`; comments and status edits do not reset the progress clock.
- The hourly per-project Supervisor crons sweep on this rule between board reports; they never replace the in-turn duty to keep rows current.

## Skill source and updates

The canonical source for `dev-workflow` and `dev-workflow-supervisor` is https://github.com/dzianisv/skills. Project and runtime copies are mirrors, not independent sources. Reconcile local-only lessons into the canonical source before refreshing either copy; never overwrite canonical changes from an older local file. Refresh both skills from the same reviewed commit, record that commit, and verify their bytes. A repository update is not proof that Muse loaded it: verify the runtime paths and the scheduled job's source separately.
