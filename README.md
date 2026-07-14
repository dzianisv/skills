# skills

Reusable agent skills for [Claude Code](https://claude.com/claude-code),
[OpenCode](https://opencode.ai), [Codex](https://github.com/openai/codex), and
any other Anthropic/OpenAI-compatible agent runtime that consumes the
[Agent Skill](https://agentskills.io/specification) spec.

Each skill is a single directory under `skills/` containing a `SKILL.md` (and
optional scripts/references). Skills are platform-agnostic — they describe a
workflow or technique with a `name` + `description` frontmatter that tells the
agent when to load it.

## Quickstart

Install all skills at once:

```bash
npx -y skills add dzianisv/skills -g
```

Or install a single skill by name:

```bash
npx -y skills add dzianisv/skills -s <skill-name> -g
# example:
npx -y skills add dzianisv/skills -s my-browser -g
```

The `-s` flag preselects the skill; without it the CLI prompts you to pick one.
`-g` installs globally for your runtime; drop it (or use `-p`) to install into the current project.

After install, the agent autoloads a skill when its description/triggers match
your request, or you can invoke it explicitly (e.g. `/my-browser`, `/own`).

## Skills in this repo

| Skill | What it does | Install |
|-------|--------------|---------|
| [`my-browser`](skills/my-browser) | Control your real running Chrome (live sessions, cookies, auth) via a persistent Puppeteer gateway using autoConnect mode. No `--remote-debugging-port` needed. | `npx -y skills add dzianisv/skills -s my-browser -g` |
| [`chrome-use`](skills/chrome-use) | Drive your real running Chrome with [agent-browser](https://skills.volces.com/skills/vercel-labs/agent-browser)-style commands (`open`, `snapshot -i`, `click @e1`, `fill`, `screenshot`). Zero-dependency TypeScript speaking CDP directly over the built-in WebSocket; connects via autoConnect like `my-browser`. | `npx -y skills add dzianisv/skills -s chrome-use -g` |
| [`own`](skills/own) | Take full ownership of a task end-to-end: issue → design → plan → implement → review → real-feature test → PR → CI → final review → merge ask. Forbids back-delegation to the user when a tool or credential store can resolve the blocker. | `npx -y skills add dzianisv/skills -s own -g` |
| [`duckdns-domain`](skills/duckdns-domain) | Register a free DuckDNS subdomain and point it at a server IP via Chrome DevTools browser automation. Useful when you need a public DNS name for a dev server and no managed DNS is available. | `npx -y skills add dzianisv/skills -s duckdns-domain -g` |
| [`readiness-check`](skills/readiness-check) | Verify all OpenCode plugin services (Whisper, TTS, Supabase, Telegram, etc.) are healthy and ready. | `npx -y skills add dzianisv/skills -s readiness-check -g` |
| [`vercel-lfs`](skills/vercel-lfs) | Deploy a site with Git LFS assets (videos, images) to Vercel without serving 15-byte pointer files. Covers the prebuilt-deploy workflow and required GitHub secrets. | `npx -y skills add dzianisv/skills -s vercel-lfs -g` |
| [`skills-sh`](skills/skills-sh) | Publish, register, and troubleshoot skills on [skills.sh](https://www.skills.sh), the public agent-skills directory. | `npx -y skills add dzianisv/skills -s skills-sh -g` |
| [`opencode-api`](skills/opencode-api) | Control OpenCode through the REST API exposed by `opencode serve`. Sessions, prompts, SSE events, permissions, and automation. | `npx -y skills add dzianisv/skills -s opencode-api -g` |
| [`prompt-hermes-ai`](skills/prompt-hermes-ai) | Configure and control Hermes Agent through chat instead of SSH: durable skills, native cron, credential recovery, fresh-session verification, and failure handling. | `npx -y skills add dzianisv/skills -s prompt-hermes-ai -g` |
| [`google-workspace-cli`](skills/google-workspace-cli) | Interact with all Google Workspace APIs (Drive, Gmail, Calendar, Sheets, Docs, Chat, etc.) via the `gws` CLI. | `npx -y skills add dzianisv/skills -s google-workspace-cli -g` |
| [`claude-sessions`](skills/claude-sessions) | Find a past Claude Code session by project or topic and summarize what was done in it — "which session did I work on X in?". Cheaply ranks local transcripts, then fans the heavy reads out to subagents so multi-MB sessions never flood your context. | `npx -y skills add dzianisv/skills -s claude-sessions -g` |
| [`solo-founder`](skills/solo-founder) | Operate as an autonomous solo-founder / CEO meta-agent: decide what matters, spawn doer subagents across product / growth / distribution, evaluate + improve them, ship and verify. Bundles a cross-session run registry (`PreToolUse` hook) + an LLM-judge evaluator so its runs can be scored later. | `npx -y skills add dzianisv/skills -s solo-founder -g` |
| [`solo-founder-meta-agent`](skills/solo-founder-meta-agent) | Evaluate and improve the `solo-founder` skill from its REAL recent runs (the `~/.local/run/solo-founder/` registry + OpenCode sessions): score each session, diagnose the dominant failure, harvest it into a frozen eval case, and run the DGM-H improve-loop so a meta agent rewrites `SKILL.md`. | `npx -y skills add dzianisv/skills -s solo-founder-meta-agent -g` |
| [`take-ownership-meta-agent`](skills/take-ownership-meta-agent) | Evaluate and improve the `take-ownership` skill from its REAL recent runs (`~/.local/run/take-ownership/` registry). Scores six dimensions (r1_defined, no_fake_done, phase_discipline, real_testing, state_persisted, blocker_resolved), diagnoses the dominant failure, harvests frozen eval cases, and runs the DGM-H improve-loop. Bundles 5 train cases, 2 holdout cases, a driver (`driver-to.py`), and a `PreToolUse` tracking hook. | `npx -y skills add dzianisv/skills -s take-ownership-meta-agent -g` |
| [`git-worktree`](skills/git-worktree) | Create a git worktree for isolated branch work by symlinking `node_modules` and `.env` files from the main repo — no reinstall. Resolves the main repo's directory name dynamically (no hardcoded path). | `npx -y skills add dzianisv/skills -s git-worktree -g` |

## How `claude-sessions` works

Claude Code stores every session as a JSONL transcript under
`~/.claude/projects/<dashified-cwd>/<sessionId>.jsonl` (the directory name is the
project's working directory with `/` and `.` replaced by `-`). These files grow
to **tens of MB**, so reading them directly blows up an agent's context.

This skill avoids that in three steps:

1. **Rank cheaply.** `scripts/rank_sessions.py` makes a single streaming pass
   over each transcript, scoring it by keyword hits in its title / last prompt /
   first message plus a whole-file hit count, and prints the top candidates as
   JSON. It handles sibling project dirs (`…-OpenClawBot`, `…-OpenClawBot-2`) and
   supports `--project`, `--days`, and `--limit`.
2. **Deep-read with subagents.** The agent dispatches one subagent per top
   candidate, in parallel — each greps within its assigned file and reads only
   the surrounding lines, then reports whether it matches and a short summary.
   The large transcripts stay out of the main context.
3. **Present the best match** with its summary, `session_id`, path, and date
   (resume it with `claude --resume <session_id>`).

Try the ranker directly:

```bash
python3 ~/.claude/skills/claude-sessions/scripts/rank_sessions.py \
  --project ~/workspace/OpenClawBot "merge gate" enforce testing
```

Or just ask your agent: *"Find the session where I worked on PR merge-gate
enforcement testing in ~/workspace/OpenClawBot and summarize it."*

## Install

Install all skills into every detected agent runtime (Claude Code, OpenCode, Codex, Cursor, Windsurf, …):

```bash
npx -y skills add dzianisv/skills -g
```

Install a single skill by name:

```bash
npx -y skills add dzianisv/skills -s <skill-name> -g
# example:
npx -y skills add dzianisv/skills -s chrome-use -g
```

`-g` installs globally. Drop it (or use `-p`) to install into the current project only.

After install the agent autoloads a skill when its description/triggers match your request,
or invoke it explicitly (e.g. `/chrome-use`, `/own`).

## Spec

These skills follow the [agentskills.io](https://agentskills.io/specification)
spec. Frontmatter:

```yaml
---
name: <kebab-case-name>
description: Use when <triggering conditions and symptoms>
---
```

## Contributing

PRs welcome. New skills should:

- Have a clear `description` field that starts with **"Use when…"** and
  describes triggering conditions, not the workflow itself.
- Be platform-neutral where possible. If a skill is tied to a specific
  runtime (Claude Code vs. OpenCode), say so in the body.
- Avoid hard-coded personal paths, account names, IPs, or secrets.

## License

MIT — see [LICENSE](LICENSE).
