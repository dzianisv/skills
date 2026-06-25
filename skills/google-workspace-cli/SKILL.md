---
name: google-workspace-cli
description: Use the preinstalled gws CLI for Google Drive, Gmail, and Calendar workflows, including customer-assisted OAuth login and multi-account control.
---

# Google Workspace CLI

## Runtime Assumption
- `gws` is preinstalled in the runtime.
- Verify availability with `gws --help`.
- If it is unexpectedly missing, install:
  - `npm install -g @googleworkspace/cli`

## Auth Setup (Customer-Assisted)

### One-time permanent setup (do this once per machine)
Run auth with file-based keyring so the encryption key is stored on disk — no OS keyring dependency, token auto-refreshes indefinitely via refresh_token:

```bash
GOOGLE_WORKSPACE_CLI_KEYRING_BACKEND=file gws auth login -s sheets
```

After success, persist the env var so every future `gws` call uses it automatically:
```bash
echo 'export GOOGLE_WORKSPACE_CLI_KEYRING_BACKEND=file' >> ~/.zshrc
```

**Never run `gws auth logout`** unless you intend to re-authenticate — it deletes the credentials and refresh token.

### Keeping the process alive during OAuth
**Critical:** `gws auth login` must stay running to receive the OAuth callback on localhost. If the process dies before the user clicks the URL, the token is never saved.

**Wrong** — process dies immediately, token lost:
```bash
gws auth login -s sheets &   # background dies before callback
```

**Correct** — use async shell mode that stays alive:
```bash
# Start as async shell, read URL from output, keep alive until user authenticates
gws auth login -s sheets
# (runs in foreground; user authenticates; token saved automatically)
```

When orchestrating via agent tools, use `mode="async"` with a shellId and `read_bash` to retrieve the URL. **Do not** use shell `&` backgrounding — that kills the process.

### Steps
1. Check if already authenticated: `GOOGLE_WORKSPACE_CLI_KEYRING_BACKEND=file gws auth status`
2. If `"token_valid": true` — skip auth, proceed directly.
3. If not valid, start login (keeping process alive): `GOOGLE_WORKSPACE_CLI_KEYRING_BACKEND=file gws auth login -s <services>`
4. Send the printed URL to the user and wait for completion notification.
5. Verify: `GOOGLE_WORKSPACE_CLI_KEYRING_BACKEND=file gws auth status | grep token_valid`

## Multi-Account Control
- Use a dedicated config directory per account via `GOOGLE_WORKSPACE_CLI_CONFIG_DIR`.
- If the active profile (`~/.config/gws`) already has OAuth app credentials, bootstrap a new profile by copying only `client_secret.json`:
  - `mkdir -p ~/.config/gws.<profilename>`
  - `cp ~/.config/gws/client_secret.json ~/.config/gws.<profilename>/client_secret.json`
  - `chmod 600 ~/.config/gws.<profilename>/client_secret.json`
- Do not copy `credentials.enc` or `token_cache.json` when creating a separate account profile.
- Example:
  - Work account login:
    - `GOOGLE_WORKSPACE_CLI_CONFIG_DIR=~/.config/gws-work gws auth login -s drive,gmail,calendar`
  - Personal account login:
    - `GOOGLE_WORKSPACE_CLI_CONFIG_DIR=~/.config/gws-personal gws auth login -s drive,gmail,calendar`
- Run all commands with the same account-specific config dir:
  - `GOOGLE_WORKSPACE_CLI_CONFIG_DIR=~/.config/gws-work gws gmail messages list --query "is:unread" --limit 5`
  - `GOOGLE_WORKSPACE_CLI_CONFIG_DIR=~/.config/gws-personal gws calendar events list --time-min now --limit 10`

## Important Notes
- **Always use `GOOGLE_WORKSPACE_CLI_KEYRING_BACKEND=file`** (or set in `~/.zshrc`) — OS keyring causes token loss across sessions.
- Always send the printed login URL to the customer immediately; it can expire.
- Each `gws auth login` picks a random localhost port — URLs from dead processes are invalid, generate a fresh one.
- If auth stalls, stop the process and rerun `gws auth login`.
- **Scope mismatch**: 403 "insufficient authentication scopes" means re-auth with missing scope. Check with `gws auth status` first.
- Required scope per service: `sheets` → `spreadsheets`, `drive`, `gmail`, `calendar`.
- **Never** use shell `&` to background `gws auth login` — the process must stay alive to receive the OAuth callback.
- Use per-account status checks:
  - `GOOGLE_WORKSPACE_CLI_CONFIG_DIR=~/.config/gws-work gws auth status`
- Logout per account context (use sparingly — deletes refresh token):
  - `GOOGLE_WORKSPACE_CLI_CONFIG_DIR=~/.config/gws-work gws auth logout`

## Common Commands
- Drive files: `gws drive files list --query "name contains 'spec'" --limit 10`.
- Unread Gmail: `gws gmail messages list --query "is:unread" --limit 5`.
- Upcoming Calendar events: `gws calendar events list --time-min now --limit 10`.
