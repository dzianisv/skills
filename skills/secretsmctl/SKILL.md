---
name: secretsmctl
description: Fetch one Bitwarden Secrets Manager secret on demand for an agent, scoped to its own project, and copy password-manager items into SM projects. Use when an agent needs an API key, token, DSN or password at runtime, when asked "how do agents get secrets", "give the agent the API key", "share a token with <agent>", "add this secret to secrets manager", or "check what an agent can read". Not for human logins, 2FA codes, or vault tidying.
---

# secretsmctl

One agent, one project, one token. `secretsmctl get KEY` prints the value of a single secret from the agent's own Bitwarden Secrets Manager project. `bws` does the decryption; this adds name lookup, a project allowlist, a short cache, and an audit line.

<when_to_use>
- An agent needs a credential mid-task and it must not be preloaded into the environment.
- Checking whether an agent can read a key before starting a long job.
- Copying items from the password-manager vault into an SM project.
- Minting guidance and rotation for machine-account tokens.
</when_to_use>

<install>
The tool lives in `~/workspace/skills/skills/secretsmctl`. Nothing to build, but `bws` must be on PATH:

```bash
curl -sL https://github.com/bitwarden/sdk-sm/releases/download/bws-v2.1.0/bws-aarch64-apple-darwin-2.1.0.zip \
  -o /tmp/bws.zip && unzip -o -q /tmp/bws.zip -d ~/bin && chmod +x ~/bin/bws
bws --version    # bws 2.1.0
```

Add to the repo's `package.json` (works without `pnpm install`, because it uses `npx -y tsx`):

```json
"secrets": "npx -y tsx $HOME/workspace/skills/skills/secretsmctl/scripts/secretsmctl.ts",
"secrets:import": "npx -y tsx $HOME/workspace/skills/skills/secretsmctl/scripts/secretsmctl-import.ts --manifest scripts/secretsmctl-projects.json"
```

Or put it on PATH once:

```bash
chmod +x ~/workspace/skills/skills/secretsmctl/scripts/secretsmctl.ts
ln -sfn ~/workspace/skills/skills/secretsmctl/scripts/secretsmctl.ts ~/bin/secretsmctl
printf '\nexport PATH="$HOME/bin:$PATH"\n' >> ~/.zshrc
```

Non-interactive agent shells do not read `.zshrc`. If `command -v secretsmctl` fails, call the script by full path.
</install>

<token_source>
The agent needs exactly one credential of its own: a machine-account token. The tool looks for it in this order.

1. `BWS_ACCESS_TOKEN` already exported.
2. `--env-file <path>`.
3. `./.env` in the working directory.
4. `~/.env.d/agent-<SECRETSMCTL_AGENT_ID>.env`.

Either export it or put it in `.env`. Both are accepted, so a repo-level `.env` and an operator shell export both work.

```bash
BWS_ACCESS_TOKEN=0.xxxxx
SECRETSMCTL_PROJECT=<project-uuid>
SECRETSMCTL_ALLOW_PROJECTS=<project-uuid>
SECRETSMCTL_AGENT_ID=<agent-name>
SECRETSMCTL_TTL=300          # optional, seconds, 0 disables the cache
```
</token_source>

<commands>
```bash
secretsmctl get SOME_API_KEY             # value to stdout, audit line to stderr
secretsmctl check SOME_API_KEY           # exit 0 present, 1 absent, prints nothing
secretsmctl list --keys                  # names only
secretsmctl run -- ./job.sh              # whole project injected as env
secretsmctl doctor                       # token, project, allowlist, visible count
```

`pnpm -s secrets ...` and `pnpm -s secrets:import` are the same thing when the repo defines those scripts. `run` joins its arguments into one command string, because `bws run` executes a shell command, not argv.
</commands>

<import_from_vault>
Secrets Manager cannot see password-manager items, so machine secrets must be copied once. Each repo keeps its own manifest at `scripts/secretsmctl-projects.json`:

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

`bws secret create` takes the value as an argv element, so the value is briefly visible to `ps`. Run the import on a trusted machine, never on a shared host.
</import_from_vault>

<rules>
- Never paste a secret value into a prompt, a commit, a log line or a chat. Read it at the point of use.
- Prefer `check` before a long job, and `run` when a command needs several credentials. `get` puts the value in the agent's context.
- One machine account per agent, permission "Can read", token expiry set at mint time. Permissions are immutable after creation, so create a new account rather than widening one.
- The allowlist is a guardrail, not enforcement. A prompt-injected agent can still call `bws` with the token in its env. Real isolation is the machine-account scope plus a separate OS user per agent.
- Free tier: 3 projects, 3 machine accounts. Past that, Bitwarden Teams ($6/user) or Doppler (50 scoped tokens free).
- Developer-side flow: create the project, assign it to the machine account, then Create access token with an expiry. The token is shown once. Write it straight into the agent env file.
</rules>

<failures>
| Output | Cause | Fix |
|---|---|---|
| `bws is not installed` | binary missing from PATH | install from `bitwarden/sdk-sm` releases |
| `BWS_ACCESS_TOKEN is not set` | no export and no `.env` | export it or add it to `.env` |
| `project X is not in the allowlist` | wrong project or agent pivoting | fix the agent env file |
| `bws secret failed ... 401` | token revoked or expired | mint a new token for that machine account |
| `secret KEY not found` | not imported, or wrong project | `secrets list --keys`, then import |
| stale values | cache TTL | `get KEY --ttl 0` |
</failures>

<done_when>
`pnpm -s secrets doctor` reports the token set, the expected project and a non-zero visible count, and `pnpm -s secrets check <KEY>` exits 0. A job that needs the credential runs without the value appearing in the agent transcript.
</done_when>
