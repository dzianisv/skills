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

<!-- skills-table-start -->
| Skill | Description | Install |
|-------|-------------|---------|
| agent-memory | Use when starting any task (retrieve relevant context) or finishing any task (persist discoveries). Also use when asked to remember, forget, or loo... | `npx -y skills add dzianisv/skills -s agent-memory -g` |
| bitwarden-cli | Use when storing, retrieving, listing, or organizing secrets in Bitwarden using the bw CLI. Triggers on: "store a secret", "get the password for", ... | `npx -y skills add dzianisv/skills -s bitwarden-cli -g` |
| chrome-devtools-remote | Drive a remote chrome-devtools-mcp server (typically on a tailnet) over HTTPS using the chrome-devtools CLI. Use this when the user wants to naviga... | `npx -y skills add dzianisv/skills -s chrome-devtools-remote -g` |
| chrome-use | Use when the user wants to drive their real running Chrome with agent-browser-style commands — open pages, snapshot interactive elements as @e1 ref... | `npx -y skills add dzianisv/skills -s chrome-use -g` |
| claude-max | Configure and activate the Claude Max subscription proxy so the agent runs on Claude Opus 4 at flat-rate cost instead of per-token Azure billing. U... | `npx -y skills add dzianisv/skills -s claude-max -g` |
| claude-sessions | Find a past Claude Code session on this machine by project or topic, then summarize what was done in it. Use when the user asks "which session did ... | `npx -y skills add dzianisv/skills -s claude-sessions -g` |
| duckdns-domain | Register a free DuckDNS subdomain (*.duckdns.org) and point it at a server IP using the Chrome DevTools browser automation. Use when you need a pub... | `npx -y skills add dzianisv/skills -s duckdns-domain -g` |
| git-worktree | Create a git worktree for isolated branch work by symlinking node_modules and .env files from the main repo — no reinstall. Use when asked to "crea... | `npx -y skills add dzianisv/skills -s git-worktree -g` |
| google-workspace-cli | Use the preinstalled gws CLI for Google Drive, Gmail, and Calendar workflows, including customer-assisted OAuth login and multi-account control. | `npx -y skills add dzianisv/skills -s google-workspace-cli -g` |
| hyperagent-eval-skill | Measure and improve an existing SKILL.md by running it through a subagent eval loop — actor subagents execute the skill on frozen cases, a judge su... | `npx -y skills add dzianisv/skills -s hyperagent-eval-skill -g` |
| macro-panel | Convene the macro-economist panel — run a market, asset, or portfolio question through multiple thinker-lenses at once and surface their AGREEMENT ... | `npx -y skills add dzianisv/skills -s macro-panel -g` |
| mermaid2excalidraw | Convert Mermaid diagrams (sequenceDiagram, flowchart, graph) into native Excalidraw elements (rectangles, arrows, text) and merge them into an exis... | `npx -y skills add dzianisv/skills -s mermaid2excalidraw -g` |
| no-github-backlog | Drain a GitHub issue backlog autonomously. Spawns isolated subagents per issue across 7 stages (investigate, implement, review, security-review, qa... | `npx -y skills add dzianisv/skills -s no-github-backlog -g` |
| no-pr-backlog | Drain a GitHub pull-request backlog autonomously. Fetches all open PRs, spawns isolated subagents per PR across 5 stages (review, fix, reflect, mer... | `npx -y skills add dzianisv/skills -s no-pr-backlog -g` |
| opencode-api | Control OpenCode through the REST API exposed by opencode serve. Use when starting a server, listing sessions, sending prompts, streaming events, h... | `npx -y skills add dzianisv/skills -s opencode-api -g` |
| retrospective | Produce a short 3-5 sentence post-mortem when an AI agent's output was wrong or based on faulty verification. Plain English, technical, no headers.... | `npx -y skills add dzianisv/skills -s retrospective -g` |
| solo-founder | Operate as an autonomous solo founder / CEO meta-agent driving a whole project — decide what to work on, spawn doer subagents across directions, ev... | `npx -y skills add dzianisv/skills -s solo-founder -g` |
| solo-founder-meta-agent | Evaluate and improve the `solo-founder` skill from its REAL recent runs. Load this when you want to score how solo-founder performed across recent ... | `npx -y skills add dzianisv/skills -s solo-founder-meta-agent -g` |
| spaceship-dns | Manage DNS records for domains registered at Spaceship (spaceship.com). Add/edit/delete A, CNAME, TXT, MX records via the Spaceship Advanced DNS we... | `npx -y skills add dzianisv/skills -s spaceship-dns -g` |
| take-ownership | Take full ownership of a task end-to-end. Use when the user invokes `/take-ownership`, or says "take ownership", "own this", "drive this to merge",... | `npx -y skills add dzianisv/skills -s take-ownership -g` |
| take-ownership-meta-agent | Evaluate and improve the `take-ownership` skill from its REAL recent runs. Load this when you want to score how take-ownership performed across rec... | `npx -y skills add dzianisv/skills -s take-ownership-meta-agent -g` |
| telegram-cli | Send and read Telegram messages and media from a personal Telegram user account using the bundled `telegram-cli.py` Telethon helper. Use for DM-ing... | `npx -y skills add dzianisv/skills -s telegram-cli -g` |
| vercel-lfs | Deploy a site with Git LFS assets (videos, images) to Vercel without serving 15-byte pointer files. Use when "videos not loading on Vercel", "LFS f... | `npx -y skills add dzianisv/skills -s vercel-lfs -g` |
| write-agents-md | Write, compact, or deduplicate an AGENTS.md / CLAUDE.md project instruction file. Use when creating agent instructions from scratch, or when asked ... | `npx -y skills add dzianisv/skills -s write-agents-md -g` |
| write-skill | Write or improve any AI agent instruction surface — SKILL.md, AGENTS.md, CLAUDE.md, GOAL.md, dynamic workflow scripts, or any agent documentation. ... | `npx -y skills add dzianisv/skills -s write-skill -g` |
<!-- skills-table-end -->

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
