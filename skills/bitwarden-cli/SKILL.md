---
name: bitwarden-cli
description: 'Use when storing, retrieving, listing, or organizing secrets in Bitwarden using the bw CLI. Triggers on: "store a secret", "get the password for", "save credentials", "list vault items", "create a folder in Bitwarden", "read from Bitwarden", "load API key from vault".'
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

## "The decryption operation failed" — diagnose before you declare the vault lost (AGE-677)

On 2026-08-18 an agent hit `bitwarden_crypto::keys::master_key: error=The decryption operation failed`,
concluded the master password no longer decrypted the vault, and filed a total-lockout incident. The
master password was fine. The agent had read the **wrong file**.

Canonical master password path on this host:

| Path | What it is |
|---|---|
| `~/.bitwarden_master_password` | **source of truth** (22 chars, `0600`) |
| `~/.secrets/bitwarden` | symlink → the above (kept because this skill documents it) |
| `~/.bitwarden_credentials` | `BW_CLIENTID` / `BW_CLIENTSECRET` / `BW_PASSWORD`; its `BW_PASSWORD` matches the file above |
| `~/.secrets/bitwarden.stale-2026-08-18` | a 14-char **non-master** value that used to sit at `~/.secrets/bitwarden` and caused the false alarm |

Before you conclude the vault is unrecoverable:

1. **Cross-check every candidate file by hash, not by guess** — never echo them:
   ```bash
   for f in ~/.bitwarden_master_password ~/.secrets/bitwarden \
            <(grep -E '^BW_PASSWORD=' ~/.bitwarden_credentials | sed 's/^BW_PASSWORD=//; s/"//g'); do
     v=$(cat "$f"); printf '%s len=%s hash=%s\n' "$f" "${#v}" "$(printf %s "$v" | sha256sum | cut -c1-12)"
   done
   ```
   Two files agreeing on a 22-char value is your master password. A lone short value is a different
   secret that was misfiled — do not treat its failure as vault loss.
2. **A wrong password is a local failure, not an account lockout.** `bw unlock` derives the key
   locally; it sends no request. Trying a *different* candidate value is not a retry of the failed
   attempt.
3. **`bw sync` succeeding proves the account is healthy.** Sync uses the stored refresh token, and a
   master-password change rotates the security stamp and kills that token. Sync OK ⇒ the password was
   not rotated behind you ⇒ the problem is on your side of the disk.

### `bw unlock` rotates the session — always write it back (AGE-677)

Every successful `bw unlock` mints a **new** session key and invalidates the previous one. Verified
2026-08-18: a session written to `~/.env.d/bitwarden.env` reported `Vault is unlocked!`, then failed
`--check` immediately after an unrelated `bw unlock` ran in another shell.

On a host where several agents share one vault, that means:

- Never call `bw unlock` "just to check". Use `bw unlock --check --session "$BW_SESSION"` — it is
  read-only and rotates nothing.
- If you *do* unlock, you own the fallout: write the new value to `~/.env.d/bitwarden.env`
  (`umask 077`, `chmod 600`) in the same command, or you have silently broken every other agent.
- Prefer `source ~/.env.d/bitwarden.env` and reuse. Unlock only when `--check` says locked.

## Never lock yourself out (AGE-677)

`BW_SESSION` does **not** expire on a clock — it is the vault key, valid until something invalidates
the local key blob. So the danger is never "the session timed out", it is an agent running one of
these while it is the only access path:

- `bw lock` — drops the session. Recoverable only with the master password.
- `bw logout` — wipes `~/.config/Bitwarden CLI/data.json`. Requires a **full re-login** (email +
  password + 2FA). Never run it to "get a clean state".
- `bw login` on an already-authenticated host — same blast radius.

If you need a clean session, `bw unlock` again. Never `logout`. Rotating or re-minting working vault
access to tidy up is the exact failure `/home/azureuser/.paperclip/AGENTS.md` bans.

Secret hygiene for these files: `~/.secrets/*` and `~/.env.d/bitwarden.env` are `0600`. Verify with
`[ -n "$BW_SESSION" ]` or a 12-char hash prefix — never `echo` the value.

**API key login (if not yet logged in):**
```bash
source ~/.bitwarden_credentials   # BW_CLIENTID, BW_CLIENTSECRET
bw login --apikey
NEW_SESSION=$(BW_PASSWORD=$(cat ~/.secrets/bitwarden) bw unlock --passwordenv BW_PASSWORD --raw)
echo "export BW_SESSION=\"$NEW_SESSION\"" > ~/.env.d/bitwarden.env
source ~/.env.d/bitwarden.env
bw sync --session "$BW_SESSION"
```

Always `bw sync` after unlock to pull latest state.

## List secrets

```bash
# All items (id, name, type)
bw list items --session "$BW_SESSION" | jq '[.[] | {id, name, type}]'

# Search by name
bw list items --search "github" --session "$BW_SESSION" | jq '[.[] | {id, name}]'

# List collections (org)
bw list collections --session "$BW_SESSION" | jq '[.[] | {id, name}]'

# Items in a specific collection
COLL_ID=$(bw list collections --session "$BW_SESSION" | jq -r '.[] | select(.name=="openclawbot") | .id')
bw list items --collectionid "$COLL_ID" --session "$BW_SESSION" | jq '[.[] | {id, name, type}]'
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

**Into a collection (org)** — resolve collection + org IDs first:
```bash
ORG_ID=$(bw list organizations --session "$BW_SESSION" | jq -r '.[0].id')
COLL_ID=$(bw list collections --organizationid "$ORG_ID" --session "$BW_SESSION" \
  | jq -r '.[] | select(.name=="openclawbot") | .id')

# Create secure note in the collection
bw get template item.secureNote \
  | jq --arg n "CRYPTO_CALLBACK_SECRET" --arg v "my-secret-value" \
       --arg org "$ORG_ID" --argjson colls "[\"$COLL_ID\"]" \
    '.name=$n | .notes=$v | .organizationId=$org | .collectionIds=$colls' \
  | bw encode | bw create item --session "$BW_SESSION" | jq '{id, name}'
```

> **Note:** Items in org collections require `organizationId` AND `collectionIds` array.
> Personal vault items use folders; shared/project secrets use org collections.

## Create a collection (org)

```bash
ORG_ID=$(bw list organizations --session "$BW_SESSION" | jq -r '.[0].id')
# Create collection in the org
echo "{\"name\":\"openclawbot\",\"organizationId\":\"$ORG_ID\"}" \
  | bw encode | bw create org-collection --organizationid "$ORG_ID" --session "$BW_SESSION" | jq '{id, name}'
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
