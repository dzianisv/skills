---
name: prompt-hermes-ai
description: Use when directing, configuring, recovering, or scheduling a Hermes Agent through chat, Telegram, or another messaging gateway instead of logging into its host. Triggers on "prompt Hermes", "set up Hermes", "configure Hermes cron", "recover Hermes credentials", "message the Hermes bot", "make Hermes do this daily", and "Hermes ignored my prompt".
---

<role>
Hermes control-plane operator. Turn user intent into prompts and durable Hermes
configuration, drive Hermes through its messaging channel, and verify outcomes
in real systems without logging into the Hermes host.
</role>

<goal>
Make Hermes complete the requested work autonomously and persistently. A task is
done only when Hermes has produced verified artifacts, durable configuration,
and a fresh-session proof that the setup survives chat and gateway restarts.
</goal>

## Operating model

Treat chat as control plane and Hermes as execution plane:

1. Prompt Hermes to inspect, configure, and repair its own environment.
2. Use Hermes-native tools for cron, skills, Kanban, delegation, browser, and
   terminal work.
3. Never replace prompting with direct SSH/container changes unless user
   explicitly requests host administration.
4. Verify external artifacts independently where possible.

Hermes terminal calls are fresh shells. Source durable environment variables in
the same call that consumes them:

```bash
set -a
source "$HOME/.hermes/.env"
set +a
# credentialed command here
```

Never assume an earlier terminal call exported variables for a later call.

## Workflow

### 1. Establish clean channel

- Identify exact bot, chat, and topic/thread.
- Prefer one dedicated topic per recurring workflow.
- Use `ask`/send-and-wait for short control prompts; read history after delayed
  cron deliveries.
- If context is huge, poisoned by sensitive-looking ciphertext, or repeatedly
  producing stale answers, start a fresh Hermes session:

```text
/new <descriptive-name>
/approve
```

Use `/commands` to discover supported gateway commands. Do not guess slash
commands.

### 2. Inventory before prompting

Ask Hermes for compact JSON containing:

- model/provider and gateway status
- available skills and toolsets
- cron jobs and next-run metadata
- workdir and repository remotes
- credential names/presence only
- external-system access results

Never request raw credential values. Require exact command exit codes or HTTP
statuses.

### 3. Separate durable behavior from immediate intent

For recurring or fragile work, use two layers:

1. **Durable skill** under `~/.hermes/skills/<name>/SKILL.md` containing full
   workflow, exact tools, invariants, and verification.
2. **Short cron prompt** telling Hermes to load that skill and execute every
   mandatory instruction end-to-end.

Long cron prompts get compressed, partially replaced, or drift during edits.
Do not rely on a chat message as durable behavior.

Create and modify skills with Hermes `skill_manage`. Do not guess repository-
relative paths. Hermes local skill source of truth is `~/.hermes/skills/`.
After every change, reload and reread the saved skill, then report SHA-256,
line count, and requirement booleans.

If a stale skill auto-loads despite being detached from cron, delete or replace
it through `skill_manage`; removing it only from the cron skill list is not
enough.

### 4. Send outcome-defined prompt

Use this structure:

```text
<role>
You own this task inside Hermes. Configure and execute it; do not ask me to SSH
into your host or finish automatable setup manually.
</role>

<goal>
[Concrete artifact and persistent behavior.]
</goal>

<inputs>
- authoritative source: [URL/page/repository]
- target channel/topic: [identifier]
- schedule/workdir: [exact values]
- existing artifact IDs to reuse: [IDs]
</inputs>

<constraints>
- Use native Hermes tools.
- Continue independent work after one phase fails.
- Current-run command/API evidence only.
- Never expose credentials or personal data.
- [Explicit forbidden destructive actions.]
</constraints>

<execution>
1. Inventory current state and deduplicate.
2. Complete all reversible setup.
3. Persist credentials/configuration for fresh sessions.
4. Create/update durable skill and native cron.
5. Run one fresh full execution.
</execution>

<verification>
- Read back every written artifact.
- Verify exact IDs, URLs, status codes, modes, and next run.
- Treat missing evidence as FAIL or BLOCKED.
</verification>

<output>
Return compact JSON/status table with artifacts, blockers, and next run. Never
return secret values.
</output>
```

