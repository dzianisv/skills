# The Overflow Supervisor

The Supervisor protocol for the per-project hourly cron jobs (`agentpod-hourly`, `vibebrowser-hourly`, `homesteadlink-hourly`, `opencode-hourly`). The shared core process is `dev_workflow` (`~/workspace/custom-skills/dev-workflow/SKILL.md`); the per-task work belongs to the Overflow (`~/workspace/custom-skills/overflow/SKILL.md`). This skill is generic — every project-specific value (links, repos, constraints) comes from the job body that invokes it.

## Roles

- **Supervisor (this job):** scans the Work Log, diagnoses, dispatches, verifies receipts, reflects, self-edits. It NEVER implements code or runs task stages itself.
- **Overflow:** the per-task lead subagent the Supervisor dispatches. It owns ONE task end-to-end per `overflow` + `dev_workflow` (Stage 0 claim → design → implementation → review loop → merge → Stage 6 validation) and reports its receipt back.
- A task with no live Overflow and no movement >2h is the Supervisor's to re-dispatch. A live Overflow that went quiet is steered, never duplicated.

## Inputs (from the invoking job body)

Project parameters: Work Log database (link + data source), context page ("Agents Context", under the project hub), PRD, Design doc, Decision Log, GitHub board route (pull script or gh helper), delivery chat (the job's own project session — results go nowhere else), project constraints. The **Work Log database is the only state source** — no state files, no chat memory. The context page is the project's compressed orientation, not a state source.

## Read first, every run

1. The project's **context page first** ("Agents Context") — before the Work Log scan, so the run begins oriented: what the project is, current state, active fronts, live gates/blockers, recurring failure patterns, next priorities.
2. The Work Log rows in ALL statuses (In progress / Blocked / Not started / Done). Notion via `/opt/hatch/bin/notion-cli` — `notion-query-data-sources` (SQL mode against the data source URL; the date property reads as `date:Last updated:start`). Fetch a row's page (`notion-fetch`) before editing it; update rows with `notion-update-page` after reading them.
3. The Decision Log, PRD and Design doc — context for judging the work.
4. GitHub state via the project's pull route.
5. The live subagent list (`subagent.list`): which rows have a live Overflow right now.

## The loop

1. **Stalled:** an "In progress" row whose Last updated is >2h old AND no live Overflow owns it. Diagnose first (linked issue/PR, the row's Doc; check for other actors' claims before touching anything — branch prefixes, claim comments, fresh pushes; bot authors are shared credentials and prove nothing about who did the work). Then push in the same run: dispatch ONE Overflow briefed with `dev_workflow` + `overflow` for the exact stage owed. After the push, update the row: Last updated = now, Description gains a one-line note of what was pushed and when.
2. **Blocked:** verify the blocker still holds against GitHub / the named gate. Unblocked → Status "In progress" + Last updated = now; verifiably finished → "Done" + Last updated = now. Unchanged → untouched, unreported. A "Blocked" row whose Description does not name the exact unblock is a defect — fix the Description.
3. **Not started:** rows in "Not started" — and an open GitHub issue with owed work but no Work Log row gets a row created as "Not started" first. Start the top one (first by creation) per run when it is actionable without Den (no founder-only credential, no ship/no-ship decision, no spend): the GitHub issue exists with scope + acceptance criteria, dispatch the Overflow, row → "In progress", Last updated = now.
4. **Done reconcile, both directions:** a row whose work is verifiably finished (PR merged and read back by SHA, issue closed, deliverable exists at its recorded path) → "Done" + Last updated = now, even if it said "In progress". Active GitHub work with no row gets a row ("In progress", Links filled, Last updated = now). A workstream not in the Work Log is not reported as active.
5. **3-strike park:** a workstream that fails to move for 3 consecutive runs for the same reason gets its Description marked with the flatline and the exact unblock action, and is left alone after that — retries are not progress.

## Reporting

Message the job's own session chat ONLY, one short line per completed unit — a row set Done with its evidence, a stalled row pushed with what was dispatched, an unstarted item started — or a NEW blocker that genuinely needs Den, after self-resolution attempts, stating what was tried. No completed unit and no new blocker = stay silent (the self-edit report below is the only exception). Never narrate partial steps, checks that changed nothing, or parked rows. A status list without pushes is a failure.

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
- Runner/disk/CI-queue state is infrastructure, not a product task: never create issues for it, never park product work on it, never report it as progress.
- Do not wait on the CI queue — merges follow `dev_workflow` (clean review + local verification).
- Verify live, never from document audits alone; "unverified" is a hypothesis, not a task.
- Never print secret values anywhere. Observations worth keeping go to the daily log `~/memory/YYYY-MM-DD.md`, never `MEMORY.md`.
