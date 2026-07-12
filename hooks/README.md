# hooks/

Git hooks live under `.git/hooks/`, which git does **not** version-control, so
every clone needs to install them once.

## update-readme.ts

Regenerates the "Skills in this repo" table in `README.md` from
`skills/<name>/SKILL.md` frontmatter (`name` + `description`, or an optional
`summary` override), grouped and ordered per `skills.sh.json`. Nobody should
hand-write an install command like `npx -y skills add dzianisv/skills -s
chrome-use -g` — this script derives every row automatically.

- Zero npm dependencies. Parses YAML frontmatter with a small hand-rolled
  parser (`node:fs` / `node:path` / `process` only) — no `yaml` package.
- Runs under **both** Bun and Node 22+ (Node's native TypeScript
  type-stripping). Written as CommonJS (`require`, `__dirname`) so module-type
  detection can't make the two runtimes disagree about how to load it.
- Idempotent: running it twice back-to-back produces zero diff. It only
  writes `README.md` when the generated content actually changed.
- Marker-based: content between `<!-- SKILLS:START ... -->` and
  `<!-- SKILLS:END -->` in `README.md` is fully owned by this script — don't
  hand-edit inside those markers, edit the source `SKILL.md` files (or their
  `summary:` frontmatter) instead.

Run it manually any time:

```bash
bun hooks/update-readme.ts
# or
node hooks/update-readme.ts
```

## Installing the pre-commit hook

The repo's `pre-commit` hook runs `update-readme.ts` and re-stages
`README.md` before every commit, so the install table can never go stale.
Since `.git/hooks/` isn't tracked, wire it up once per clone:

```bash
cat > .git/hooks/pre-commit <<'EOF'
#!/bin/sh
bun "$(git rev-parse --show-toplevel)/hooks/update-readme.ts"
git add README.md
EOF
chmod +x .git/hooks/pre-commit
```

If you don't have `bun` installed, use `node` instead (Node 22+ required —
runs `.ts` natively):

```bash
cat > .git/hooks/pre-commit <<'EOF'
#!/bin/sh
node "$(git rev-parse --show-toplevel)/hooks/update-readme.ts"
git add README.md
EOF
chmod +x .git/hooks/pre-commit
```

### Alternative: `core.hooksPath`

If you manage hooks across multiple repos, you may prefer pointing git at a
tracked hooks directory instead of copying files into `.git/hooks/`:

```bash
git config core.hooksPath hooks
```

This repo does **not** set that for you — it's a per-developer choice, and
`hooks/` here only contains `update-readme.ts` (no executable `pre-commit`
script), so enabling it as-is would skip the README regeneration. Stick with
the `.git/hooks/pre-commit` copy above unless you also add an executable
`hooks/pre-commit` script.
