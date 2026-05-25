---
name: duckdns-domain
description: Register a free DuckDNS subdomain (*.duckdns.org) and point it at a server IP using the Chrome DevTools browser automation. Use when you need a public DNS name for a dev server and no managed DNS (Cloudflare, Route 53) is available.
triggers:
  - get a free domain
  - duckdns
  - register subdomain
  - free dns
  - dynamic dns
  - duckdns token
---

# Skill: duckdns-domain

Claim a `*.duckdns.org` subdomain, set its A record, and persist the token.

---

## Prerequisites

- Chrome DevTools MCP connected to a real browser (user's session)
- `bw` CLI installed and credentials in `~/.bitwarden_credentials`
- Server IP to point the domain at

---

## Step 1 — Log in to DuckDNS via GitHub

DuckDNS supports: GitHub, Twitter, Google (often 502), Persona.
**GitHub is most reliable.** Google gives 502. Reddit was removed.

```
mcp__chrome-devtools__navigate_page → https://www.duckdns.org/domains
mcp__chrome-devtools__take_snapshot → find uid of "login with github" link
mcp__chrome-devtools__click → uid of github login link
```

After click, page navigates to `https://www.duckdns.org/login-github?code=...`
GitHub OAuth must already be authenticated in browser. If GitHub 2FA is required,
user must complete it manually, then call the skill again.

### reCAPTCHA gate

After OAuth redirect, DuckDNS may show "please complete the reCaptcha" with a
button `>>> reCaptcha <<<`. Click it — DuckDNS uses **invisible reCAPTCHA**,
so no image challenge appears; the button completes it automatically.

```
mcp__chrome-devtools__take_snapshot → find uid of ">>> reCaptcha <<<" button
mcp__chrome-devtools__click → that button
```

Page then shows account info with the token visible. Session established.

---

## Step 2 — Add a subdomain

On the domains page (after captcha), fill the subdomain input and click "add domain".

```
mcp__chrome-devtools__take_snapshot → find textbox "enter domain" uid
mcp__chrome-devtools__fill → uid, value="your-subdomain"
mcp__chrome-devtools__click → uid of "add domain" button
```

**If "already taken by another user":** try a different name (append `-dev`, project prefix, etc.).

Success message: `domain your-subdomain.duckdns.org added to your account`

---

## Step 3 — Set the IP address

The domain is created with the browser's current public IP. Update it:

```
mcp__chrome-devtools__take_snapshot → find textbox for the domain row (value shows current IP)
mcp__chrome-devtools__fill → uid, value="YOUR_SERVER_IP"
mcp__chrome-devtools__click → uid of "update ip" button next to that row
```

Success message: `ip address for your-subdomain.duckdns.org updated to YOUR_SERVER_IP`

---

## Step 4 — Read and save the token

The token is shown on the domains page after login:

```
token   bcb346f5-0d9b-4bd3-bc91-13c844415c6b   (example)
```

Read it from the snapshot (uid with `StaticText` under the `token` label).

**Save to local env file:**
```bash
cat > ~/.env.d/duckduckgo.env << 'EOF'
DUCKDNS_TOKEN=<token>
DUCKDNS_DOMAIN=<subdomain>.duckdns.org
EOF
```

**Save to Bitwarden** (requires unlocked session):
```bash
set -a; source ~/.bitwarden_credentials; set +a
export BW_SESSION=$(bw unlock --passwordenv BW_PASSWORD --raw 2>/dev/null)
bw sync --session "$BW_SESSION"
echo '{"type":2,"name":"DUCKDNS_TOKEN","notes":"<token>","secureNote":{"type":0}}' \
  | bw encode | bw create item --session "$BW_SESSION" | jq '{id, name}'
```

> **Note:** `bw get template item.secureNote` is broken in bw 2026.4.2 (returns type 0).
> Use the manual JSON above instead.

---

## Step 5 — Verify DNS propagation

```bash
dig +short <subdomain>.duckdns.org @8.8.8.8
# Must return YOUR_SERVER_IP
```

DuckDNS propagates within seconds. If wrong IP, re-check Step 3.

---

## Step 6 — Renew IP via API (cron / deploy hook)

DuckDNS provides an update API — no browser needed after initial setup:

```bash
source ~/.env.d/duckduckgo.env
SUBDOMAIN="${DUCKDNS_DOMAIN%.duckdns.org}"
curl -fsS "https://www.duckdns.org/update?domains=${SUBDOMAIN}&token=${DUCKDNS_TOKEN}&ip=${SERVER_IP}"
# Returns "OK" on success
```

Add to cron or deploy script to keep IP current.

---

## Known Issues

| Issue | Fix |
|---|---|
| Google OAuth → 502 Bad Gateway | Use GitHub login instead |
| GitHub OAuth code received but session not established | Complete GitHub 2FA in browser, then click login again |
| `webagent` taken | Append `-dev`, project name prefix, or initials |
| `bw get template` throws WASM error | Use raw JSON `{"type":2,...}` instead |
| reCAPTCHA button visible after login | Click it — invisible reCAPTCHA, no challenge |

---

## Suggested credential storage

- Save the DuckDNS token to `~/.env.d/duckdns.env` (or your equivalent env-file
  store) and to a Bitwarden item named e.g. `DUCKDNS_TOKEN` for redundancy.
- Pick a subdomain that reflects the project: `<project>.duckdns.org`.
