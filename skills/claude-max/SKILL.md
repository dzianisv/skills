---
name: claude-max
description: Configure and activate the Claude Max subscription proxy so the agent runs on Claude Opus 4 at flat-rate cost instead of per-token Azure billing. Use when the user says "configure Claude Max", "use my subscription", "set up Claude Max", or asks why the agent is using GPT/Azure instead of Claude.
---

# Claude Max Subscription Setup

Connects this OpenClaw tenant to the user's Claude Max subscription via the
`claude-max-api-proxy` (a local OpenAI-compatible server that routes through
the Claude Code CLI). After setup the default agent model switches to
**Claude Opus 4** and all agent usage is billed to the flat-rate subscription
rather than per-token.

## Prerequisites

- Claude Max or Claude Pro subscription at claude.ai
- `claude-max-api-proxy` and `claude` CLI are pre-installed on this VM
  (`which claude-max-api && which claude` — both should resolve)

## Setup Flow

The setup has three phases. Work through them in order.

---

### Phase 1 — Start auth (get the URL)

```bash
bash ~/.openclaw/skills/claude-max/auth-flow.sh start
```

This prints a single `https://claude.com/cai/oauth/authorize?…` URL.
**Send that URL to the user** and ask them to:
1. Open it in their browser (logged in to their Claude account)
2. Click **Authorize**
3. Copy the authentication code shown on the next page and reply with it

Wait for the user's reply before continuing.

---

### Phase 2 — Submit the code

Once the user sends back the code, run:

```bash
bash ~/.openclaw/skills/claude-max/auth-flow.sh submit <CODE_FROM_USER>
```

Expected output (success):
```
OK logged_in=true email=<user@example.com> subscription=max
```

If it prints `FAIL`, tell the user the code may have expired and restart from
Phase 1.

---

### Phase 3 — Enable the proxy and switch the model

```bash
bash ~/.openclaw/skills/claude-max/auth-flow.sh enable claude-opus-4
```

This:
1. Starts the `claude-max-api` systemd service (proxy on `localhost:3456`)
2. Health-checks the proxy (`/health` → `{"status":"ok"}`)
3. Updates `models.providers.openai` to point at `localhost:3456`
4. Sets `agents.defaults.model.primary` to `openai/claude-opus-4`
5. Validates the config and restarts the gateway atomically

If the script exits 0, confirm to the user: **"Done — your agent is now running
on Claude Opus 4 via your Max subscription."**

---

## Check status at any time

```bash
bash ~/.openclaw/skills/claude-max/auth-flow.sh status
```

## Choosing a different model

Pass a model ID to `enable`:

| Model ID | Notes |
|---|---|
| `claude-opus-4` | Most capable, default choice |
| `claude-sonnet-4` | Faster, good for most tasks |
| `claude-haiku-4` | Fastest, lightweight tasks |

```bash
bash ~/.openclaw/skills/claude-max/auth-flow.sh enable claude-sonnet-4
```

## Reverting to the hosted model catalog

If the user wants to go back to the LiteLLM-hosted models:

```bash
openclaw config set agents.defaults.model.primary "litellm/gpt-5.3-codex"
openclaw config set models.providers.openai.baseUrl "${LITELLM_BASE_URL}" 
openclaw config validate
bash ~/.openclaw/skills/openclaw-config/safe-restart.sh --reason "revert to LiteLLM"
sudo systemctl stop claude-max-api
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| `which claude` fails | `npm install -g @anthropic-ai/claude-code` |
| Proxy starts but `authentication: FAIL` in logs | Re-run Phase 1+2 |
| `curl localhost:3456/health` times out | `sudo systemctl status claude-max-api` — check logs |
| Gateway unhealthy after enable | `auth-flow.sh` auto-rolls back config; check `journalctl -u openclaw-gateway -n 50` |
| Code expired or wrong challenge | Always use the code from the most recent `start` run |
