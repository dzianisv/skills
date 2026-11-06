---
name: dev-workflow-supervisor
description: "Use when an hourly project check must find stalled tasks, check live subagent ownership, dispatch actionable work, and verify completion."
---

# Dev Workflow Supervisor

The Supervisor protocol for the per-project hourly cron jobs (`agentpod-hourly`, `vibebrowser-hourly`, `homesteadlink-hourly`, `opencode-hourly`). The shared core process is `dev_workflow` (`~/workspace/custom-skills/dev-workflow/SKILL.md`); the task subagent follows that skill directly (`overflow` is only a legacy compatibility alias, not a required dependency). This skill is generic — every project-specific value (links, repos, constraints) comes from the job body that invokes it.

## Skill source and updates

The canonical source for `dev-workflow` and `dev-workflow-supervisor` is https://github.com/dzianisv/skills. Project and runtime copies are mirrors, not independent sources. Reconcile local-only lessons into the canonical source before refreshing either copy; never overwrite canonical changes from an older local file. Refresh both skills from the same reviewed commit, record that commit, and verify their bytes. A repository update is not proof that Muse loaded it: verify the runtime paths and the scheduled job's source separately.


## Execution contract

A run succeeds by keeping permitted work executing, not by completing a scan. Apply these checks before writing the final report:

- For each incomplete task, choose an evidence-backed disposition: executing, ready to start/resume, waiting for capacity, externally gated, or ownership unresolved. These are run decisions, not new Work Log statuses.
- For ready work, call the actual dispatch/resume tool in this run after ownership and slot checks. Do not end with an intended next action while an authorized, admitted step remains unattempted. Start it as soon as its required checks are complete; do not postpone dispatch until the final summary.
- For a completed stage, verify the artifact and direct its task owner to start the next permitted stage in this run. For a stopped owner, resume it or complete the existing ownership-transfer checks before one replacement.
- For a real gate, identify the exact held operation, fresh evidence, decision owner and resume condition. Continue independent authorized substeps. For an unresolved owner or unavailable execution tool, use the recovery/escalation path below; recording the limitation alone is not a recovery attempt.
- End with receipts for actions actually taken, verified ongoing execution, or concrete waits. A missing receipt, overdue handoff or unattempted ready step is a continuation failure to resolve or explicitly escalate, not a successful unchanged check. Never fabricate a receipt, bypass a denial or duplicate an unobservable owner to satisfy this contract.

## Roles

- **Main session running the Supervisor (this job):** scans the Work Log, diagnoses, dispatches, verifies receipts, reflects, self-edits. It NEVER implements code or runs task stages itself.
- **Task subagent:** the single subagent the Supervisor dispatches. It owns ONE task end-to-end per `dev-workflow` (Stage 0 claim → design → implementation → review loop → merge → Stage 6 validation) and reports its receipt back.
- **Stage subagent:** runs only its assigned stage under the task subagent’s claim; it does not reclaim the task or restart the workflow.
- An incomplete task with no live task subagent is a diagnosis candidate on every run; do not wait two hours to recover a dropped chain. A live task subagent that went quiet is steered, never duplicated.

## Inputs (from the invoking job body)

