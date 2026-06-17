---
name: write-skill
description: Write or improve any AI agent instruction surface — SKILL.md, AGENTS.md, CLAUDE.md, GOAL.md, dynamic workflow scripts, or any agent documentation. Also refines a user's rough prompt into a production-quality agent prompt. MUST be loaded whenever writing, editing, reviewing, or refining agent instructions. Triggers: "write a skill", "improve SKILL.md", "write agent instructions", "update AGENTS.md", "update CLAUDE.md", "write GOAL.md", "create a workflow script", "write a dynamic workflow", "refine this prompt", "turn this into an agent prompt", "improve this prompt", "prompt engineering". For scaffolding/discovery, pair with skill-creator.
---

# Write Agent Instructions

Produce agent instructions that are outcome-defined, XML-structured where beneficial, imperative, lean, and self-verifying. The output is a prompt that makes a competent agent succeed on real tasks without hand-holding.

## Surfaces

This skill applies to five instruction surfaces:

| Surface | File | When loaded |
|---|---|---|
| **Skill** | `SKILL.md` | On trigger match; stays for session [1] |
| **Project instructions** | `AGENTS.md` / `CLAUDE.md` | Every conversation in that project |
| **Goal condition** | `GOAL.md` | When `/goal` is active; evaluator checks each turn [4] |
| **Dynamic workflow** | `.js`/`.ts` script in a skill dir | When orchestrating subagent pipelines [3] |
| **Agent docs** | Any AI agent documentation/instructions | Varies by system |

They share the same prompting principles below. They differ in scope and lifecycle — a skill has a frontmatter description for retrieval, project instructions are always loaded, and workflows are code that spawns agents.

For directory scaffolding, locations, and progressive disclosure into `references/`, use `skill-creator` alongside this skill.

---

## Frontmatter (Skills only)

