# Prompting Guidelines for SKILL.md Authoring

Apply every item below as an active constraint while drafting, not as a post-hoc checklist.

---

## Clarity and directness

- Be explicit — never rely on the model inferring intent. "Change this function" beats "can you suggest some changes."
- State scope explicitly: a rule about one item won't generalize unless the instruction says so.
- Add a one-line "why" for non-obvious rules — it dramatically improves compliance on edge cases.
- Use numbered steps when order matters.
- Golden rule: show the prompt to a colleague with no context — if they'd be confused, so will the model.

## Examples

- Include 3–5 examples for format-sensitive output.
- Make examples relevant (mirror the real use case), diverse (cover edge cases), and structured (wrap in `<example>` tags).
- Use `<thinking>` tags inside few-shot examples to show reasoning patterns.

## XML structure

Use XML tags to separate heterogeneous content so the model can't misparse it:

| Situation | Tag |
|---|---|
| Multiple examples | `<example>` / `<examples>` |
| Distinct instruction blocks | `<constraints>`, `<output_format>`, `<stop_rules>` |
| User-provided data inside a prompt | `<user_input>`, `<context>` |
| Long documents | `<document index="N"><source>…</source><document_content>…</document_content></document>` |

Markdown headings and bullets for human-readable sections; XML for content the model must parse unambiguously.

## Output format

- Tell the model what TO do, not what to avoid: "write in flowing prose paragraphs" beats "do not use markdown."
- Match prompt style to desired output style — markdown-heavy prompts produce markdown-heavy outputs.
- Long-context tasks: put documents at the top, query at the bottom (up to 30% quality uplift).
- Ask the model to quote relevant passages before answering — cuts through noise in large docs.

## Tool use

- Name tools explicitly and imperatively: "Use Edit, not sed."
- Batch independent tool calls in a single message — instruct the model to parallelize.
- Be explicit about action vs. suggestion: "implement" vs. "suggest."

## Agentic / multi-step

- Define a verifiable done condition: measurable end state + check command. "Tests pass and PR has no lint errors" not "code is clean."
- Prompt self-checks: "before declaring done, run the tests and verify output matches requirements."
- For long-horizon tasks: use structured state files (JSON for status, freeform text for notes, git for checkpoints).
- Control reversibility: list which actions need confirmation (force-push, delete, external post) vs. which to take freely (file edit, run tests).
- Prevent overengineering: "only make changes directly requested or clearly necessary."
- Prevent hallucination: "never claim anything about code you haven't opened — read the file first."

## Scope and verbosity

- Under ~500 lines per SKILL.md. Move long references to `references/`, deterministic steps to `scripts/`.
- Each rule stated exactly once — dedup is mandatory.
- Skip general knowledge; include project-specific quirks, exact commands, schemas, gotchas.
- No trailing summaries or "happy to help" filler — lead with the outcome.

---

## Self-check before declaring the skill done

Tick every box before declaring the authored SKILL.md complete:

- [ ] Format-sensitive output has 3–5 examples wrapped in `<example>` tags
- [ ] Heterogeneous content blocks use XML tags (not markdown alone)
- [ ] Every instruction is what-TO-do phrasing (positive alternative over "do not X" where one exists)
- [ ] There is a verifiable done condition — measurable end state + explicit check command
- [ ] File is under 500 lines; long refs pushed to `references/`, deterministic steps to `scripts/`
- [ ] Every rule appears exactly once across all sections
- [ ] No trailing summaries, "happy to help," or recap paragraphs
- [ ] Scope is explicit — no rules that rely on generalization the model must infer
