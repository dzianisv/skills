---
name: report
description: "Produce a 1-minute visual ops/session report as an HTML artifact: status banner, root-cause table, one flow diagram, shipped/open tables, and a session work log with PR links and live-verified statuses. Use when asked for a report, session report, incident recap page, or 'write up what we did'."
---

# Report

Produce a session/incident report the user can read and understand in **1 minute**.
If they have questions, they ask — the report does not pre-answer everything.

## Hard rules

- 1-minute read. Cut anything that doesn't change what the reader does next.
- Plain english. No AI fluff, no emoji, no hedging, no "journey" narration.
- Every PR/CI status is verified live via `gh` at write time — never from memory.
- One honest caveat section if something is unproven; state worst case in one line.
- Deliver as an HTML artifact (Artifact tool). Redeploy the SAME file path on updates
  so the URL stays stable. Load the `artifact-design` skill first if required.

## Structure (in order, all sections short)

1. **Kicker + headline** — `Ops report · <date>`, one-line outcome
   ("X fixed — Y now does Z"). Headline states the result, not the activity.
2. **Status banner** — 2-4 facts: overall state (e.g. "Master: GREEN"),
   counts (PRs merged), and ONE piece of hard proof (run ID + observable).
3. **Why / findings table** — root causes or key findings. Columns: Cause | Fix (PR#).
   One row per cause, one sentence each, include *how it hid* only if it's the lesson.
4. **The fix — one diagram** — a single left-to-right flow (flex boxes + arrows).
   Only add a "before" flow when the contrast IS the explanation. Highlight new
   components. One-line caption under it.
5. **Shipped table** — PR# | one-line change | status pill.
6. **Open table** — item | status pill (`ready to do` / `filed` / `caveat` / `decision`).
7. **Session work log** (always last content section) — EVERY task worked in the
   session: Task | PR link | status pill. Statuses: `merged`, `ci running`,
   `ci passed`, `open — <one-line reason>`. Verify each with
   `gh pr view N --json state` before writing.
8. **Footer** — where full evidence lives + "questions → ask me".

## Visual system

Use the template at `references/template.html` in this skill directory as the base
(copy it, replace content). Key tokens if rebuilding from scratch:

- Light: bg `#f7f8f7`, surface `#ffffff`, ink `#1c2422`, muted `#5c6b66`,
  accent `#0e7c66` (+soft `#e2f0ec`), crit `#c24437`, warn `#b07a1e`.
- Dark: bg `#101614`, surface `#161e1b`, ink `#e4ebe8`, accent `#3dbb9d`.
  Define tokens on `:root`, override under `@media (prefers-color-scheme: dark)`
  AND `:root[data-theme="dark"]` / `:root[data-theme="light"]` (viewer toggle wins).
- Type: system sans body 15px; `ui-monospace` for IDs, run numbers, PR numbers,
  uppercase kickers/table headers. `tabular-nums` on numeric columns.
- Components: status pills (`ok` green / `warn` amber / `bad` red), bordered tables
  with uppercase headers inside an `overflow-x:auto` box, flow diagram = flex row of
  bordered nodes (`title` + muted `detail` line) with `→` arrows; a vertical
  `branch` column for fan-out. Max width ~820px.
- No CDN/external resources (CSP blocks them). Inline all CSS.

## Anti-patterns (things that got a report rejected)

- Long verification-evidence tables — fold the single strongest proof into the banner.
- Timelines — only include when the sequence itself is the finding.
- Options-considered tables — one line in prose if the decision matters, else drop.
- Restating the report structure back to the user in chat — just give the link
  plus 1-2 sentences of what changed.