Prefer exact verbs: `GET`, `POST`, `PATCH`, `cronjob action=update`, `await
delegate`, `read back`. Avoid vague verbs such as "ensure", "handle", and
"check" without naming evidence.

### 5. Configure credentials safely

“Provision read-only credentials” means give Hermes the minimum API identity
needed to read required data. It does not mean admin access.

| Capability | Minimum access | Proof |
|---|---|---|
| GitHub API | scoped token/OAuth for required repos | `gh auth status`, `gh api user`, repo read |
| Git SSH | repository deploy key | `git ls-remote origin` |
| Notion | integration access to required pages | page GET plus permitted write/read-back |
| Kubernetes | service account with `get/list/watch` only | reads succeed; Secrets/mutations return `no` |
| Analytics/monitoring | viewer or restricted API token | one real read from required property/project |
| Billing/support | restricted read-only API access | one redacted aggregate/list request |

Store durable values in Hermes secret/config storage or owner-only
`~/.hermes/.env`. Verify mode `600` and fresh-shell loading.

#### Browser-session fallback with chrome-sync

Prefer service APIs for daily automation: API identities are narrower, durable,
auditable, and less likely to expire than browser sessions. Use
[`chrome-sync`](https://agentpod.agentlabs.cc/blog/sync-your-local-chrome-session-to-remote-ai-agents/)
when a service is console-only, initial API setup requires an authenticated UI,
or Hermes must inspect a dashboard before an API credential exists.

Chrome cookies are bearer credentials, not read-only credentials. Access is
limited by the signed-in account, not by `chrome-sync`. For Google services,
syncing `.google.com` authentication cookies can also grant Gmail, Drive,
YouTube, Play Console, and other account capabilities.

Use this safe pattern:

1. Create a dedicated local Chrome profile and account for Hermes operations.
2. Grant that account Viewer/read-only roles only for required properties,
   projects, organizations, or dashboards.
3. Sign into only the required services in that profile.
4. Authenticate `chrome-sync` to the correct AgentPod/OpenClaw tenant.
5. Dry-run a domain-filtered sync; never push all cookies.
6. Push to the explicit tenant subdomain.
7. Prompt Hermes to verify one read-only dashboard action in its cloud browser.
8. Re-sync only after a login redirect/session expiry, not on a blind schedule.

```bash
npx -y @vibetechnologies/chrome-sync login

npx -y @vibetechnologies/chrome-sync push \
  --profile "Hermes Ops" \
  --domains analytics.google.com,accounts.google.com \
  --subdomain <tenant> \
  --dry-run --verbose

npx -y @vibetechnologies/chrome-sync push \
  --profile "Hermes Ops" \
  --domains analytics.google.com,accounts.google.com \
  --subdomain <tenant> \
  --verbose
```

Google login cookies are often scoped to `.google.com`. If the narrow domain
set redirects to login, use `--domains google.com` only with a dedicated Google
account that has no unrelated access. Never widen the domain set on a personal
or company-admin browser profile.

After sync, prompt Hermes:

```text
Use the existing authenticated cloud-browser session. Open [dashboard URL],
confirm active account and exact property/project, read [metric] for [date
range], and return property ID, date range, value, source URL, and screenshot.
Do not open admin, billing, user-management, inbox, or customer-record pages.
If redirected to login, report SESSION_EXPIRED; do not attempt password or 2FA
recovery.
```

For Google Analytics, preferred steady-state remains GA Data API with a
dedicated service account granted Viewer access to the target property.
Use browser sync to bootstrap or verify access, then move recurring cron reads
to the API.

When an approved credential must be transferred:

1. Ask Hermes for its current public encryption key.
2. Encrypt locally to that key; never create plaintext temp files.
3. Send ciphertext as a file with same-message instructions to save it mode
   `600`.
4. Prompt Hermes to import it using exact absolute paths.
5. Compare source/import bytes internally without printing values or digests.
6. Verify real API access in a new shell.
7. Keep only encrypted recovery material; remove plaintext temps.

Never paste base64 ciphertext into chat. Random payloads can poison context or
trigger provider safety filters. If media is not persisted automatically, send
the file again with instructions in its caption to save it during that turn.

Credential presence is not validity. Require a real authenticated API request.
`401 Bad credentials` means rotate/re-import; do not keep retrying.

### 6. Configure native cron

Use Hermes `cronjob` tool through chat:

- create/update exactly one named job
- pin provider/model
- set absolute workdir
- deliver to explicit origin/topic
- set `attach_to_session=true` when follow-up must be continuable
- attach durable skills and required toolsets

Cron-run sessions cannot manage cron jobs recursively. Inspect or update cron
metadata from an interactive Hermes session, not from inside the cron prompt.

After every update, list the job and verify:

- ID and enabled state
- schedule, timezone, and `next_run_at`
- provider/model and workdir
- delivery target
- `attach_to_session`
- exact skills/toolsets

Cron updates can reset fields that were meant to be preserved. Read every field
back; do not trust "updated: true".

Trigger once with `cronjob action=run`. A Telegram timeout does not prove the
trigger failed: cron delivery can arrive before or after the acknowledgement.
Do not trigger again blindly. Read topic history and inspect `last_run_at`,
`last_status`, `execution_success`, and delivered output.

Scheduler success is not task success. Inspect required external artifacts and
the cron report. A run that says `execution_success=true` while skipping required
phases is incomplete.

### 7. Iterate cheapest-first

Classify each failure before acting:

| Failure | Action |
|---|---|
| transient network/provider | retry at most twice |
| tool-usage-gated | fix variable, path, endpoint, schema, or call |
| stale prompt/skill | inspect installed source; patch/delete durable skill |
| credential invalid/missing | recover or rotate; verify authenticated request |
| context poisoned | `/new`, approve, continue in fresh session |
| tooling-gated | prove tool defect, then repair tool/source |
| human-gated | record one exact action; continue other phases |

Stop repeating the same error after three attempts. Change rung or emit a
precise blocker.

## Hermes-specific traps

- Do not ask Hermes to edit guessed paths such as `github/<skill>/SKILL.md`.
  Locate or manage the skill through `skill_manage`.
- Do not use a state file as proof that an external page/card exists. GET the
  exact ID and read back non-empty content.
- Do not call dispatched delegation complete. Await result and require branch,
  tests, PR, or explicit no-work evidence.
- Do not accept conceptual Kanban checks. Use native Kanban tool/CLI and exact
  canonical IDs.
- Do not infer API success from `curl` exit `0`; capture HTTP status separately.
- Parse raw response files, not line-numbered tool renderings.
- Clean temporary files after the final diagnostic, then verify zero remain.
- Keep Telegram helper processes sequential when they share one session DB.

## Done condition

Before reporting completion, require all applicable checks:

- Hermes performed work through its own tools, not host-side intervention.
- Durable skill/config and native cron exist.
- Credentials work from a fresh shell without exposing values.
- Fresh cron run produced required external artifacts.
- Writes were read back through real APIs/channels.
- No duplicate cron jobs, pages, cards, issues, or branches exist.
- Cron metadata and continuable delivery are correct.
- Remaining blockers name exact missing access/action and do not stop unrelated
  work.

Final response: target bot/topic, durable skill, cron ID/schedule/next run,
artifact links/IDs, credential capability status, and exact blockers.
