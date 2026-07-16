---
name: report
description: "Produce a 1-minute visual ops/session report as an HTML artifact: status banner, root-cause table, one flow diagram, shipped/open tables, and a session work log with PR links and live-verified statuses. Use when asked for a report, session report, incident recap page, or 'write up what we did'."
---

# Report

Produce a session/incident report the user can read and understand in **1 minute**.
If they have questions, they ask — the report does not pre-answer everything.


<hard_rules>
- 1-minute read. Cut anything that doesn't change what the reader does next.
- Plain english. No AI fluff, no emoji, no hedging, no "journey" narration.
- Every PR/CI status is verified live via `gh` at write time — never from memory.
- If run from Claude Code: deliver as an HTML artifact (Artifact tool). Redeploy the SAME file path on updates
  so the URL stays stable. Load the `artifact-design` skill first if required.
- ALSO post the report to Notion daily on the related project's Worklog page (see <notion_delivery>). Both
  deliverables every run: the HTML artifact AND the Notion subpage.
</hard_rules>

<notion_delivery>
Post one dated report subpage per day under the related project's **Worklog** Notion page, via the
`mcp__claude_ai_Notion__notion-*` tools.

1. Identify the related project from the working directory / repo, then its Worklog page id:
   | Project | Worklog page id |
   |---|---|
   | OpenClawBot (AgentPod) | `39aac25eb49f812c9d72d55ab127a6ff` |
   | NonFinancialAdviceAgents | `39eac25eb49f81c59eaaccf1c39b0b3f` |
   - If the project isn't in this table, find its project page with `notion-search`, open/create a child
     page named `Worklog`, and add the row here so it's captured next time.
2. Title: `YYYY-MM-DD — Session report: <one-line topic>` (use the real current date).
3. One subpage PER DAY. Before creating, `notion-fetch` the Worklog page and check its child pages for one
   whose title starts with today's date. If it exists, `notion-update-page` (append/refresh) instead of
   creating a duplicate. Otherwise `notion-create-pages` with `parent: {type:"page_id", page_id:<worklog id>}`.
4. Content = the same report (Notion-flavored markdown): recap, merged-PR table, task-log table, one
   `mermaid` diagram if there's a design/flow, prod-changes-live list, next steps. Do NOT put the title in
   the content body (it goes in `properties.title`). Never paste secrets.
5. Report the created/updated Notion page URL back to the user alongside the artifact URL.
</notion_delivery>

<structure>
1. Short 3-5-sentence recap: what was done, what are not, next steps;
2. PR tables in this session. Description. Status: merged, opened (ci passed, ci failed).
3. Session tasks log table: task description, outcomoe, status (completed, failed, in progress)
4. If something is possible to describe in diagram (liek we worked on systemd design), include a diagram. I see information visually
5. Next steps if any.
</structure>
