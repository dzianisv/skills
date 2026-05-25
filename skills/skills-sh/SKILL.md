---
name: skills-sh
description: Use when publishing, registering, or troubleshooting skills on skills.sh — the agent skills directory. Triggers on: "publish skill to skills.sh", "my skill doesn't appear on skills.sh", "how to list skill on skills.sh", "skill shows 0 on website", "request indexing skills.sh".
---

# skills-sh

Publishing skills to skills.sh (https://www.skills.sh) — the Vercel-run agent skills directory.

## Architecture (important)

Two separate systems serve skills:

| System | Used by | Trigger |
|--------|---------|---------|
| Git clone fallback | `npx skills add owner/repo` CLI | Always works once repo is public |
| Blob storage cache | skills.sh **website** | Requires manual indexing by Vercel Labs |

The CLI working does NOT mean the website shows skills. They are independent.

## Repo Requirements

1. Public GitHub repo
2. Skills at `skills/<skill-name>/SKILL.md` (matches priority prefix `skills/`)
3. Each `SKILL.md` must have valid YAML frontmatter:
   ```yaml
   ---
   name: my-skill-name
   description: Use when [triggering conditions]
   ---
   ```
4. Optional but recommended: `skills.sh.json` at repo root

## skills.sh.json (optional grouping config)

```json
{
  "$schema": "https://skills.sh/schemas/skills.sh.schema.json",
  "notGrouped": "bottom",
  "groupings": [
    {
      "title": "Group Title",
      "description": "What these skills do.",
      "skills": ["skill-one", "skill-two"]
    }
  ]
}
```

## Step-by-step: First publish

1. Push skills to `main` branch with valid `SKILL.md` files
2. Verify CLI works: `npx skills add owner/repo --list`
3. File a GitHub issue on `vercel-labs/skills` to request indexing (see below)
4. Wait for Vercel Labs to trigger the indexer (usually 1–3 days)

## Indexing request issue format

File at: https://github.com/vercel-labs/skills/issues/new

```
Title: Listing: Request indexing for owner/repo

Body:
### Description
[Brief description of what the skills do]

### Repo
https://github.com/owner/repo

### Skills
- `skill-name` — [description]
- `skill-name-2` — [description]

### Status
- ✅ Public repo, no auth required
- ✅ Valid SKILL.md with name + description frontmatter
- ✅ Installable via `npx skills add owner/repo` (N installs recorded)
- ✅ skills.sh.json present at repo root
- ✅ Skills at skills/*/SKILL.md paths
```

Reference prior issues: #1221, #1225, #1229 as examples.

## Troubleshooting: website shows "0 skills"

Symptom: `https://www.skills.sh/owner/repo` shows `0 skills` but `N total installs`.

Cause: blob storage not yet populated for this repo.

Diagnosis:
```bash
# Confirms CLI works (git clone fallback)
npx skills add owner/repo --list

# Confirms blob cache is missing
curl https://skills.sh/api/download/owner/repo/skill-name
# → {"error":"not_found"} means not indexed yet
```

Fix: file indexing request issue (see above). No public API to trigger indexing yourself.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Assuming CLI success = website indexed | They are independent — file issue after CLI works |
| Wrong skill path (e.g. `.claude/skills/`) | Use `skills/` prefix for broadest indexer support |
| Missing `name` or `description` in frontmatter | Both required — indexer silently skips malformed files |
| Filing issue before CLI works | Verify `npx skills add` first |
