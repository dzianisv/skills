---
name: dev-workflow-supervisor
description: "Use when an hourly project check must find stalled tasks, check live subagent ownership, dispatch actionable work, and verify completion."
---

# Dev Workflow Supervisor

The Supervisor protocol for the per-project hourly cron jobs (`agentpod-hourly`, `vibebrowser-hourly`, `homesteadlink-hourly`, `opencode-hourly`). The shared core process is `dev_workflow` (`~/workspace/custom-skills/dev-workflow/SKILL.md`); the per-task work belongs to the Overflow (`~/workspace/custom-skills/overflow/SKILL.md`). This skill is generic — every project-specific value (links, repos, constraints) comes from the job body that invokes it.

## Roles

- **Supervisor (this job):** scans the Work Log, diagnoses, dispatches, verifies receipts, reflects, self-edits. It NEVER implements code or runs task stages itself.
- **Overflow (task manager):** the per-task lead subagent the Supervisor dispatches. It owns ONE task end-to-end per `overflow` + `dev_workflow` (Stage 0 claim → design → implementation → review loop → merge → Stage 6 validation) and reports its receipt back.
- A task with no live Overflow and no artifact movement >2h is a diagnosis candidate, not an automatic re-dispatch. A live Overflow that went quiet is steered, never duplicated.

## Inputs (from the invoking job body)

