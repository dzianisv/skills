---
name: write-agents-md
description: Write, compact, or deduplicate an AGENTS.md / CLAUDE.md project instruction file. Use when creating agent instructions from scratch, or when asked to shorten, dedupe, clean up, or remove fluff/AI-slop from an existing AGENTS.md or CLAUDE.md. Triggers: "write AGENTS.md", "compact our agent instructions", "dedupe CLAUDE.md", "trim the agent rules".
---

# Write AGENTS.md

AGENTS.md (and CLAUDE.md) is loaded into **every** agent session. You pay its full token cost on every turn, forever. Treat it as a hot path: each line must earn its place by changing agent behavior. If a line doesn't change what the agent does, cut it.

## Core rules

These come from Claude and OpenAI prompt-engineering guidance. Apply all of them.

1. **Every line is a directive or a fact.** No preamble, no motivation, no "we strive to". If deleting a line wouldn't change behavior, delete it.
2. **Say each thing once.** Pick the single best home for a rule and link to it; never restate it under three headings.
3. **Positive imperatives over prohibitions.** "Run X before Y" beats "don't forget X". Tell the agent what to do, not what to avoid.
4. **Decision rules over absolutes.** Reserve ALWAYS/NEVER/caps for true invariants (safety, secrets, irreversible actions). Elsewhere use "prefer", "default to", "when X, do Y".
5. **State scope explicitly.** Literal-minded agents won't generalize "use the dedicated tool" to all tools — write "for every file edit" if that's what you mean.
6. **Concrete over qualitative.** Replace "important issues" / "be thorough" with the actual bar: paths, commands, names, thresholds.
7. **Lead with what matters.** Order by importance and frequency, not narrative. The rule used every turn goes near the top.
8. **Name exact tools, paths, commands.** `gh pr create`, `source ~/.env.d/x.env`, `$(date +%F).md` — not "the CLI" or "a dated file".
9. **Examples in tags.** Wrap concrete examples in `<example>...</example>` so they're distinct from instructions. One real example beats a paragraph of description.
10. **Structure only to aid scanning.** Headings and flat bullets where they help an agent jump to a section; plain imperative lines otherwise. Avoid deep nesting.

## Suggested shape

Keep sections only if the project needs them. Typical order:

```
# <Project> — Agent Instructions
<1-2 line: what this repo is + what "done" means here>

## Workflow        # the steps an agent takes per task, in order
## Commands        # exact build/test/lint/run commands
## Conventions     # code style, naming, structure that isn't obvious from the code
## Constraints     # secrets handling, what not to touch, irreversible actions
## Delegation      # when/how to spawn subagents (names, models), if applicable
```

Don't invent sections to look complete. Omit any with nothing non-obvious to say.

## Process

1. **Read** the existing file fully (skip if creating new).
2. **Inventory** every distinct directive/fact as a flat list. This is your preservation set — nothing in it may be lost.
3. **Dedupe**: collapse repeats to one canonical statement.
4. **Cut fluff**: motivational padding, hedging, restated context, bold/caps noise, "as an AI" framing, anything the codebase or git history already tells the agent.
5. **Tighten**: rewrite survivors as terse positive imperatives; make scope and bars explicit.
6. **Verify**: check every item from step 2 still appears. Shortening must come from tighter prose and removed duplication — never from dropping a real rule.

## Done when

- Every inventoried directive is preserved.
- No rule stated twice.
- No line that fails the "does this change behavior?" test.
- Absolutes reserved for real invariants.
- Report before/after line + byte count and what was merged/cut.
