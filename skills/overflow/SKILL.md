# Overflow

The Overflow is the per-task lead subagent dispatched by a Supervisor (the per-project hourly job, `~/workspace/custom-skills/overflow-supervisor/SKILL.md`) or by the orchestrator in chat. It owns ONE task end-to-end. The stage-by-stage process is `dev_workflow` (`~/workspace/custom-skills/dev-workflow/SKILL.md`) — this skill is the lead's operating contract: how it claims, staffs, gates, and reports. The lead coordinates and verifies; it does not implement inline — it spawns one subagent per stage.

## Claim (Stage 0, before any work)

1. The task exists as a GitHub issue (scope + acceptance criteria) and as a row in the project's Work Log (Status "In progress", Last updated = now). No row, no start.
2. Check nobody else is working it: issue comments, open PRs, commits from the last 48h. Another active claim → stand down, withdraw any claim posted, report, pick different work. Attribution only by self-signed claims (branch prefix `codex/…`, a "Codex chat <uuid>" comment, an OpenCode `ses_…` claim); bot authors are shared credentials and prove nothing.
3. Post the claim comment as the first action: session/agent id + "in progress" + scope. Update the issue at design-done, fix-shipped, merge.

## Run the stages (per dev_workflow)

- **Stage 1 — Context:** a context subagent reads the issue fully (body, all comments, linked PRs/issues) plus the Notion design/PRD from the brief, and returns ONE context brief. Later stages work from the brief; they do not re-gather. Never work from the title alone.
- **Stage 2 — Design:** the design must exist in Notion and pass an architecture review against the ticket + PRD before implementation. Missing → a design subagent writes it (per `dev_docs`: 30-second read, concrete nouns and numbers), then the review runs. Bug hunts take the investigation track in `dev_workflow` instead (root cause first; a found bug does not get fixed until the design is repaired).
- **Stage 3 — Implementation:** an implementation subagent works in a branch, opens a PR linking the issue, reports the diff summary + its own local test evidence. It does NOT merge.
- **Stage 4 — Review loop:** a review subagent (never the implementer) reads the Notion design/PRD + acceptance criteria, then the PR diff; evidence claims are checked, criteria tested one by one. Findings → implementation fixes → re-review, until clean. Two rounds bouncing with substantive findings = structural problem: stop, fix the design or the brief, restart.
- **Stage 5 — Merge:** the gate is the review verdict comment read back via the API (comment id + the head SHA it names) — a delivered PASS is not the gate. CI green on the PR head → merge; CI globally broken on main → the local-verification fallback in `dev_workflow`. Verify the merge by SHA readback. The issue does NOT close here.
- **Stage 5.5 — Design/PRD sync:** check whether the merged change makes the Notion Design or PRD wrong; update what it changed, and record the outcome on the issue either way. No recorded sync outcome, no closure.
- **Stage 6 — Validation:** a validation subagent (never the implementer) checks the merged result end-to-end in a real environment and the adjacent flows. Failure reopens the relevant stage. The issue closes and the Work Log row goes Done ONLY when validation passes AND the Stage 5.5 outcome is recorded. A merge is not a deploy: until Den's release tag deploys it, the residual is classified deploy-proof and reported merged-not-deployed, never done.

## The receipt (what the Overflow returns)

Every handoff returns the receipt, never chat memory alone:

- **What shipped:** the deliverable + where it lives.
- **Evidence:** PR URL, merge SHA (read back via API), issue state, Work Log row updated (status + Last updated), Stage 6 result, Stage 5.5 sync outcome.
- **Residuals, classified:** deploy-proof / fleet / Den-gate (name the exact input) / follow-up issue (with its number). A verdict or finding never dangles: every gap leaves with a filed follow-up issue, a fix PR, or an explicit park naming the owner/gate.
- **Recommended next step.**

Identifiers in a receipt are read back from the API before they are reported — a number that 404s is reported as unverified, never passed on. Issues and PRs share one number space: verify the object type before treating "#N" as an issue.

## Standing rules

- Testing per `dev_workflow`: no unit tests, no mock-based tests; a test runs the real product flow end to end or live against real services. Do not grow the test count.
- Non-financial decisions inside the ticket are the Overflow's — decide and record with evidence. Financial impact, Den's credentials, or Den's time go back to the Supervisor/Den.
- Never print secret values anywhere (issues, Notion, chat, logs).
- Durable helper files live under `~/workspace/`, never `/tmp`. Before pushing, re-read the head SHA — a moved head means another actor is mid-work: back off, don't force.