`name` and `description` are the universal required core (the [Agent Skills](https://agentskills.io) spec). Everything else is optional and runtime-specific.

- **name**: lowercase alphanumeric + single hyphens, 1–64 chars, matches the folder exactly. Regex: `^[a-z0-9]+(-[a-z0-9]+)*$`. Verb-led reads best.
- **description**: a retrieval target, not a summary, max 1024 chars. Write so the agent matches it from the user's real phrasing.
  - State **what it does** and **when to use it** in one or two sentences.
  - Add **concrete trigger phrases** the user would actually type — short, discriminative keywords [2].
  - Put every "when to use" cue here — the body can't help triggering because it isn't loaded yet [1].
  - Disambiguate from neighbors: note what it's NOT for if a sibling skill is close.

<example>
description: Convert Mermaid diagrams into native Excalidraw elements and merge into an existing .excalidraw file. Use when asked to "convert mermaid to excalidraw", "add this diagram to the mindmap", or "migrate .mmd to excalidraw". Not for editing existing Excalidraw shapes.
</example>

### Optional fields

| Field | Honored by | Purpose |
|---|---|---|
| `license` | spec, OpenCode | License name or reference to a bundled license file |
| `compatibility` | spec, OpenCode | Env requirements (intended product, packages, network). Max 500 chars |
| `metadata` | spec, OpenCode | Arbitrary string key→value map (e.g. `author`, `version`) |
| `allowed-tools` | spec (experimental), Claude Code | Tools pre-approved without permission prompt. Space/comma list or YAML list |
| `model`, `effort` | Claude Code | Override model / reasoning effort for the skill's turn |
| `disable-model-invocation`, `user-invocable` | Claude Code | Control who can invoke (`/name` only vs. auto-load vs. hidden) |
| `argument-hint`, `arguments`, `paths`, `hooks`, `context`, `agent`, `shell` | Claude Code | Args, path-gated activation, lifecycle hooks, subagent forking, shell |

Claude Code caps `description` + `when_to_use` at 1,536 chars in the listing — stay under 1024 for portability.

### Portability

Write to the common subset (`name` + `description`, optionally `license`/`compatibility`/`metadata`) for cross-runtime skills. Runtime-specific fields are ignored, not errors, elsewhere [1]. A skill placed in `.claude/skills/`, `.agents/skills/`, or `.opencode/skills/` works across both runtimes without duplication.

---

## Body Principles

Write for another agent that is already competent — add only what's non-obvious. These principles apply to all five surfaces:

### Structure

1. **Outcome-first.** Define what good looks like, constraints, and what the final output contains — before spelling out process [7]. Process-heavy stacks underperform outcome-defined prompts.
2. **Role → Goal → Constraints → Output → Stop rules.** This sequence works across models [7]. For project instructions, adapt to: Context → Responsibilities → Tools → Rules → Format.
3. **Use XML tags for structure.** Wrap distinct sections in semantic XML tags (`<constraints>`, `<output_format>`, `<examples>`, `<rules>`) — Claude and GPT-5.5 both parse XML unambiguously for separating instructions from data, examples from rules, and user content from system content [2][7].
4. **State scope explicitly.** Literal agents won't generalize a rule beyond its example — write the full scope [2][5].
5. **One good example beats a schema.** Wrap in `<example>` tags. 3–5 for format-sensitive output [2].
6. **Define done.** End with a verifiable completion check — one measurable end state and a stated check [4]. "Tests pass and PR has no lint errors" not "code is clean".

### Voice

7. **Imperative voice.** "Run X", "Return Y" — not "the agent should consider" [2][5].
8. **Positive instructions.** Say what to do. Reserve ALWAYS/NEVER for true invariants; use decision rules for judgment calls [7].
9. **Be clear and direct.** Show the prompt to a colleague — if they'd have questions, so will the model [2].
10. **Add context/motivation for non-obvious rules.** A one-line "why" dramatically improves compliance on edge cases [2].

### Efficiency

11. **Assume intelligence; supply specifics.** Skip general knowledge. Include the project's quirks, exact commands, schemas, gotchas [5][6].
12. **Name exact tools and order.** When sequence or side effects matter, number the steps and name the tool (`use Edit, not sed`) [5].
13. **Concrete bars over qualitative words.** "report bugs that cause wrong output or test failures" not "report important bugs" [2][7].
14. **Each thing once.** No repeated rules across sections. Dedup is a hard requirement [7].
15. **Keep it lean.** Under ~500 lines for skills. Past that, move detail to `references/` and leave a one-line pointer [1]. Project instructions: stay as short as possible — they load every conversation.

### Agent autonomy

16. **Bias to action with guardrails.** Tell the agent to proceed if the action is clear + reversible + low-risk; ask only for irreversible/external/missing-critical [6].
17. **Prompt self-checks.** Ask the agent to verify its own work: run tests, render-then-inspect, re-read requirements before declaring done [2][4][7].
18. **Batch exploration.** Tell the agent to decide ALL files/resources needed before any tool call, then batch [5].
19. **Explicit stopping conditions.** Define when to stop researching, when to ask the user, when the task is truly complete [4][7].

---

## XML Structuring Guide

Use XML tags whenever the prompt has heterogeneous content that the model must parse unambiguously [2][7]:

<example>
<role>You are a code reviewer for a TypeScript monorepo.</role>

<constraints>
- Only flag bugs that cause wrong output or test failures.
- Do not suggest style changes unless they violate the project's eslint config.
</constraints>

<output_format>
For each finding:
- file:line
- severity: ERROR | WARN
- description (one sentence)
- suggested fix (code block)
</output_format>

<stop_rules>
- Stop after reviewing all changed files in the PR diff.
- If more than 20 findings, summarize the pattern instead of listing all.
</stop_rules>
</example>

When to use XML vs. markdown in agent instructions:

| Situation | Use |
|---|---|
| Separating instructions from user-provided data | XML tags (`<user_input>`, `<context>`) [2] |
| Multiple examples that must not bleed into rules | `<example>` tags [2] |
| Sections the model must parse as distinct blocks | XML tags [7] |
| Human-readable documentation or simple lists | Markdown headings and bullets |
| Mixed: both human and model will read it | Markdown structure + XML for data boundaries |

---

## Prompt Refinement

When refining a user's rough prompt into a production-quality agent prompt:

1. **Extract the outcome.** Ask: what does the user want the agent to produce? State it as a concrete deliverable.
2. **Identify implicit constraints.** Surface assumptions the user hasn't stated — format, length, audience, tools available, environment.
3. **Structure with XML.** Wrap the refined prompt in semantic sections: `<role>`, `<goal>`, `<constraints>`, `<output_format>`, `<examples>`, `<stop_rules>` [2][7].
4. **Add missing specifics.** Fill gaps: exact tool names, file paths, error handling, edge cases the user didn't mention but the agent will encounter.
5. **Set autonomy boundaries.** Define what the agent can decide alone vs. what requires asking back [6].
6. **Include a self-check.** End with a verification step the agent runs before declaring done [4][7].
7. **Test mentally.** Read the refined prompt as if you're a literal agent seeing it for the first time — would you produce the right output without further clarification? [2]

<example>
User's rough prompt: "review my PR and fix issues"

Refined agent prompt:
<role>Senior code reviewer for this TypeScript project.</role>
<goal>Review all changed files in the current PR. For each bug or security issue found, apply a fix directly.</goal>
<constraints>
- Only fix bugs that cause incorrect behavior or test failures.
- Do not refactor code style unless it causes a bug.
- Run `npm test` after each fix to confirm no regressions.
</constraints>
<output_format>
After all fixes: summarize what was fixed (file:line, one sentence each).
</output_format>
<stop_rules>
- Stop when all changed files are reviewed and all applied fixes pass tests.
- If a fix would be breaking/irreversible, describe it instead of applying.
</stop_rules>
</example>

---

## Degrees of Freedom

Match prescriptiveness to the task:

| Task shape | Write the body as |
|---|---|
| Many valid approaches | High-level principles + decision rules [7] |
| One preferred pattern, some variation | Pseudocode or a parameterized template |
| Fragile exact sequence | Numbered low-level steps, or a `scripts/` script [1] |

For deterministic or repeated operations, prefer a bundled script over prose — it runs without spending body tokens and can't drift.

---

## Dynamic Workflows

Dynamic workflows are JS/TS scripts that orchestrate subagent pipelines [3]. When writing one:

1. Move the plan into code — the workflow script decides which agents to spawn, in what order, and with what prompts.
2. Each subagent prompt follows the same body principles above.
3. Define well-scoped tool descriptions for each subagent — overuse of broad tool access causes confusion [2][3].
4. Use structured state files (JSON/YAML) for inter-agent communication, not conversation memory [2].
5. Inject dynamic context with `!\`command\`` syntax where supported [1].
6. String substitutions available: `$ARGUMENTS`, `$ARGUMENTS[N]`, `$N`, `$name`, `${CLAUDE_SESSION_ID}`, `${CLAUDE_EFFORT}`, `${CLAUDE_SKILL_DIR}` [1].

---

## Project Instructions (AGENTS.md / CLAUDE.md)

When writing or updating project-wide agent instructions:

1. Keep them short — they load every conversation and count against context.
2. Structure as: Project context → Agent responsibilities → Tool preferences → Rules → Format expectations.
3. Put the most-violated rules first — they get strongest attention weight [2].
4. Use conditional blocks for role-specific instructions (reviewer vs. implementer).
5. Don't duplicate what skills already cover — reference the skill name instead.
6. Set instruction priority: newer user instructions override earlier ones; safety never yields [6].
7. Define personality (how the agent sounds) and collaboration style (how it works) as separate short blocks [7].

---

## Goal Conditions (GOAL.md)

When writing a `/goal` completion condition [4]:

1. One measurable end state — not a vague aspiration. "All tests in `tests/auth/` pass and coverage > 80%" not "auth works well".
2. State the check explicitly — what command or observation confirms done.
3. Include constraints that bound acceptable solutions (e.g. "no new dependencies", "under 200ms p95").
4. Keep it to 1–3 sentences. The evaluator reads it every turn — brevity is critical.
5. Avoid process instructions — the goal defines *what*, not *how*.

---

## Never Create

`README.md`, `INSTALLATION_GUIDE.md`, `QUICK_REFERENCE.md`, `CHANGELOG.md`. The SKILL.md is the entry point.

---

## Self-Audit Checklist

Run this check on every instruction artifact you produce before declaring done:

1. **Description length** — is it under 1024 chars? Count it.
2. **Table/text consistency** — do counts in prose match actual rows/items?
3. **Outcome-first** — does the opening state what the artifact produces, not how?
4. **Dedup** — is every rule stated exactly once across all sections?
5. **XML structure** — are heterogeneous content blocks wrapped in semantic XML tags where the model needs unambiguous parsing? [2][7]
6. **Prompt refinement applied** — if starting from a user's rough intent, has it been restructured into Role → Goal → Constraints → Output → Stop rules?
7. **Done condition** — is there a verifiable end state, not a qualitative aspiration?
8. **Lean** — under ~500 lines for skills? Long references moved to `references/`?

---

## Process

1. Get 2–3 concrete example tasks the instructions must handle.
2. For skills: draft the description; test by asking — would this match the user's actual wording?
3. For prompt refinement: extract outcome, surface constraints, structure with XML, add specifics, set autonomy, include self-check.
4. Write the body to the minimum that lets a competent agent succeed on the examples.
5. Pull schemas / long refs into `references/`; implement deterministic steps as `scripts/` and test by running.
6. Use it on a real task; tighten where the agent struggled.
7. Run the Self-Audit Checklist above before declaring done.

---

## Done When

- **Skills**: Description names what it does + when, with real trigger phrases, under 1024 chars. Body is non-obvious-only, imperative, deduped, XML-structured where beneficial, under ~500 lines. Scope and bars are concrete; examples in `<example>` tags. Frontmatter has the required `name` + `description` core; folder name matches `name`.
- **Project instructions**: Short, structured, no duplication with skills, most-violated rules first, XML tags for data boundaries.
- **Goal conditions**: 1–3 sentences, measurable end state, explicit check command, no process instructions.
- **Dynamic workflows**: Script runs, subagent prompts follow body principles, state files defined, error handling present.
- **Prompt refinement**: User's rough intent restructured into Role → Goal → Constraints → Output → Stop rules with XML tags, specifics filled, self-check included.
- **Self-audit checklist**: All 8 items pass.

---

## References

| # | Source | URL |
|---|---|---|
| [1] | Claude Code Skills docs | https://code.claude.com/docs/en/skills |
| [2] | Claude Prompting Best Practices | https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview |
| [3] | Orchestrate subagents at scale | https://code.claude.com/docs/en/workflows |
| [4] | Keep Claude working toward a goal | https://code.claude.com/docs/en/goal |
| [5] | Codex Prompting Guide | https://cookbook.openai.com/examples/codex/codex_prompting_guide |
| [6] | OpenAI GPT-5.3-Codex Prompt Guidance | https://developers.openai.com/api/docs/guides/prompt-guidance?model=gpt-5.3-codex |
| [7] | OpenAI GPT-5.5 Prompt Guidance | https://developers.openai.com/api/docs/guides/prompt-guidance?model=gpt-5.5 |