Project parameters: Work Log database (link + data source), context page ("Agents Context", under the project hub), PRD, Design doc, Decision Log, GitHub board route (pull script or gh helper), delivery chat (the job's own project session — results go nowhere else), project constraints. The **Work Log database is the only state source** — no state files, no chat memory. The context page is the project's compressed orientation, not a state source.

## Read first, every run

1. The project's **context page first** ("Agents Context") — before the Work Log scan, so the run begins oriented: what the project is, current state, active fronts, live gates/blockers, recurring failure patterns, next priorities.
2. The Work Log rows in ALL statuses (In progress / Blocked / Unblocked / Not started / Done). Notion via `/opt/hatch/bin/notion-cli` — `notion-query-data-sources` (SQL mode against the data source URL; the date property reads as `date:Last updated:start`). Fetch a row's page (`notion-fetch`) before editing it; update rows with `notion-update-page` after reading them.
3. The Decision Log, PRD and Design doc — context for judging the work.
4. GitHub state via the project's pull route.
5. The live subagent list (`subagent.list`): which rows have a live Overflow right now.

## Dispatch and resume contract

The Supervisor starts or resumes ONE task-manager subagent per task with `dev-workflow` + `overflow`; that manager runs the stages and spawns stage subagents. Never dispatch stage work directly from this job.

Send through the runtime's actual subagent message/resume tool, addressed to the owning manager/session—not just a recap in the user chat. Use only tools the runtime exposes (including Muse); do not invent API names. Message:
`task ID + record link | current stage | verified SHA/artifact/run | next action | acceptance check + expected artifact | permissions/gates | report-back destination`.
An accepted dispatch proves handoff only. Read back actual stage activity/results on the next check.

Resume a completed/stopped manager if supported and ownership remains valid. Otherwise confirm its ownership is inactive or cleared before starting a replacement; it reloads the persistent task record and resumes the owed stage. Never duplicate a quiet manager. Before dispatch, re-read the row and claim; overlapping cron runs must not both claim it. Use the runtime's claim/lock mechanism if available; if ownership cannot be established safely, leave dispatch pending.

## The loop

1. **Diagnose before dispatch.** For each Blocked, Unblocked or stale In progress row, read the issue/PR, current code SHA, latest relevant run/job/step and live owner/session. Compare failures with the fix SHA: an old failed run or green summary/classifier does not establish the current dependency. Record: `cause | evidence + checked time | exact step held | owner | next action | expected artifact`.
2. **Test the gate.** Classify it as a dependency, permission, access/tool failure, execution failure, or stale claim. Name the exact operation that cannot proceed. A merged fix advances to the next owed stage; it does not require reimplementation. An independent workflow need not wait for an application release tag. Use an already-authorized alternative route or independent substeps; never invent a founder gate or bypass a real approval, credential, spend or release restriction. Ask once for a specific bounded decision if needed, and continue independent work.
3. **Steer, then verify.** Send the existing live Overflow a concrete next step, required artifact and check point. Never duplicate it. `Unblocked` means the Supervisor reviewed the blocker and posted an actionable next-step comment; it is not permission, resumed execution or delivery. Keep any unresolved gate explicit. Mark In progress only after executor acknowledgment and evidence of resumed work. Comments, status changes, dispatch receipts and Last updated are not artifact progress. Keep the last artifact URL/SHA and its movement time in the row notes; never advance that time for a check/comment/status edit.
4. **Recover stalled ownership.** On the next cycle, read back the promised artifact or inspect the owner's live session for actual activity. If nothing moved, diagnose the failed handoff and send one corrected instruction. If the owner is confirmed stopped/failed, transfer the claim before dispatching ONE replacement for the exact stage owed. An unobservable owner is not a dead owner: record the access problem, do independent work, and do not duplicate it. Three cycles with the same failure: stop identical retries, record the cause and exact unblock, escalate if required, and recheck that dependency each cycle; resume when it changes.
5. **Start actionable work.** An open issue with owed work first gets a Not started row with scope and acceptance criteria. Start the oldest actionable unclaimed row, respecting concurrency and model-cost limits. Check other actors' claims, branch prefixes and fresh pushes; shared bot authors prove no ownership. If a gate holds only part of a task, brief the lead on the permitted substep, not the blocked action.
6. **Reconcile completion.** Done requires API-read-back merge SHA, recorded Stage 5.5 Design/PRD sync, Stage 6 acceptance evidence and any required live-delivery proof. Merge or issue closure alone is not Done. Keep merged-not-deployed work explicit. Reconcile active GitHub work into the Work Log without inventing an active owner.

## Reporting

Message the job's own session chat ONLY, one short line per completed unit — a row set Done with its evidence, a stalled row pushed with what was dispatched, an unstarted item started — or a NEW blocker that genuinely needs Den, after self-resolution attempts, stating what was tried. No completed unit and no new blocker = stay silent (the self-edit report below is the only exception). Never narrate partial steps, checks that changed nothing, or parked rows. A status-only run that leaves actionable work unstewarded is a failure; a verified real gate is not permission to push through it.

## Escalation — systemic blockers

Overrides ordinary silence/own-session reporting. Each run counts genuinely held rows (including Unblocked/In progress), oldest blocker age and root causes. Escalate to the main project session configured in the job if one cause holds ≥3 rows, verified infrastructure is down, or the held-row count grows. Missing access means unknown state, not proven infrastructure failure.

Send the cause, evidence, affected count, exact unblock and responsible owner. Old/parked blockers still qualify; deduplicate unchanged cause + counts, not the first escalation. Refresh the Agents Context escalation line each run: checked time, held count, oldest age, causes and last escalation. Status renames must not hide blockers. If the destination is missing or delivery fails, record that failure and notify the invoking session; do not silently claim escalation succeeded.

## Self-improvement (final step, every run)

1. Work FROM the project's Agents Context page: the recurring failure patterns are recorded there. Scan the project's Work Log rows and this job's recent runs for REPEATED failure patterns — the same kind of stall, misdiagnosis, wasted check, or wrong stage recurring across tasks/runs. Find where the agent keeps going wrong across the list, and fix that recurring cause in the job's own instructions. Before any self-edit, re-read the patterns recorded on the context page — a pattern earns a self-edit only when it is recorded there as recurring, not from a single run's impression. New patterns found in this reflection are written to the context page in the same run (in the context-page update that closes the run). One-off incidents are logged, never edited for. Reflection discipline per `~/workspace/custom-skills/dev-reflection/SKILL.md`.
2. A concrete fix is applied by the run itself: `cron.update` on its own job id with the complete revised body. HARD LIMITS: schedule, delivery chat, owner, enabled state, and the project parameters in the body (Work Log / PRD / Design / Decision Log links) remain byte-identical; only the loop's working instructions change; a self-edit never expands the job's authority (no new permissions, no release actions, no new chats or projects).
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
- Runner/disk/CI-queue state is infrastructure, not a product task: never create issues for it, do not park independent product work on it or report checks as progress. Keep truly dependent steps blocked with evidence.
- Do not wait on the CI queue — merges follow `dev_workflow` (clean review + local verification).
- Verify live, never from document audits alone; "unverified" is a hypothesis, not a task.
- Never print secret values anywhere. Observations worth keeping go to the daily log `~/memory/YYYY-MM-DD.md`, never `MEMORY.md`.
