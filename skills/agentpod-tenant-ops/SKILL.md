---
name: agentpod-tenant-ops
description: 'Spawn and configure an AgentPod tenant end to end: provision it through the Admin API, then set the agent''s standing instructions and recurring jobs through the tenant''s own Hermes chat API. Use when onboarding a new AgentPod customer, provisioning or re-granting a tenant, choosing a plan (including friend grants), or when a tenant agent needs its instructions or jobs created, changed, or verified.'
---

# agentpod-tenant-ops

Provision an AgentPod tenant for a real customer and configure its agent —
without touching the customer, the dashboard UI, or the host. Two APIs do
all of it:

1. **Admin API** — creates the tenant (control plane).
2. **Tenant chat API** — configures the agent that lives in it (data plane).

Born from a live onboarding (Aeris PR, Oct 2026) where every wrong turn
below actually happened: the secret was entered against the wrong host,
the plan defaulted silently, and the customer could not be provisioned at
all until she had started the bot once.

## Facts (verified against the AgentPod repo + live API)

- Admin base URL: `https://api.agentpod.agentlabs.cc`
  (`admin.agentpod.agentlabs.cc` serves the same routes).
  `console.openclaw.agentlabs.cc` is only the Vercel frontend — a
  credential registered for the console host never reaches the API.
- Auth: `Authorization: Bearer $ADMIN_SECRET` — one static shared secret,
  exact string compare on the server. Ground truth lives in the k8s
  secret `openclaw-bot-secret` on prod; the Bitwarden copy can be stale.
  A 401 on every route with a well-formed header means the value is
  wrong, not the host or the path. Health check:
  `GET /admin/api/tenants/rollout-pins` → 200 with `{"pinned": []}`.
- Spec of record: `docs/admin.md` in VibeTechnologies/AgentPod.

## Step 0 — the user must already exist

`POST /admin/api/tenants/provision` keys users by numeric `telegramId`
and returns **404 if the user does not exist**. A Telegram username is
not enough. The user record is created when the customer `/start`s the
bot once — that single tap is a hard precondition, not a formality.

Find the customer in `GET /admin/api/users` (returns every user; filter
in-process, the payload is large). Fields you need from the record:
`telegramId`, `username`, `subdomain`, `tenantStatus`, `planId`,
`deploymentType`, `placement`, `subscriptionStatus`, `gatewayToken`.

If the customer has not started the bot yet, do not poll manually: set a
watcher (interval job, ~15 min) that checks the users list, provisions
and configures on first appearance, reports once, and removes itself.
Give it a deadline (e.g. 7 days) after which it reports "still not
started" once and removes itself. See Step 5.

## Step 1 — provision

```http
POST /admin/api/tenants/provision
Authorization: Bearer $ADMIN_SECRET
Content-Type: application/json

{
  "telegramId": 123456789,
  "planId": "friend_unlimited",
  "deploymentType": "hermes",
  "placement": "kubernetes",
  "confirmRealCustomer": true
}
```

Defaults that will bite if omitted:

- `deploymentType` defaults to `"openclaw"` unconditionally — always set
  `"hermes"` explicitly for a Hermes tenant.
- `planId` defaults to `"pro"`. Paid ids include `pro`, `max`,
  `unlimited`; friend grants are exactly `"friend"` and
  `"friend_unlimited"` (config `FRIEND_PLAN_IDS`). The route creates or
  reuses the subscription for the given plan.
- `placement` defaults to kubernetes. Conflicting placement pairs
  (e.g. `placement:"kubernetes"` with `vmProvider:"lxd"`) return 400 —
  they are not silently corrected.
- **Real-customer guard:** for a genuine customer (not a registered test
  fixture), the route refuses with `400 {code:"REAL_CUSTOMER_GUARD"}`
  unless the body carries `"confirmRealCustomer": true`. Passing
  `isTest:true` does not satisfy the guard.
- One active tenant per type: a duplicate returns
  `409 {code:"TENANT_TYPE_CONFLICT"}` (one personal + one team tenant is
  allowed).

Response has no `id`; it returns `subdomain`, `provisionerType`,
`deploymentType`, `tenantType`, `placement`, `status`,
`litellmConfigured`.

## Step 2 — verify the tenant

Re-read `GET /admin/api/users`, find the customer's record, and confirm:
`subdomain` set, `planId` as intended, `deploymentType:"hermes"`,
`placement:"kubernetes"`, `subscriptionStatus` active, and
`tenantStatus` progressing to `"running"`. Provisioning takes minutes —
poll the record (~60 s interval, up to ~20 min) instead of re-posting
the provision call.

## Step 3 — configure via the Hermes chat API

