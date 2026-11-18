---
name: job-search
description: Run Den's Staff Software Engineer job search toward a $600k total-comp target: triage recruiter mail daily, track every contact and application, draft adapted CVs, and report daily with a roadmap chart. Use when the user asks about the job search, a recruiter email, a CV, an application status, or the daily jobs report.
---

# Job Search

Goal: Staff Software Engineer role, $600k total comp. Den has no time to read. Show, don't tell. Charts over text, one clear action per item.

## Privacy: this skill lives in a PUBLIC repo

No private identifiers in this file: no email addresses, no phone numbers, no portfolio or comp numbers beyond the public $600k target. The exact Gmail mailbox and search queries live in the private triage job body. CV source profiles (LinkedIn, GitHub, Substack, Medium, X) are public.

## Triage (daily, jobs-daily-hr-triage)

- Read the dedicated jobs mailbox. Keep a seen-list of triaged thread IDs (private goal workspace, hidden_files/seen-hr-threads.md). Never re-report a seen thread.
- Verdict per thread: GOOD FIT / LOW FIT / ACK (acknowledgment, awaiting decision) / REJECTION. Good fit = Staff-level (or founding-team) role, comp at or near $600k TC, right domain (infra, agents, trading infra, developer tools). Low fit = wrong level, wrong domain, comp far under target, or mass outreach with no level/comp.
- Post to the jobs thread only when something new pops up. Low fit: send the standard decline below (Den, Nov 18: low-fit mail gets a reply, not silence). Standard decline: "Hi [Name], Thanks for reaching out. This one is not a fit for me — I am focused on Staff-level software engineering roles in AI infrastructure / agent systems, targeting $600k total comp. Happy to hear about anything at Staff level in AI infra or agent platforms if it comes up. Best, Dennis"
- Never send or reply to any recruiter or HR contact without Den's explicit approval for that exact message. Drafting is fine. Save as a Gmail draft and link it in the jobs thread.

## CV

- One-page CV, adapted per posting, built from Den's public profiles: LinkedIn, GitHub, Substack, Medium, X.
- Present the CV in the jobs thread for approval before sending. Never attach or send a CV without Den's yes for that exact version.

## Daily report (jobs-daily-notion-report)

- Read the Notion Jobs 2026 tracker page; if it is blank, say so plainly and build the report from the triage seen-list and memory instead. Never invent page content.
- Report sections: Goal, roadmap-chart timeline (see below), Contacts, Replies recap, Blockers, New since yesterday.
- The timeline is ALWAYS a roadmap chart image, never a text list of dates.
- Log the run to the goal timeline and append observations to the daily log ~/memory/YYYY-MM-DD.md. Do not edit MEMORY.md.

## Roadmap chart

- Horizontal timeline, one milestone per event (application, reply, decision, rejection, follow-up). Short labels only: date + name + one-word status, max ~4 words per label.
- Color code: green = good fit / progress, blue = reply sent, amber = awaiting decision, red = rejection / pass, grey = low fit / decline sent. A hollow amber marker = today / still waiting.
- Render as PNG at 300 dpi, readable at chat size. Check the rendered image yourself before posting. Labels must not overlap; alternate labels above and below the line when events are dense.
- Generator script lives in the private goal workspace (hidden_files/build_roadmap.py); it reads roadmap-events.json (one event per entry: date, label, status). Each daily run rewrites the events file from the seen-list + memory and re-renders.
- If the timeline grows past ~15 events, keep only the events that still matter (good fit, pending decisions, recent rejections) and note the rest as counts.

## Current state (update when it changes)

- Good fit in play: Ilir Alija (Alexander Chapman), founding-team role, $20M-seed agentic trading infra (Sequoia + Jump), claims $600k+ base + equity, O-1 sponsorship. Den replied Nov 13, 2026. Awaiting response.
- OpenAI: passed twice (SWE, API Agents, Nov 2; SWE, Plugin Developer Platform, Nov 12). Anthropic (2 apps, Oct 31) and x.ai (2 apps, Oct 30): acknowledgments, no decision yet.
- Low fit: Dylan Barry + Endrit Berisha declined with the standard reply Nov 18. Awishma Gurung, Jayden Lazarus, Donat Llozana: triaged low fit under the old no-action rule, left unanswered.

## Done when

Every new recruiter thread has a verdict recorded in the seen-list, no thread is re-reported, and the daily report is posted with a roadmap chart image whose labels do not overlap. Check: open the posted report and read the chart at chat size.
