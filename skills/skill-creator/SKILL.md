---
name: skill-creator
description: Create, edit, improve, audit, OR discover existing agent skills. Use when creating a new skill from scratch, improving/auditing an existing one, restructuring a skill dir, OR when the user asks "is there a skill for X", "find a skill", "how do I do X with a skill". Triggers: "create a skill", "author a skill", "tidy up a skill", "improve this skill", "review the skill", "audit the skill", "find a skill for X", "is there a skill that can…", "search skills.sh", "extend my capabilities".
---

# Skill Creator (+ Discovery)

Guidance for **finding**, authoring, and maintaining effective skills.

## 0. Discovery (do this BEFORE authoring a new skill)

Before writing a new skill, check whether one already exists in the ecosystem.

```bash
npx skills find <query>            # search the directory
npx skills add <owner/repo@skill>  # install one
npx skills check                   # check for updates
npx skills update                  # update all installed
```

Browse: <https://skills.sh/>

### Procedure

1. **Identify** the domain and the specific task. Skip discovery only if the
   task is highly idiosyncratic to this project.
2. **Check the leaderboard** at <https://skills.sh/> first. High-signal sources:
   - `vercel-labs/agent-skills` — React, Next.js, web design (100K+ installs)
   - `anthropics/skills` — frontend design, document processing (100K+ installs)
3. **Search** if the leaderboard misses: `npx skills find <query>`. Examples:
   - "make React app faster" → `npx skills find react performance`
   - "help with PR reviews" → `npx skills find pr review`
   - "create a changelog" → `npx skills find changelog`
4. **Verify** before recommending or installing:
   - Install count: prefer 1K+. Skeptical below 100.
   - Source reputation: official (`vercel-labs`, `anthropics`, `microsoft`)
     beats unknown publishers.
   - GitHub stars: under 100 → be skeptical, read the SKILL.md first.
5. **Present** with: name, what it does, install count, install command,
   skills.sh link.
6. **Install** on user approval:
   ```bash
   npx skills add <owner/repo@skill> -g -y    # -g global, -y skip confirm
   ```

### Common search categories

| Category | Sample queries |
|----------|----------------|
| Web | react, nextjs, typescript, css, tailwind |
| Testing | testing, jest, playwright, e2e |
| DevOps | deploy, docker, kubernetes, ci-cd |
| Docs | docs, readme, changelog, api-docs |
| Quality | review, lint, refactor, best-practices |
| Design | ui, ux, design-system, accessibility |
| Productivity | workflow, automation, git |

### Search tips

- Specific keywords beat generic ones.
- Try alternative terms (`deployment` vs `ci-cd` vs `deploy`).
- Popular sources: `vercel-labs/agent-skills`, `ComposioHQ/awesome-claude-skills`.

### No match in the directory

1. Tell the user nothing was found.
2. Offer to handle the task directly this time.
3. If the task is recurring, proceed to **Authoring** below: `npx skills init my-skill`.

---

## Authoring

Guidance for authoring effective skills.

## Locations

- Global: `~/.agents/skills/<skill-name>/`
- Per-project: `.agents/skills/<skill-name>/`

## What skills provide

1. Specialized workflows — multi-step procedures
2. Tool integrations — file formats, APIs
3. Domain expertise — schemas, business logic
4. Bundled resources — scripts, refs, assets

## Core principles

### Concise

Context window is shared. Default: agent is already smart. Only add what's non-obvious. Challenge every paragraph: does it justify token cost?

### Degrees of freedom

| Freedom | Use when |
|---|---|
| High (text) | Multiple valid approaches, context-dependent |
| Medium (pseudocode / parameterized scripts) | Preferred pattern, variation OK |
| Low (specific scripts, few params) | Fragile ops, must follow exact sequence |

### Anatomy

```
skill-name/
├── SKILL.md (required)
│   ├── YAML frontmatter — name + description (required)
│   └── Markdown body (required)
└── Optional:
    ├── scripts/      — executable code
    ├── references/   — docs loaded on demand
    └── assets/       — templates, icons, fonts
```

**SKILL.md frontmatter**: `name` + `description` only. Description = trigger. Body = loaded after trigger; keep under 500 lines.

**scripts/** — deterministic ops or repeated code. Token-efficient (run without loading).

**references/** — schemas, API docs, policies. Keep SKILL.md lean; move detail here.

**assets/** — files used in output (not loaded into context).

**Never create**: `README.md`, `INSTALLATION_GUIDE.md`, `QUICK_REFERENCE.md`, `CHANGELOG.md`.

## Progressive disclosure

Three load levels:
1. Metadata (always loaded, ~100 words)
2. SKILL.md body (loaded on trigger, <500 lines)
3. Bundled resources (loaded on demand)

Approaching 500 lines → split to `references/`.

Patterns:

```markdown
## Advanced features
- **Form filling**: see references/forms.md
- **API reference**: see references/api.md
```

```
bigquery-skill/
├── SKILL.md (overview + nav)
└── references/{finance,sales,product}.md
```

Keep refs one level deep. Files >100 lines need TOC.

## Process

1. Understand with concrete examples
2. Plan reusable contents (scripts/refs/assets)
3. Scaffold directory
4. Edit + implement
5. Iterate on real usage

### 1. Understand

Ask: "What should this support?" / "Examples?" / "What trigger phrases?" Conclude when clear.

### 2. Plan

Per example:
- How would you execute from scratch?
- What scripts/refs/assets help repetition?

Examples:
- "Rotate this PDF" → `scripts/rotate_pdf.py`
- "Query BigQuery sales" → `references/schema.md`

### 3. Scaffold

```bash
mkdir -p ~/.agents/skills/<name>/{scripts,references,assets}
# or just .agents/skills/<name>/
```

Create SKILL.md with frontmatter only-needed subdirs.

### 4. Edit

Write for another agent. Include non-obvious info.

Frontmatter: only `name` + `description`. All "when to use" → description (body only loads post-trigger).

Body: imperative form, <500 lines, refs in `references/`. Implement scripts first; test by running.

### 5. Iterate

Use it for real. Note struggles → adjust SKILL.md or resources → retest.

## Naming

- Lowercase, digits, hyphens. Under 64 chars.
- Short verb-led phrases (e.g., `plan-mode`, `gh-address-comments`).
- Namespace by tool if helps (e.g., `linear-address-issue`).
- Folder name = skill name exactly.
