# Prompting Guidelines for SKILL.md Authoring

Apply every item below as an active constraint while drafting, not as a post-hoc checklist. Only items not already in SKILL.md are listed here. The SKILL.md Self-Audit Checklist is the gate; this file holds the extra detail.

## Examples

- Use `<thinking>` tags inside few-shot examples to show reasoning patterns.

## XML structure

Use XML tags to separate heterogeneous content so the model can't misparse it:

| Situation | Tag |
|---|---|
| Long documents | `<document index="N"><source>…</source><document_content>…</document_content></document>` |

Markdown headings and bullets for human-readable sections; XML for content the model must parse unambiguously.

## Output format

- Long-context tasks: put documents at the top, query at the bottom (up to 30% quality uplift).
- Ask the model to quote relevant passages before answering. It cuts through noise in large docs.
- Match prompt style to desired output style. Markdown-heavy prompts produce markdown-heavy outputs.

## Tool use

- Batch independent tool calls in a single message. Instruct the model to parallelize.
- Be explicit about action vs. suggestion: "implement" vs. "suggest."

## Agentic / multi-step

- Control reversibility: list which actions need confirmation (force-push, delete, external post) vs. which to take freely (file edit, run tests).
- Prevent overengineering: "only make changes directly requested or clearly necessary."
- Prevent hallucination: "never claim anything about code you haven't opened. Read the file first."

## Scope and verbosity

- No trailing summaries or "happy to help" filler. Lead with the outcome.

## Optional frontmatter fields

| Field | Honored by | Purpose |
|---|---|---|
| `license` | spec, OpenCode | License name or reference to a bundled license file |
| `compatibility` | spec, OpenCode | Env requirements (intended product, packages, network). Max 500 chars |
| `metadata` | spec, OpenCode | Arbitrary string key→value map (e.g. `author`, `version`) |
| `allowed-tools` | spec (experimental), Claude Code | Tools pre-approved without permission prompt. Space/comma list or YAML list |
| `model`, `effort` | Claude Code | Override model / reasoning effort for the skill's turn |
| `disable-model-invocation`, `user-invocable` | Claude Code | Control who can invoke (`/name` only vs. auto-load vs. hidden) |
| `argument-hint`, `arguments`, `paths`, `hooks`, `context`, `agent`, `shell` | Claude Code | Args, path-gated activation, lifecycle hooks, subagent forking, shell |

Claude Code caps `description` + `when_to_use` at 1,536 chars in the listing. Stay under 1024 for portability.

## Self-check

Run the SKILL.md Self-Audit Checklist before declaring the skill done.
