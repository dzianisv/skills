---
name: blogpost
description: "Write or edit blog posts in the user's preferred style: short, technical, software-engineer voice, understandable to non-experts, value-first, with light SEO and subtle promotion of the relevant product or service. Use when asked to create, draft, rewrite, review, or improve a blog post, article, technical announcement, founder note, or SEO content."
---

# Blogpost

Write like a software engineer explaining useful work to a smart non-expert.

## Voice

- Short.
- Technical, plain.
- Plain english.
- Simple.
- No motivational filler, no corporate tone.
- Mom-understandable point.
- Concrete examples over abstract claims.
- Say: what was built, why it matters, how to use it.
- First-person plural where natural: `we built`, `we learned`, `we use`.

## Goal

Value to the reader first. Good value:
- Practical setup people can copy
- Failure mode people can avoid
- Design trade-off explained clearly
- Cost or operational lesson
- Small product insight from real work

Promotion is secondary. Mention product briefly where context helps.

## Structure

1. Concrete problem
2. Simple idea
3. Working approach
4. Trade-offs / options
5. Recommended path
6. Short product/service connection

Short sections. Headings that say the point directly.

## Style rules

- Ban: `In today's world`, `game changer`, `seamless`, `robust`, `unlock`, `revolutionize`, SaaS filler.
- No long intros. No nested bullets. No fake certainty (`for now`, `for this case`, `the MVP is` instead).
- Code snippets only when useful.
- Tables only for clear comparisons.
- Define acronyms on first use if a normal reader may not know them.

## SEO

Quietly:
- Main keyword in title if natural
- One clear meta description / excerpt
- Related terms in prose, not stuffing
- Search-friendly phrases people actually type'
- Use /ai-seo skill to optimize
- Use /seo-audit skill to check and address SEO issues

Examples:
- `Chrome DevTools remote browser control`
- `cloud-hosted OpenClaw local Chrome`
- `Tailscale reverse tunnel Chrome DevTools`


## Product mention

Light.

Good:
- `This is why OpenClaw keeps the browser-control path simple: local when it should be local, cloud when the workload belongs in the cloud.`
- `OpenClaw uses this pattern so a cloud agent can work with the browser context the user already has.`

Bad:
- `Sign up now and transform your workflow.`
- `OpenClaw is the ultimate revolutionary browser automation platform.`

## For technical posts about code you own

Before writing a single sentence, read the actual source. Do not rely on summaries, session context, or memory of prior reading. For every mechanism you plan to describe:

1. Find the file that implements it. Read it.
2. Trace the execution path: what calls what, in what order, under what condition.
3. Find the exact text the agent/user sees (prompt files, tool descriptions, log messages).
4. Ask: could the mechanism fire differently than I assumed? Check the guards and early-exits.

Specific questions to answer before writing flow diagrams:
- Does this mechanism fire inline (inside a loop) or on an event (idle, stop hook)?
- Are there other mechanisms that overlap or suppress this one?
- What is the exact exit condition? Read the code, not the README.

Only write the diagram after you can trace the flow from source to output with file:line citations.

Anything you cannot cite, do not assert.

## Editing existing

- Preserve author POV
- Cut filler before adding text
- Tighten titles/subtitles
- Verify post teaches something useful
- Keep promo subtle and near the end unless explicit launch post

## Final check

- Reader learns something practical
- Main point clear in first 3 paragraphs
- Non-specialist understandable
- Product mention present but not dominant
- No unnecessary complexity
- Every mechanism described was verified in source code, not inferred from context
