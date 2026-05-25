---
name: readiness-check
description: Verify all OpenCode plugin services are healthy and ready. Use when diagnosing plugin issues, after deployment, or when services like Whisper, TTS, Supabase, or Telegram aren't working.
metadata:
  author: opencode-reflection-plugin
  version: "1.0"
---

# Readiness Check

Verify OpenCode plugin services operational.

## Quick health

```bash
# Whisper STT
curl -s http://localhost:8787/health

# Coqui TTS
echo '{"text":"test", "output":"/tmp/test.wav"}' | nc -U ~/.config/opencode/coqui/tts.sock

# Processes
ps aux | grep -E "whisper_server|tts_server" | grep -v grep

# Supabase RLS
source .env && curl -s "https://slqxwymujuoipyiqscrl.supabase.co/rest/v1/telegram_replies?select=id&limit=1" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY"

# Migrations
supabase migration list
```

## Whisper STT

Transcribes Telegram voice → text. `whisper/whisper_server.py`, port 8787.

```bash
cd /path/to/opencode-reflection-plugin/whisper
python3 whisper_server.py --port 8787 &
curl -s http://localhost:8787/health
```

Expected:
```json
{"status":"healthy","model_loaded":true,"current_model":"base","available_models":["tiny","tiny.en","base","base.en","small","small.en","medium","medium.en","large-v2","large-v3"]}
```

Troubleshoot: not running → start. Load fails → `pip install openai-whisper`. Slow start → `--model tiny`.

## Coqui TTS

Generates speech audio. Path: `~/.config/opencode/coqui/`.

```bash
# Status
ls -la ~/.config/opencode/coqui/tts.sock
cat ~/.config/opencode/coqui/server.pid
ps aux | grep "$(cat ~/.config/opencode/coqui/server.pid)"

# Test
echo '{"text":"Hello, this is a test.", "output":"/tmp/test_tts.wav"}' | nc -U ~/.config/opencode/coqui/tts.sock
# → {"success": true, "output": "/tmp/test_tts.wav"}

# Verify audio
file /tmp/test_tts.wav
# Expected: RIFF WAVE PCM 16-bit mono 48000 Hz
afplay /tmp/test_tts.wav    # macOS
```

Troubleshoot: socket missing → plugin auto-starts on first use. Manual restart: `kill $(cat ~/.config/opencode/coqui/server.pid)` then trigger TTS. Logs in `~/.config/opencode/coqui/`.

## Plugin deploy

```bash
ls -la ~/.config/opencode/plugin/
# Expected: reflection-3.ts, tts.ts

cp /path/to/opencode-reflection-plugin/tts.ts ~/.config/opencode/plugin/
cp /path/to/opencode-reflection-plugin/reflection-3.ts ~/.config/opencode/plugin/reflection.ts
```

Restart OpenCode after deploy.

## TTS config

`~/.config/opencode/tts.json`:

```json
{
  "enabled": true,
  "engine": "coqui",
  "os": {"voice":"Samantha","rate":200},
  "coqui": {"model":"jenny","device":"cpu","language":"en","serverMode":true},
  "telegram": {"enabled":true,"uuid":"your-uuid-here","sendText":true,"sendVoice":true,"receiveReplies":true},
  "whisper": {"enabled":true,"model":"base","port":8787}
}
```

## Supabase

### RLS

`telegram_replies` requires:
- SELECT for anon key (Realtime subs)
- `mark_reply_processed` RPC (mark replies handled)

Test SELECT:
```bash
source .env && curl -s "https://slqxwymujuoipyiqscrl.supabase.co/rest/v1/telegram_replies?select=id,uuid,processed,created_at&order=created_at.desc&limit=3" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY" | jq '.'
```
Expected: array (not error).

Test RPC:
```bash
source .env && curl -s "https://slqxwymujuoipyiqscrl.supabase.co/rest/v1/rpc/mark_reply_processed" -X POST \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d '{"p_reply_id": "00000000-0000-0000-0000-000000000000"}' | jq '.'
```
Expected: `true` or `false` (not permission error).

### Migrations

```bash
supabase migration list
```
Local + Remote columns must match.

Out of sync:
```bash
supabase migration repair --status reverted <migration_id>
supabase db push
```

### Edge functions

```bash
supabase functions list
supabase functions logs telegram-webhook --tail
supabase functions logs send-notify --tail
```

## Telegram

Config:
```bash
cat ~/.config/opencode/tts.json | jq '.telegram'
```
Required: `enabled: true`, `uuid` (from `/start`), `receiveReplies: true`.

Outbound notifications:
```bash
source .env && curl -s "https://slqxwymujuoipyiqscrl.supabase.co/rest/v1/telegram_notifications?select=id,message,created_at&order=created_at.desc&limit=3" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY" | jq '.'
```

Inbound replies (send bot a message first):
```bash
source .env && curl -s "https://slqxwymujuoipyiqscrl.supabase.co/rest/v1/telegram_replies?select=id,reply_text,is_voice,processed,created_at&processed=eq.false&order=created_at.desc&limit=5" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY" | jq '.'
```

Voice transcription: send voice → check `is_voice=true` + `reply_text` populated. Whisper must be running.

## Common issues

| Issue | Cause | Fix |
|---|---|---|
| Whisper not responding | Not started | `python3 whisper_server.py --port 8787 &` |
| Coqui socket missing | Not started | Trigger TTS or restart OpenCode |
| Supabase module error | Dep missing | Add to `~/.config/opencode/package.json`, `bun install` |
| Telegram not working | Missing UUID | Get from bot `/start` |
| Voice not transcribed | Whisper down | Start Whisper |
| RLS permission denied | Missing SELECT policy | Deploy `20240117000000_fix_replies_rls.sql` |
| Realtime not receiving | Anon blocked by RLS | Deploy RLS fix |
| mark_reply_processed fails | RPC missing | Deploy RLS fix with SECURITY DEFINER |
| Migrations out of sync | Unknown remote | `supabase migration repair` → `db push` |
