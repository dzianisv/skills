---
name: git-worktree
description: 'Create a git worktree for isolated branch work by symlinking node_modules and .env files from the main repo — no reinstall. Use when asked to "create a worktree", "add worktree", "work on a branch without reinstalling", "set up worktree for branch". Never run npm/yarn/pnpm install inside the worktree unless package.json changed on the branch.'
---

# git-worktree

Create worktrees that reuse the main repo's installed packages via symlinks. Reinstalling is never needed unless the branch changes `package.json`.

## Steps

Run from inside the main repo directory. The main repo's directory name is resolved dynamically — no hardcoded repo name:

```bash
BRANCH=$1
MAIN="$(basename "$(git rev-parse --show-toplevel)")"   # the main repo's dir name
git fetch origin
# Resolve the remote's default branch (main, master, …) — don't hardcode "main".
BASE="$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null)"
[ -n "$BASE" ] || { git rev-parse --verify --quiet origin/main >/dev/null \
  && BASE=origin/main || BASE=origin/master; }
# Create the worktree directly ON the branch — never check out afterwards (that
# would detach HEAD and abandon $BRANCH).
if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  git worktree add "../$BRANCH" "$BRANCH"                 # existing local branch
else
  git worktree add -b "$BRANCH" "../$BRANCH" "$BASE"      # new branch off the default
fi
cd "../$BRANCH"
ln -snf "../$MAIN/node_modules" .
ln -snf "../$MAIN/.env" .
[ -f "../$MAIN/.env.prod" ] && ln -snf "../$MAIN/.env.prod" .   # only if it exists
```

The worktree is now checked out on `$BRANCH` (a new branch off the remote's default branch, or the existing one). The symlinks are relative to the worktree dir, so `../$MAIN/` resolves to the sibling main-repo checkout the worktree was created next to.

## Rules

- **Never run `npm install` / `yarn` / `pnpm install`** inside the worktree unless `package.json` differs from main.
- Only symlink files that exist in main — the `[ -f ... ]` guard skips a missing `.env.prod`.
- Remove when done: `git worktree remove "../<branch>"`.

## Verify

```bash
MAIN="$(basename "$(git rev-parse --show-toplevel)")"
ls -la node_modules .env
# node_modules -> ../<MAIN>/node_modules
# .env -> ../<MAIN>/.env
```
