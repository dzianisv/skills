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
npx -y skills add dzianisv/skills
```

Or install a single skill by name:

```bash
npx -y skills add dzianisv/skills <skill-name>
# example:
npx -y skills add dzianisv/skills my-browser
```

After install, the agent autoloads a skill when its description/triggers match
your request, or you can invoke it explicitly (e.g. `/my-browser`, `/own`).

## Skills in this repo

| Skill | What it does | Install |
|-------|--------------|---------|
| [`my-browser`](skills/my-browser) | Control your real running Chrome (live sessions, cookies, auth) via a persistent Puppeteer gateway using autoConnect mode. No `--remote-debugging-port` needed. | `npx -y skills add dzianisv/skills my-browser` |
| [`chrome-use`](skills/chrome-use) | Drive your real running Chrome with [agent-browser](https://skills.volces.com/skills/vercel-labs/agent-browser)-style commands (`open`, `snapshot -i`, `click @e1`, `fill`, `screenshot`). Zero-dependency TypeScript speaking CDP directly over the built-in WebSocket; connects via autoConnect like `my-browser`. | `npx -y skills add dzianisv/skills chrome-use` |
| [`own`](skills/own) | Take full ownership of a task end-to-end: issue → design → plan → implement → review → real-feature test → PR → CI → final review → merge ask. Forbids back-delegation to the user when a tool or credential store can resolve the blocker. | `npx -y skills add dzianisv/skills own` |
| [`duckdns-domain`](skills/duckdns-domain) | Register a free DuckDNS subdomain and point it at a server IP via Chrome DevTools browser automation. Useful when you need a public DNS name for a dev server and no managed DNS is available. | `npx -y skills add dzianisv/skills duckdns-domain` |
| [`readiness-check`](skills/readiness-check) | Verify all OpenCode plugin services (Whisper, TTS, Supabase, Telegram, etc.) are healthy and ready. | `npx -y skills add dzianisv/skills readiness-check` |
| [`vercel-lfs`](skills/vercel-lfs) | Deploy a site with Git LFS assets (videos, images) to Vercel without serving 15-byte pointer files. Covers the prebuilt-deploy workflow and required GitHub secrets. | `npx -y skills add dzianisv/skills vercel-lfs` |
| [`skills-sh`](skills/skills-sh) | Publish, register, and troubleshoot skills on [skills.sh](https://www.skills.sh), the public agent-skills directory. | `npx -y skills add dzianisv/skills skills-sh` |
| [`opencode-api`](skills/opencode-api) | Control OpenCode through the REST API exposed by `opencode serve`. Sessions, prompts, SSE events, permissions, and automation. | `npx -y skills add dzianisv/skills opencode-api` |
| [`google-workspace-cli`](skills/google-workspace-cli) | Interact with all Google Workspace APIs (Drive, Gmail, Calendar, Sheets, Docs, Chat, etc.) via the `gws` CLI. | `npx -y skills add dzianisv/skills google-workspace-cli` |

## Install

Pick whichever location your runtime expects:

```bash
# Claude Code (global skills)
git clone https://github.com/dzianisv/skills.git /tmp/skills
cp -r /tmp/skills/skills/* ~/.claude/skills/

# OpenCode
cp -r /tmp/skills/skills/* ~/.config/opencode/skills/

# Codex / generic
cp -r /tmp/skills/skills/* ~/.agents/skills/
```

Or symlink individual skills:

```bash
ln -s "$(pwd)/skills/own" ~/.claude/skills/own
```

After install, the agent will autoload a skill when its `description`/triggers
match the user's request, or you can invoke it explicitly (`/own`, `/duckdns`,
etc., depending on your runtime's slash-command conventions).

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