Every tenant runs an OpenAI-compatible API server (Hermes seeds it with
`API_SERVER_KEY` = the tenant's `gatewayToken`):

- Base: the tenant URL, `https://<subdomain>.<tenant-suffix>` — resolve
  the working host by probing; do not guess it in a report.
- `GET /v1/models` with `Authorization: Bearer <gatewayToken>` —
  readiness probe and the source of the model id.
- `POST /v1/chat/completions` with the same Bearer token and body
  `{ "model": "<id from /v1/models>", "messages": [...] }`.

**Credential hygiene:** `gatewayToken` is a per-tenant credential pulled
from the Admin API record. Use it only as the Bearer token for that
tenant. Never print it in chat, reports, logs, or files.

### 3a. Standing instructions

Send the tenant's instruction document in 2–3 chunks in one conversation,
framed as standing operator instructions the agent must **persist to its
own memory/config** — a chat acknowledgement is not configuration. Require
the agent to reply with: its role, its hard rules, its workflows, and
**where it stored the instructions**. If it cannot name a storage
location, re-send with an explicit persist instruction.

### 3b. Jobs

Jobs are created by asking the agent, in the same conversation, to create
each recurring job with an explicit name, schedule, and task text. Rules:

- Time-based jobs need the customer's timezone. If it is not yet
  confirmed, have the agent create the jobs, mark timezone pending, and
  confirm the timezone with the customer in their first conversation
  before activating time-based schedules.
- Bind every job to the tenant's hard rules (for a client-facing agent:
  nothing external sends without the customer's approval of the final
  text; offers/prices/pitches never auto-send; per-client memory stays
  separated). Jobs inherit the rules — restate them in the job-creation
  message anyway.

### 3c. Verify by read-back (same conversation)

Never trust "done". Three checks:

1. "List all recurring jobs you have active, with schedules" — compare
   against the intended job table, item by item.
2. "State your hard rules" — compare against the instruction document.
3. One workflow spot-check ("What do you do when X arrives?") — compare
   against the documented workflow.

Any mismatch: re-send the missing part and re-verify once. Report the
read-back results, not the agent's assurances.

## Alternative spawn path — promo deep link (sendable to the customer)

When the operator wants one link to send the customer instead of asking
for a bare `/start`:

- Format: `https://t.me/OpenClawBoxBot?start=promo_<CODE>`
  (`promoDeepLink()` in `src/db/promo-codes.ts`). The `/start` payload is
  `promo_<code>`; the code is uppercased on parse.
- Codes are 16 chars, A–Z0–9, stored in the `promo_codes` table:
  `code`, `planId`, `grantsFriend` (friend codes require `planId` in
  `friend` / `friend_unlimited`), `maxRedemptions`, `note`, `expiresAt`,
  `freeMonths` (NULL for friend codes — friend grants use the
  `FRIEND_EXPIRES_AT` sentinel, no expiry).
- **There is no Admin API or console route that mints codes.**
  `createPromoCode()` is a DB-layer function; production minting is a
  direct insert into `promo_codes` by whoever holds prod DB access
  (see `docs/admin.md` for the kubectl/psql path). An agent without DB
  access prepares the code + insert for the operator instead of
  pretending an endpoint exists.
- One tap on the link does everything: `/start` upserts the user,
  claims the code atomically (single-writer; a lost claim replies
  "This code has already been used."), creates + friend-grants the
  subscription, and provisions the tenant. Redemption is rejected if
  the user already has an active subscription or a tenant.
- Differences from the admin-provision path: placement is resolved
  **by plan** (`resolvePlacement`) — for `friend_unlimited` that means
  **LXD, not Kubernetes** — and `deploymentType` is the provisioner
  default for new tenants. If the operator specifically needs
  Kubernetes placement, use the admin provision path (Step 1) after a
  plain `/start` instead.
- The automatic-grant spend cap applies to promo redemption; a capped
  grant still provisions but may defer LiteLLM key setup (the bot tells
  the user model setup is in progress).
- After redemption, configure the agent exactly as in Step 3 — the
  tenant is reachable via the same chat API with the record's
  `gatewayToken`.

## Step 4 — hand over

Configuration ends at verification. First-run onboarding (integration
connects, templates, data imports, timezone confirmation) happens in the
agent's own first conversation with the customer — AgentPod integrations
are in-chat: the agent sends its own sign-in link when a tool is not
connected, then retries.

## Step 5 — the watcher pattern (customer not yet registered)

When the only missing input is the customer's `/start`:

- Interval job (~15 min) → check users list for the username.
- Absent → stay silent (no report) unless past the deadline.
- Present, no tenant → provision (Step 1), verify (Step 2), configure
  (Step 3), report the full result once, **remove itself**.
- Present, tenant already running → report and remove itself; never
  provision or configure twice.
- Provision failed → report the error body verbatim, stay in place.
- Past deadline → report once, remove itself.

## Failure modes seen live

- **401 on all admin routes** → stored secret ≠ server secret. Compare
  against the k8s `openclaw-bot-secret` value; Bitwarden may be stale.
- **404 on provision** → user does not exist yet (no `/start`). Not a
  retryable error — wait for the customer.
- **400 REAL_CUSTOMER_GUARD** → add `"confirmRealCustomer": true`.
- **409 TENANT_TYPE_CONFLICT** → a tenant of that type already exists;
  read the record instead of forcing another.
- **Tenant stuck not-running** → check `profileSeedStatus` on the
  record; failed seeds are reconciled by the platform, re-check before
  escalating.

## Definition of done

- [ ] User record existed before provisioning (telegramId from the API,
      not from a username guess).
- [ ] Provision response + users record agree on subdomain, plan,
      deploymentType, placement; tenantStatus `running`.
- [ ] Instructions persisted by the agent, storage location named.
- [ ] Every intended job exists in the agent's read-back list with the
      right schedule.
- [ ] Hard-rules and one workflow read-back match the source document.
- [ ] No credential (ADMIN_SECRET, gatewayToken) appears in any report,
      file, or log produced along the way.
