---
name: bitwarden-cli
description: Use when storing, retrieving, listing, or organizing secrets in Bitwarden using the bw CLI. Triggers on: "store a secret", "get the password for", "save credentials", "list vault items", "create a folder in Bitwarden", "read from Bitwarden", "load API key from vault".
---

# bitwarden-cli

Non-interactive vault access via official `bw` CLI. All ops need an unlocked `BW_SESSION`.

## Install (`bw` not found)

**Do NOT use npm** — `@bitwarden/cli` npm package was backdoored April 2026 (TeamPCP supply chain attack). Use the official GitHub binary:

```bash
VERSION="2026.4.2"  # check https://github.com/bitwarden/clients/releases for latest
curl -Lo /tmp/bw.zip "https://github.com/bitwarden/clients/releases/download/cli-v${VERSION}/bw-linux-${VERSION}.zip"
unzip /tmp/bw.zip -d /tmp/bw-bin && sudo mv /tmp/bw-bin/bw /usr/local/bin/bw && chmod +x /usr/local/bin/bw
bw --version
```

## Sign up (one-time, browser)

No account yet → use `chrome-devtools` or any browser:

1. Navigate `https://vault.bitwarden.com/#/signup`, enter email, submit
2. Click "Verify Your Email" link in inbox
3. Set strong master password (22+ chars)
4. Save master password → `~/.bitwarden_master_password` (chmod 600)
5. **Settings → Security → Keys → View API key**
6. Confirm master password when prompted
7. Save `client_id` + `client_secret` → `~/.bitwarden_credentials` (chmod 600):
   ```
   BW_CLIENTID="user.xxxxxxxx-..."
   BW_CLIENTSECRET="..."
   BW_PASSWORD="your-master-password"
   ```

### chrome-devtools signup + API key

```bash
REMOTE="https://your-host/mcp"
# Navigate to signup
node chrome-devtools.js navigate_page --url "https://vault.bitwarden.com/#/signup" --remote "$REMOTE"
# ... fill form, verify email ...
# After login, navigate to Keys settings
node chrome-devtools.js navigate_page --url "https://vault.bitwarden.com/#/settings/security/session-timeout" --remote "$REMOTE"
# Click "Keys" tab (url: #/settings/security/security-keys)
node chrome-devtools.js click <keys-uid> --remote "$REMOTE"
# Click "View API key", fill master password, read client_id + client_secret from snapshot
```

Security → Keys page = `#/settings/security/security-keys` (not `/keys`).

## Session setup (once per shell)

Unlock vault before any operation.

**API key login (non-interactive — preferred):**
```bash
# Requires: BW_CLIENTID, BW_CLIENTSECRET, BW_PASSWORD set in environment
source ~/.bitwarden_credentials   # or export vars manually
bw login --apikey
export BW_SESSION=$(bw unlock --passwordenv BW_PASSWORD --raw)
bw sync --session "$BW_SESSION"
```

**Already logged in:**
```bash
export BW_SESSION=$(bw unlock --passwordenv BW_PASSWORD --raw)
bw sync --session "$BW_SESSION"
```

Always `bw sync` after unlock to pull latest state.

## List secrets

```bash
# All items (id, name, type)
bw list items --session "$BW_SESSION" | jq '[.[] | {id, name, type}]'

# Search by name
bw list items --search "github" --session "$BW_SESSION" | jq '[.[] | {id, name}]'

# List folders
bw list folders --session "$BW_SESSION" | jq '[.[] | {id, name}]'
```

Types: `1`=Login, `2`=SecureNote, `3`=Card, `4`=Identity

## Retrieve a secret

```bash
# Just the password
bw get password "github.com" --session "$BW_SESSION"

# Just the username
bw get username "github.com" --session "$BW_SESSION"

# Notes field (good for API keys, tokens stored as secure notes)
bw get notes "MY_API_KEY" --session "$BW_SESSION"

# Full item as JSON
bw get item "github.com" --session "$BW_SESSION" | jq .
```

`bw get` takes item name or UUID. Name match = case-insensitive substring.

## Store a secret

**Secure note** (API keys, tokens, arbitrary strings):
```bash
bw get template item.secureNote \
  | jq --arg n "OPENAI_API_KEY" --arg v "sk-proj-..." '.name=$n | .notes=$v' \
  | bw encode | bw create item --session "$BW_SESSION" | jq '{id, name}'
```

**Login item** (username + password):
```bash
bw get template item.login \
  | jq --arg n "GitHub" --arg u "user@example.com" --arg p "hunter2" \
    '.name=$n | .login.username=$u | .login.password=$p' \
  | bw encode | bw create item --session "$BW_SESSION" | jq '{id, name}'
```

**Specific folder** — get folder ID first, add `--folderid`:
```bash
FOLDER_ID=$(bw list folders --session "$BW_SESSION" | jq -r '.[] | select(.name=="MyProject") | .id')
bw get template item.secureNote \
  | jq --arg n "DB_PASSWORD" --arg v "s3cr3t" --arg f "$FOLDER_ID" \
    '.name=$n | .notes=$v | .folderId=$f' \
  | bw encode | bw create item --session "$BW_SESSION"
```

## Create a folder

```bash
FOLDER_ID=$(echo '{"name":"MyProject"}' \
  | bw encode | bw create folder --session "$BW_SESSION" | jq -r '.id')
echo "Folder ID: $FOLDER_ID"
```

## Update an item

```bash
ITEM=$(bw get item "github.com" --session "$BW_SESSION")
ITEM_ID=$(echo "$ITEM" | jq -r '.id')
echo "$ITEM" | jq '.login.password = "new-password"' \
  | bw encode | bw edit item "$ITEM_ID" --session "$BW_SESSION"
```

## Lock / logout

```bash
bw lock          # invalidates BW_SESSION, vault stays logged in
bw logout        # full logout
```

## Common mistakes

| Mistake | Fix |
|---------|-----|
| `Session key is invalid` | Re-run `export BW_SESSION=$(bw unlock ...)` |
| `Not logged in` | Run `bw login --apikey` first |
| Stale data | `bw sync --session "$BW_SESSION"` before reads |
| `bw get` returns wrong item | Use UUID from `bw list items` instead of name |
| Passing session in plain text to scripts | Use `--session "$BW_SESSION"` not `--session abc123` hardcoded |
| Installing via npm | Use GitHub binary — npm package was compromised April 2026 |
