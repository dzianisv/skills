---
name: write-skill
description: Author or improve the SKILL.md of an agent skill — write a sharp description trigger and a concise, high-signal body using prompt-engineering best practices. Use when writing a new skill's content, or tightening an existing SKILL.md for clarity, triggering, and conciseness. Triggers: "write a skill", "improve this SKILL.md", "fix the skill description", "make this skill trigger reliably". For scaffolding/discovery mechanics, pair with skill-creator.
---

# Write Skill

A SKILL.md has two parts that follow different rules. The **frontmatter description** is always loaded and decides *whether* the skill triggers. The **body** loads only after triggering and decides *how well* the agent executes. Optimize each for its job.

This skill covers the writing quality. For directory scaffolding, locations, progressive disclosure into `references/`, and skill discovery, use the `skill-creator` skill alongside it.

## Frontmatter

`name` and `description` are the universal required core (the [Agent Skills](https://agentskills.io) spec). Everything else is optional and runtime-specific — see the table below. For a cross-runtime skill, write only the core.

- **name**: lowercase alphanumeric + single hyphens, 1–64 chars, no leading/trailing/consecutive hyphens, matches the folder exactly (`rotate-pdf`, `gh-address-comments`). Regex: `^[a-z0-9]+(-[a-z0-9]+)*$`. Verb-led reads best.
- **description**: this is a retrieval target, not a summary, max 1024 chars. Write it so the agent matches it from a user's real phrasing.
  - State **what it does** and **when to use it** in one or two sentences.
  - Add **concrete trigger phrases** the user would actually type. Short, discriminative keywords beat abstract description.
  - Put every "when to use" cue here — the body can't help triggering because it isn't loaded yet.
  - Disambiguate from neighbors: note what it's NOT for if a sibling skill is close.

<example>
description: Convert Mermaid diagrams into native Excalidraw elements and merge into an existing .excalidraw file. Use when asked to "convert mermaid to excalidraw", "add this diagram to the mindmap", or "migrate .mmd to excalidraw". Not for editing existing Excalidraw shapes.
</example>

### Optional fields

| Field | Honored by | Purpose |
|---|---|---|
| `license` | spec, OpenCode | License name or reference to a bundled license file. |
| `compatibility` | spec, OpenCode | Env requirements (intended product, packages, network). Max 500 chars. |
| `metadata` | spec, OpenCode | Arbitrary string key→value map (e.g. `author`, `version`). |
| `allowed-tools` | spec (experimental), Claude Code | Tools pre-approved without a permission prompt while the skill is active. Space/comma list or YAML list. |
| `model`, `effort` | Claude Code | Override model / reasoning effort for the skill's turn. |
| `disable-model-invocation`, `user-invocable` | Claude Code | Control who can invoke (`/name` only vs. auto-load vs. hidden). |
| `argument-hint`, `arguments`, `paths`, `hooks`, `context`, `agent`, `shell` | Claude Code | Args, path-gated activation, lifecycle hooks, subagent forking, shell. |

Claude Code treats `name` as optional (defaults to the directory name) and caps `description` + `when_to_use` at 1,536 chars in the listing — but writing the spec's required `name` and staying under 1024 keeps the skill portable.

### Portability

Write to the common subset (`name` + `description`, optionally `license`/`compatibility`/`metadata`) for cross-runtime skills. Runtime-specific fields are **ignored, not errors**, elsewhere — OpenCode states "Unknown frontmatter fields are ignored," and Claude Code follows the same open standard. So a Claude-Code-tuned skill (e.g. with `model:` or `allowed-tools:`) still loads under OpenCode; those fields just have no effect.

OpenCode discovers skills under `.claude/skills/` and `.agents/skills/` (project and global) in addition to its own `.opencode/skills/`, so a skill placed in any of those paths works across both runtimes without duplication.

## Body

Write for another agent that is already competent — add only what's non-obvious. Apply these (from Claude + OpenAI prompt-engineering guidance):

1. **Assume intelligence; supply specifics.** Skip general knowledge. Include the project's quirks, exact commands, schemas, gotchas.
2. **Imperative voice.** "Run X", "Return Y" — not "the agent should consider".
3. **Positive instructions.** Say what to do. Reserve ALWAYS/NEVER for real invariants.
4. **Name exact tools and order.** When sequence or side effects matter, number the steps and name the tool (`use Edit, not sed`).
5. **State scope explicitly.** Literal agents won't generalize a rule beyond its example — write the full scope.
6. **One good example beats a schema.** Wrap it in `<example>` tags. 3–5 for format-sensitive output.
7. **Concrete bars over qualitative words.** "report bugs that cause wrong output or test failures" not "report important bugs".
8. **Each thing once.** No repeated rules across sections.
9. **Define done.** End with a verifiable completion check for non-trivial skills.
10. **Keep it lean.** Under ~500 lines. Past that, or for reference material/schemas/long docs, move detail to `references/` and leave a one-line pointer (progressive disclosure — see skill-creator).

## Degrees of freedom

Match the body's prescriptiveness to the task:

| Task shape | Write the body as |
|---|---|
| Many valid approaches | High-level principles + decision rules |
| One preferred pattern, some variation | Pseudocode or a parameterized template |
| Fragile exact sequence | Numbered low-level steps, or a `scripts/` script the agent runs |

For deterministic or repeated operations, prefer a bundled script over prose — it runs without spending body tokens and can't drift.

## Never create

`README.md`, `INSTALLATION_GUIDE.md`, `QUICK_REFERENCE.md`, `CHANGELOG.md`. The SKILL.md is the entry point.

## Process

1. Get 2–3 concrete example tasks the skill must handle.
2. Draft the description; test it by asking: would this match the user's actual wording?
3. Write the body to the minimum that lets a competent agent succeed on the examples.
4. Pull schemas / long refs into `references/`; implement deterministic steps as `scripts/` and test by running.
5. Use it on a real task; tighten where the agent struggled.

## Done when

- Description names what it does + when, with real trigger phrases.
- Body is non-obvious-only, imperative, deduped, under ~500 lines.
- Scope and bars are concrete; examples in tags.
- Frontmatter has the required `name` + `description` core; any optional fields are intentional and folder name matches `name`.
