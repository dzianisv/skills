---
name: spaceship-dns
description: Manage DNS records for domains registered at Spaceship (spaceship.com). Add/edit/delete A, CNAME, TXT, MX records via the Spaceship Advanced DNS web UI using vibebrowser-cli (VBC). Use when adding subdomains, configuring Vercel custom domains, setting up email forwarding, or any DNS change for agentlabs.cc or other Spaceship-managed domains.
---

# Spaceship DNS Management

Domains managed via Spaceship (spaceship.com). DNS provider: Spaceship nameservers (`launch1.spaceship.net`, `launch2.spaceship.net`). Spaceship does NOT yet have a public REST API for DNS — all changes must go through the web UI.

## Known domains

| Domain | Notes |
|--------|-------|
| `agentlabs.cc` | VIBE TECHNOLOGIES. Root A → `76.76.21.21` (Vercel). Spaceship nameservers. |

## VBC setup

```bash
VIBE_CLI="node /home/azureuser/workspace/vibebrowser/vibe-mcp/node_modules/.bin/vibebrowser-cli"
REMOTE="--remote wss://relay.api.vibebrowser.app/2d2f60a1-2031-4279-aa25-358f2c5b6f84"
VBC="$VIBE_CLI $REMOTE"

# Always check extension is connected first
$VBC status
# "Extension connected: yes" required — if "no", cannot proceed (user must reconnect extension)

# Get a tab ID
$VBC tabs
PAGE_ID=<id from tabs output>
```

## Navigate to DNS manager

Direct URL — already logged in as `vibeteaichnologies@gmail.com`:

```bash
$VBC navigate --page-id $PAGE_ID \
  "https://www.spaceship.com/application/advanced-dns-application/manage/agentlabs.cc/"
sleep 4
$VBC snapshot --page-id $PAGE_ID 2>&1 | grep -E "Add record|DNS Records|uid="
```

The page shows current DNS records and an "Add record" button.

## Add a DNS record

```bash
# Click "Add record" — snapshot first to get uid
$VBC snapshot --page-id $PAGE_ID 2>&1 | grep "Add record"
$VBC click --page-id $PAGE_ID A24   # uid varies, check snapshot

sleep 2
$VBC snapshot --page-id $PAGE_ID 2>&1 | grep -E "uid=A[3-9][0-9]|textbox|button.*A"
```

The form row appears inline. Fields:
- `textbox "@"` → Host (subdomain, e.g. `opencode` or `_vercel`)
- Button showing current type (e.g. `"A"`) → click to change type
- `textbox "IP V4 Address"` → Value for A records; `textbox "Value"` for TXT

```bash
# Fill host
$VBC type --page-id $PAGE_ID A33 "opencode"   # uid varies

# Fill value (for A record — IP stays default type "A")
$VBC type --page-id $PAGE_ID A36 "76.76.21.21"

# For TXT record — change type first
$VBC click --page-id $PAGE_ID A35  # type selector button
sleep 1
$VBC snapshot --page-id $PAGE_ID   # find "TXT" option in dropdown
$VBC click --page-id $PAGE_ID ...  # click TXT

# Fill TXT value
$VBC type --page-id $PAGE_ID A36 "vc-domain-verify=opencode.agentlabs.cc,abc123"
```

Each row has its own Save/confirm button. Look for a checkmark or Save button after filling.

## Vercel subdomain setup (full recipe)

To add `sub.agentlabs.cc` pointing to a Vercel project:

**Step 1 — Add domain to Vercel project via API:**
```bash
source ~/.bitwarden_credentials
export BW_SESSION=$(bw unlock "$BW_PASSWORD" --raw 2>&1)
VERCEL_TOKEN=$(bw get notes "VERCEL_TOKEN" --session "$BW_SESSION")
TEAM_ID="team_vF4d4Phgfv1IqW1MEZw7mBre"   # bison's projects
PROJECT_ID="prj_Gy68vPhrgN0wEpFtxrCKUX38whLh"  # opencode-mobile-site

RESULT=$(curl -s -X POST \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.vercel.com/v10/projects/$PROJECT_ID/domains?teamId=$TEAM_ID" \
  -d '{"name":"sub.agentlabs.cc"}')
echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print('verified:', d.get('verified')); [print('TXT needed:', v['domain'], '=', v['value']) for v in d.get('verification',[])]"
```

This returns the TXT verification record needed.

**Step 2 — Add DNS records in Spaceship:**
- A record: `sub` → `76.76.21.21` (Vercel's IP)
- TXT record: `_vercel` → `vc-domain-verify=sub.agentlabs.cc,<hash>` (from Step 1 output)

**Step 3 — Verify domain in Vercel:**
```bash
# Check domain verification status
curl -s -H "Authorization: Bearer $VERCEL_TOKEN" \
  "https://api.vercel.com/v9/projects/$PROJECT_ID/domains?teamId=$TEAM_ID" \
  | python3 -c "import sys,json; [print(d['name'], 'verified:', d.get('verified')) for d in json.load(sys.stdin).get('domains',[])]"

# Also check DNS propagation
dig sub.agentlabs.cc A +short
# Should return 76.76.21.21 within 5-30 minutes
```

## Current DNS records for agentlabs.cc (2026-06-21)

| Host | Type | Value | Notes |
|------|------|-------|-------|
| `@` | A | `76.76.21.21` | Root → Vercel `agentlabs` project |
| `@` | MX | (3 records) | Email forwarding via Spaceship |
| `@` | TXT | `v=spf1 include:spf.efwd.spaceship.net ~all` | SPF for email |
| `opencode` | A | `76.76.21.21` | → Vercel `opencode-mobile-site` project (added 2026-06-21) |
| `_vercel` | TXT | `vc-domain-verify=opencode.agentlabs.cc,c9a0888fc28dbb59551f` | Vercel domain verification |

## Vercel project → domain mapping

| Vercel Project | Domain | Project ID |
|---------------|--------|------------|
| `agentlabs` | `agentlabs.cc` | `prj_aupLFb5NjTy7tomL9DYmHjlTt84T` |
| `opencode-mobile-site` | `opencode.agentlabs.cc` | `prj_Gy68vPhrgN0wEpFtxrCKUX38whLh` |

Vercel team: `bison-s-projects` / `team_vF4d4Phgfv1IqW1MEZw7mBre`  
Vercel token: in Bitwarden as `VERCEL_TOKEN`

## Gotchas

- Spaceship nameservers (`launch1/2.spaceship.net`) mean Vercel can't auto-manage subdomains. Manual DNS record required for each subdomain.
- `vercel domains add sub.domain.com project` returns "alias_conflict" if domain is already registered in Vercel (even if on wrong project). Use the REST API to add to specific project instead.
- DNS propagation with Spaceship nameservers: 5–30 minutes typical. Use `dig +short` to verify.
- Spaceship Advanced DNS URL: `https://www.spaceship.com/application/advanced-dns-application/manage/<domain>/`
- "Add record" opens an inline form row — each row has its own save action. The page does NOT have a global Save button for all pending records.
