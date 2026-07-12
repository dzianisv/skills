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
</hard_rules>

<structure>
1. Short 3-5-sentence recap: what was done, what are not, next steps;
2. PR tables in this session. Description. Status: merged, opened (ci passed, ci failed).
3. Session tasks log table: task description, outcomoe, status (completed, failed, in progress)
4. If something is possible to describe in diagram (liek we worked on systemd design), include a diagram. I see information visually
5. Next steps if any.
</structure>
