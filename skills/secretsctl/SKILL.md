---
name: secretsctl
description: Fetch one Bitwarden Secrets Manager secret on demand for an agent, scoped to its own project, and copy password-manager items into SM projects. Use when an agent needs an API key, token, DSN or password at runtime, when asked "how do agents get secrets", "give the agent the API key", "share a token with <agent>", "add this secret to secrets manager", or "check what an agent can read". Not for human logins, 2FA codes, or vault tidying.
---

# secretsctl

One agent, one project, one token. `secretsctl get KEY` prints the value of a single secret from the agent's own Bitwarden Secrets Manager project. `bws` does the decryption; this adds name lookup, a project allowlist, a short cache, and an audit line.

<when_to_use>
- An agent needs a credential mid-task and it must not be preloaded into the environment.
- Checking whether an agent can read a key before starting a long job.
- Copying items from the password-manager vault into an SM project.
- Minting guidance and rotation for machine-account tokens.
</when_to_use>

<install>
The repo copy is `~/workspace/skills/skills/secretsctl`; the installed copy is `~/.agents/skills/secretsctl`. Nothing to build, but `bws` must be on PATH:

```bash
curl -sL https://github.com/bitwarden/sdk-sm/releases/download/bws-v2.1.0/bws-aarch64-apple-darwin-2.1.0.zip \
  -o /tmp/bws.zip && unzip -o -q /tmp/bws.zip -d ~/bin && chmod +x ~/bin/bws
bws --version    # bws 2.1.0
```

Add to the repo's `package.json` (works without `pnpm install`, because it uses `npx -y tsx`):

```json
"secrets": "npx -y tsx $HOME/.agents/skills/secretsctl/scripts/secretsctl.ts",
"secrets:import": "npx -y tsx $HOME/.agents/skills/secretsctl/scripts/secretsctl-import.ts --manifest scripts/secretsctl-projects.json"
```

Or put it on PATH once:

```bash
chmod +x ~/.agents/skills/secretsctl/scripts/secretsctl.ts
ln -sfn ~/.agents/skills/secretsctl/scripts/secretsctl.ts ~/bin/secretsctl
printf '\nexport PATH="$HOME/bin:$PATH"\n' >> ~/.zshrc
```

Symlink the installed copy, not the repo clone. A fresh box has no `~/workspace/skills`. Non-interactive agent shells do not read `.zshrc`. If `command -v secretsctl` fails, call the script by full path.
</install>

<token_source>
The agent needs exactly one credential of its own: a machine-account token. The tool looks for it in this order.

1. `BWS_ACCESS_TOKEN` already exported.
2. `--env-file <path>`.
3. `./.env` in the working directory.
4. `~/.env.d/agent-<SECRETSCTL_AGENT_ID>.env`.

Either export it or put it in `.env`. Both are accepted, so a repo-level `.env` and an operator shell export both work.

```bash
BWS_ACCESS_TOKEN=0.xxxxx
SECRETSCTL_PROJECT=<project-uuid>
SECRETSCTL_ALLOW_PROJECTS=<project-uuid>
SECRETSCTL_AGENT_ID=<agent-name>
SECRETSCTL_TTL=300          # optional, seconds, 0 disables the cache
```

`export KEY=value` lines are parsed. The legacy `SECRETSMCTL_*` and `AGENTSEC_*` names are still read, so an env file that predates the rename keeps working.
</token_source>

<commands>
```bash
secretsctl get SOME_API_KEY             # value to stdout, audit line to stderr
secretsctl check SOME_API_KEY           # exit 0 present, 1 absent, prints nothing
secretsctl list --keys                  # names only
secretsctl run -- ./job.sh              # whole project injected as env
secretsctl doctor                       # token, project, allowlist, visible count
```

`pnpm -s secrets ...` and `pnpm -s secrets:import` are the same thing when the repo defines those scripts. `run` joins its arguments into one command string, because `bws run` executes a shell command, not argv.
</commands>

<import_from_vault>
Secrets Manager cannot see password-manager items, so machine secrets must be copied once. Each repo keeps its own manifest at `scripts/secretsctl-projects.json`:

```json
{
  "projects": {
    "<project-name>": {
      "envVar": "BWS_PROJECT_ID_<PROJECT>",
      "secrets": [{ "key": "SOME_API_KEY", "item": "<vault item name>", "field": "optional" }]
    }
  }
}
```

```bash
source ~/.env.d/bitwarden.env          # BW_SESSION
pnpm -s secrets:import                 # dry run, names and shapes only
pnpm -s secrets:import --apply         # needs BWS_ACCESS_TOKEN with write access
```

A repo that still has `scripts/secretsmctl-projects.json` needs no change: the script falls back to that name when the new one is absent.

`bws secret create` takes the value as an argv element, so the value is briefly visible to `ps`. Run the import on a trusted machine, never on a shared host. A source item whose value spans several lines (a PEM key, a multi-line note) must name its `field`; without one the script refuses it as `NEEDS_HUMAN` rather than importing half a key.
</import_from_vault>

<rules>
- Never paste a secret value into a prompt, a commit, a log line or a chat. Read it at the point of use.
- Prefer `check` before a long job, and `run` when a command needs several credentials. `get` puts the value in the agent's context.
- One machine account per agent, permission "Can read", token expiry set at mint time. Permissions are immutable after creation, so create a new account rather than widening one.
- The allowlist is a guardrail, not enforcement. A prompt-injected agent can still call `bws` with the token in its env. Real isolation is the machine-account scope plus a separate OS user per agent.
- Free tier: 3 projects, 3 machine accounts. Past that, Bitwarden Teams ($6/user) or Doppler (50 scoped tokens free). Check `bws project list` before planning a per-repo project.
- Developer-side flow: create the project, assign it to the machine account, then Create access token with an expiry. The token is shown once. Write it straight into the agent env file.
- `~/.env.d` is a flat filename namespace and SM is a flat key namespace. Two files that define the same variable name collide, so import a colliding key under a qualified name instead of letting the last write win.
</rules>

<failures>
| Output | Cause | Fix |
|---|---|---|
| `bws is not installed` | binary missing from PATH | install from `bitwarden/sdk-sm` releases |
| `BWS_ACCESS_TOKEN is not set` | no export and no `.env` | export it or add it to `.env` |
| `project X is not in the allowlist` | wrong project or agent pivoting | fix the agent env file |
| `bws secret failed ... 401` | token revoked or expired | mint a new token for that machine account |
| `secret KEY not found` | not imported, or wrong project | `secretsctl list --keys`, then import |
| stale values | cache TTL | `get KEY --ttl 0` |
</failures>

<done_when>
`pnpm -s secrets doctor` reports the token set, the expected project and a non-zero visible count, and `pnpm -s secrets check <KEY>` exits 0. A job that needs the credential runs without the value appearing in the agent transcript.
</done_when>