Project parameters: Work Log database (link + data source), context page ("Agents Context", under the project hub), PRD, Design doc, Decision Log, GitHub board route (pull script or gh helper), delivery chat (the job's own project session — results go nowhere else), project constraints. The **Work Log database is the only state source** — no state files, no chat memory. The context page is the project's compressed orientation, not a state source.

## Runtime capabilities

Before dispatch, map the available tools for spawning task/stage subagents (including nesting limits), listing/addressing/resuming them, completion delivery or waiting, persistent records and scheduler edits. Tool names/paths below (`subagent.list`, `cron.update`, `/opt/hatch/bin/notion-cli`, `~/workspace/…`) are examples from one installation, not portable APIs. Use actual supported equivalents and configured skill paths. Record the execution environment and verified owner lookup/read/resume routes, coordinator destination and admission mechanism in the private project/task record; a model name or local-only agent path is not a cross-runtime address. If a required capability is absent, keep only the affected action pending, attempt supported coordination, and report the precise missing route or decision to the invoking session. Do not silently re-record the same capability gap as a successful run; continue independent work. Never claim a message, wake or edit happened without a tool receipt. A skill does not create missing runtime capabilities or grant new permissions.

## Read first, every run

1. The project's **context page first** ("Agents Context") — before the Work Log scan, so the run begins oriented: what the project is, current state, active fronts, live gates/blockers, recurring failure patterns, next priorities.
2. The Work Log rows in ALL statuses (In progress / Blocked / Scheduled / Not started / Done), including new or revised Product Owner guidance. Use the available Notion connector or CLI. Fetch each row’s current page before editing it; preserve unrelated fields. Record which guidance revision/comment was read and acknowledged in the private task notes, without refreshing the execution timestamp or claiming it was executed. Check the guidance against current evidence and permissions before acting.
3. The Decision Log, PRD and Design doc — context for judging the work.
4. GitHub state via the project's pull route.
5. The live subagent list (using the runtime’s supported tool): which rows have a live task subagent right now.

## Dispatch and resume contract

The Supervisor starts or resumes ONE task subagent per task with `dev-workflow`; that task subagent runs the stages and spawns stage subagents. Never dispatch stage work directly from this job.

Send through the runtime's actual subagent message/resume tool, addressed to the owning task subagent/session—not just a recap in the user chat. Use only tools the runtime exposes (including Muse); do not invent API names. Message:
`task ID + record link | current stage | verified SHA/artifact/run | next action | acceptance check + expected artifact | permissions/gates | report-back destination`.
An accepted dispatch proves handoff only. Perform a bounded same-run readback for acknowledgment and started activity. If delivery is asynchronous and execution is not yet observable, record the receipt, exact next readback route and acknowledgment deadline, no later than the next configured Supervisor run. Record pending execution separately from the existing row status; do not newly mark In progress or advance its execution timestamp until start is verified. If no future run is configured, use a supported continuation mechanism or report the missing wake route. At the deadline, a missing acknowledgment is a failed handoff: inspect the target before retrying, use the bounded recovery rule, and escalate an unresolved recovery. Do not spin or duplicate a possibly running task.

Use the Work Log fields `Owner` (multi-select agent name; one owning agent) and `Owner session ID` (text; actual owning task session ID). Read both before dispatch. Verify the session against the runtime or explicit claim evidence, preserving an active owner; a label or old claim alone does not prove liveness. Never substitute Notion's generated `Worklog ID`, an issue number or a model name. If the session ID cannot be verified, leave an unknown field blank and record the lookup/access gap, without erasing existing ownership or dispatching a duplicate.

After a successful task spawn/resume, persist its actual agent/session identity and read it back. Move Scheduled → In progress only when that owner acknowledges and actual execution is evidenced. Keep stage-child IDs and the Supervisor session separately in notes. Transfer ownership only after the old owner is confirmed stopped or explicitly hands over; retain ownership during external waits and after completion. Review-only guidance never makes the reviewer the task owner.

Resume a completed/stopped task subagent if supported and ownership remains valid. Otherwise confirm its ownership is inactive or cleared before starting a replacement; it reloads the persistent task record and resumes the owed stage. Never duplicate a quiet task subagent. Before dispatch, re-read the row and claim; overlapping cron runs must not both claim it. Use the runtime's claim/lock mechanism if available; if ownership cannot be established safely, leave dispatch pending.

## Task slots and priority

Keep at most **three active tasks per project across all runs**, including existing executions. This is a task limit, not a three-agent limit. An admitted task keeps its slot through stage completions, handoffs and recovery until Done or a recorded external wait with no live execution. A waiting parent and its child count as one task. Default to one active stage child per task and yield waiting parents so runtime execution slots remain available to their children. If the runtime cannot support three task chains, run fewer; do not create idle parents that prevent their children from running.

Serialize project admission across overlapping runs using a supported lock or atomic reservation: reconcile task/stage IDs, claims, artifacts and live executions, reserve a slot, then dispatch or resume. Count in-flight spawn/resume reservations too; release a failed admission only after confirming no execution started. If safe admission cannot be established, leave it pending rather than race another run. A verified external wait frees a project slot only when no execution remains live; keep the owner, gate and resume condition in the row. Resuming that task must acquire a slot again. Unknown execution state does not free a slot.

Build a **READY queue** from actionable new and resumable tasks, highest project priority first, oldest first within equal priority. READY is a queue, not a new Work Log status. Use Scheduled for reviewed tasks with a concrete next step recorded and queued for start or resume; the label alone does not make a gated step READY or reserve a task slot. Classify each Scheduled row individually as READY, gated, capacity-waiting or ownership-unverified, with evidence; never treat the entire Scheduled status as Blocked. Fill free slots from it after reconciliation; do not replace an active task or interrupt its stage merely because priorities changed. If three tasks are already active, steer them rather than dispatching another.

## Own the blocker through resolution

A blocker is work to manage, not a reason to stop managing the product. Before parking a dependent task:

1. Inspect the current failing or waiting operation, exact SHA/run/step, relevant code and project decisions. Distinguish a fixable defect from a real approval, resource or access gate. For a queue, inspect producer/consumer dependencies and occupied runner capacity; for a contract failure, compare the observed response with the documented contract before changing either.
2. Search the Work Log and linked issues for the same root cause. Reuse its task and preserve its owner. If none exists, create ONE scoped repair task in the owning project/repository: verified cause, affected task links, permitted next step, acceptance evidence and owner/claim state. Link each dependent task back to it. A shared blocker gets one repair, not one ticket per dependent. Put private runtime/session identifiers in the authorized Work Log only, not public issue bodies or comments.
3. Put actionable repair work into the priority queue and actually dispatch or resume its task subagent under the three-task admission/claim rules. Persist Owner and Owner session ID, require acknowledgment and execution evidence, then mark In progress. If slots are full, steer active owners and record the repair's queue position; do not start a fourth task. A genuinely waiting parent releases its slot only after confirming no execution remains live. A new ticket or a promise to dispatch is not progress.
4. If the repair requires permission, credentials, spending or unavailable hardware, record the precise operation, decision owner and resume condition; request only the needed approval. Do not weaken checks, change a contract merely to make a test green, or treat queued/skipped jobs as passes. Continue independent ready work.
5. Read back the repair's exact-commit test/CI result and required delivery evidence. Then resume every affected parent at its owed stage and verify its acceptance check; only verified completion can close the repair or its dependents. If the fix did not remove the gate, continue diagnosis rather than declaring it resolved.

### Failed canary or CI: stop release, continue repair

Keep release blocked, not the repair. If evidence suggests a transient failure, allow one justified, authorized diagnostic rerun on the same SHA; record the reason. A green rerun does not erase the first failure: verify the full required checks and assess flake risk. The same failure again, or an already reproducible defect, goes to the existing root-cause repair task: actually resume/dispatch its owner within the three-task limit, diagnose and fix the cause, review the change, then run regression and all required checks on the new SHA. A failure report or planned fix is not the endpoint. No infinite reruns, skipped assertions, CI bypass or blind timeout increases. If permission/resources truly block repair, name that gate and continue other ready work.

## The loop

1. **Diagnose before dispatch.** For each Blocked, Scheduled or incomplete In progress row, read the issue/PR, current code SHA, latest relevant run/job/step and live owner/session. Compare failures with the fix SHA: an old failed run or green summary/classifier does not establish the current dependency. Record: `cause | evidence + checked time | exact step held | owner | next action | expected artifact`.
2. **Test the gate.** Classify it as a dependency, permission, access/tool failure, execution failure, or stale claim. Name the exact operation that cannot proceed. A merged fix advances to the next owed stage; it does not require reimplementation. An independent workflow need not wait for an application release tag. Use an already-authorized alternative route or independent substeps; never invent a founder gate or bypass a real approval, credential, spend or release restriction. Apply **Own the blocker through resolution**: reuse or create the single root-cause repair, then execute it when authorized and admitted. Ask once for a specific bounded decision if needed, and continue independent work.
3. **Continue completed stages.** On a completion notification or result found during a scan, read back the stage artifact and acceptance evidence. For an incomplete task, use the actual message/resume tool to have its task subagent start the next allowed stage or rework, or record the concrete external gate and resume condition when no work is permitted. Receiving or reporting a stage result is not task completion.
4. **Steer, then verify.** Send the existing live task subagent a concrete next step, required artifact and check point. Never duplicate it. Move Blocked → Scheduled after adequately reviewing the blocker and reading back the posted concrete next-step guidance. Scheduled is a start/resume queue state, not proof of execution, permission, resolved gates or delivery, and not a specific appointment time. Keep any unresolved gate explicit. Mark In progress only after task-subagent acknowledgment and evidence that execution started or resumed. Comments, status changes and dispatch receipts are not artifact progress. Set Last updated only to evidenced execution/progress time, not scan time. Never refresh it for review-only comments, ownership backfills or Scheduled relabeling; date those observations in the comment. Keep the last artifact URL/SHA and its movement time in the row notes; unknown progress remains unknown.
5. **Recover stalled ownership.** On the next cycle, read back the promised artifact or inspect the owner's live session for actual activity. If nothing moved, diagnose the failed handoff and send one corrected instruction. If the owner is confirmed stopped/failed, resume it first when supported and ownership remains valid. Transfer the claim before dispatching ONE replacement only when resume is unavailable or confirmed not to have started execution, and no old child remains live. An uncertain resume result is not permission to replace. An unobservable owner is not a dead owner: record the access problem, do independent work, and do not duplicate it. Three cycles with the same failure: stop identical retries, record the cause and exact unblock, and escalate the unresolved recovery once with a responsible owner and decision needed. A missed acknowledgment deadline or failed recovery is a new escalation event even if the underlying blocker and task counts are unchanged. Recheck the dependency each cycle and resume when it changes; do not repeat denied actions without materially new relevant authorization.
6. **Start actionable work.** An open issue with owed work first gets a Not started row with scope and acceptance criteria. Fill available project slots from the priority-ordered READY queue, respecting runtime capacity and model-cost limits. Check other actors' claims, branch prefixes and fresh pushes; shared bot authors prove no ownership. If a gate holds only part of a task, brief the task subagent on the permitted substep, not the blocked action.
7. **Reconcile completion.** Done requires API-read-back merge SHA, recorded Stage 5.5 Design/PRD sync, Stage 6 acceptance evidence and any required live-delivery proof. Merge or issue closure alone is not Done. Keep merged-not-deployed work explicit. Reconcile active GitHub work into the Work Log without inventing an active owner.

Before ending a run, ensure each active incomplete task has a live responsible task subagent or a confirmed continuation action. For a stopped owner, use the recovery contract above; for a real wait or missing capability, record the exact gate and resume condition. A summary alone does not keep the chain running.

### Run-end continuation check

For every active incomplete task, record a concise continuation receipt in its Work Log row: verified owner/runtime state and checked time; last artifact and movement time; next executable step; and either current execution evidence, an actual resume/dispatch receipt with acknowledgment state, or the exact external gate and resume condition. An accepted handoff without execution evidence remains pending in this receipt; it does not justify an In progress transition or a progress timestamp. Link existing evidence instead of duplicating unchanged notes; review-only receipts do not advance Last updated.

If the owner is inaccessible, use the supported coordination tool to ask the owning coordinator to verify or recover that owner, naming the task, last artifact and owed next step. Record the handoff receipt, acknowledgment state and deadline under the dispatch contract. If no coordinator or supported route is available, report that precise capability gap and smallest required decision to the invoking session and keep only the affected recovery pending. Do not repeatedly carry “owner unobservable” as if it were continued execution, and do not replace the owner until inactivity or handover is verified.

Before ending, reconcile the READY queue: identify work admitted and actually started, work waiting for capacity, genuine external gates and unresolved ownership. Execute admitted authorized steps; if none can run, record the evidence for that conclusion and the concrete recovery or resume condition. A board scan, context update or preserved owner name alone does not satisfy this check.

## Dedupe notifications, not recovery

An unchanged task count is never a reason to skip recovery. Before deciding "nothing new", consume unread Product Owner guidance and compare each held task's candidate SHA, run/attempt, failure cause, owner acknowledgment and latest artifact movement with the previous check. A changed failure or failed handoff requires diagnosis even when the row count and status are unchanged.

For an incomplete task with no active owner or a failed run, reuse the existing root-cause repair and apply the claim/resume and three-slot rules; never create a duplicate issue or assume an unobservable owner is dead. If work is already running, steer only when needed and check its promised artifact rather than dispatching again. With a genuine permission gate, record the precise approval and pick other ready work. Repeated identical failures use the bounded recovery rule above, not repeated spawn/message loops.

Suppress duplicate notifications when appropriate, but do not use notification deduplication to suppress permitted execution or recovery. A read acknowledgment, reminder or unchanged count is not progress; record actual action receipts, evidence or the exact gate before ending the run.

## Reporting

Message the job's own session chat ONLY, one short line per completed unit — a row set Done with its evidence, a stalled row pushed with what was dispatched, an unstarted item started — or a blocker/recovery escalation that genuinely needs Den, after permitted self-resolution attempts, stating what was tried. A newly missed acknowledgment deadline or failed recovery qualifies even when the original blocker is unchanged; deduplicate only an already-delivered escalation with no new decision or failed recovery. No completed unit and no escalation event = stay silent (the self-edit report below is the only exception). Never narrate partial steps, checks that changed nothing, or parked rows. A status-only run that leaves actionable work unstewarded is a failure; a verified real gate is not permission to push through it.

## Escalation — systemic blockers

Overrides ordinary silence/own-session reporting. Each run counts genuinely held rows (including Scheduled/In progress), oldest blocker age and root causes. Escalate to the main project session configured in the job if one cause holds ≥3 rows, verified infrastructure is down, or the held-row count grows. Missing access means unknown state, not proven infrastructure failure.

Send the cause, evidence, affected count, exact unblock and responsible owner. Old/parked blockers still qualify; deduplicate unchanged cause + counts, not the first escalation. Refresh the Agents Context escalation line each run: checked time, held count, oldest age, causes and last escalation. Status renames must not hide blockers. If the destination is missing or delivery fails, record that failure and notify the invoking session; do not silently claim escalation succeeded.

## Self-improvement (final step, every run)

1. Work FROM the project's Agents Context page: the recurring failure patterns are recorded there. Scan the project's Work Log rows and this job's recent runs for REPEATED failure patterns — the same kind of stall, misdiagnosis, wasted check, or wrong stage recurring across tasks/runs. Find where the agent keeps going wrong across the list, and fix that recurring cause in the job's own instructions. Before any self-edit, re-read the patterns recorded on the context page — a pattern earns a self-edit only when it is recorded there as recurring, not from a single run's impression. New patterns found in this reflection are written to the context page in the same run (in the context-page update that closes the run). One-off incidents are logged, never edited for. Reflection discipline per `~/workspace/custom-skills/dev-reflection/SKILL.md`.
2. If scheduler self-editing is authorized and supported, apply the concrete fix to this job using the available scheduler tool; otherwise record the proposed fix and the missing capability/approval, without claiming it was applied. HARD LIMITS: schedule, delivery chat, owner, enabled state, and the project parameters in the body (Work Log / PRD / Design / Decision Log links) remain byte-identical; only the loop's working instructions change; a self-edit never expands the job's authority (no new permissions, no release actions, no new chats or projects).
3. Every self-edit is recorded in the same run: a one-line report in the job's own session chat ("self-edit: <what changed> — <why>") even when the run otherwise reports nothing, plus a dated entry with the same content in `~/memory/YYYY-MM-DD.md`. No silent self-modification.
4. A lesson that applies to all projects is appended to the `dev_workflow` skill as a lessons/reflection entry — never a rewrite of its core protocol.

## Agents Context (the project's context page)

Every project has one, titled "Agents Context", under its Notion hub. The job body wires its link as a project parameter.

- **Purpose:** the project's local memory — only the current information an agent must not forget to work the project correctly.
- **Keep it short — one screen.** What belongs: current state in 2–3 lines, active fronts, live gates/blockers with their exact unblock, recurring failure patterns, next priorities. What does NOT belong: history, completed-task detail, run logs, evidence — those live in the Work Log and the daily log; link, don't copy.
- **Maintenance:** read first at run start (see "Read first"); rewritten after the reflection step at run end — an ordinary run write, like a Work Log row update. Rewriting means compressing: anything no longer true is deleted, not accumulated. If the page grows past one screen, the run that notices compresses it.
- **Reflection link:** the reflection/self-improvement step works FROM this page (see below).

## Standing constraints

- Never dispatch release tags — a release happens only when Den says everything is fixed.
- Runner/disk/CI faults can require a scoped infrastructure repair task. Reuse an existing root-cause task or create one with evidence and acceptance criteria; never create duplicate tickets for an unchanged queue observation. Keep only truly dependent steps waiting, and do not report checks or ticket creation as execution progress.
- Investigate CI queue causes and keep independent work moving. A blocked queue does not waive review, exact-commit verification, merge authorization or delivery gates; use a local-evidence alternative only where explicitly permitted by the project and user.
- Verify live, never from document audits alone; "unverified" is a hypothesis, not a task.
- Never print secret values anywhere. Observations worth keeping go to the daily log `~/memory/YYYY-MM-DD.md`, never `MEMORY.md`.




