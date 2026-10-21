---
name: telegram-cli
description: 'Send, read, and delete Telegram messages and media from a personal Telegram user account using the bundled `telegram-cli.py` Telethon helper. Use for DM-ing a bot or user, reading recent chat history, sending images/files/voice notes, downloading voice messages, send-and-wait bot smoke tests, and deleting messages by substring or id. Triggers on: "message @SomeBot on Telegram", "read my Telegram chat with X", "send a Telegram message/photo/voice note", "test the Telegram bot reply", "download Telegram voice messages", "delete Telegram messages", "clean up chat history", "remove spam from a chat".'
---

# telegram-cli

Drive Telegram from a **personal user account** (not a bot account) via a Telethon-backed CLI — message bots and users, read history, exchange media, and run send-and-wait QA checks without opening the Telegram app.

The bundled script lives next to this file: `{baseDir}/telegram-cli.py` (`{baseDir}` = this skill's directory). Run it with `python3`. Telethon must be installed (`pip install telethon`).

## Commands

`target` is a username (`@SomeBot`) or numeric Telegram ID for every command.

```bash
# Show which account the current session is logged in as
"{baseDir}/telegram-cli.py" whoami
"{baseDir}/telegram-cli.py" whoami --json

# Read recent history (default --limit 5)
# In group chats each message is prefixed with its author: "@handle (Name)".
# Outgoing messages show as "you"; anonymous admins / deleted accounts fall back
# to the chat name.
"{baseDir}/telegram-cli.py" read @SomeBot --limit 10
"{baseDir}/telegram-cli.py" read @somegroup --limit 50   # who said what in a group

# Send a text message
"{baseDir}/telegram-cli.py" send @SomeBot "Hello"

# Send and wait for the reply — the command for bot testing (default --wait 30s)
"{baseDir}/telegram-cli.py" ask @SomeBot "What can you do?" --wait 30

# Send media (--caption optional)
"{baseDir}/telegram-cli.py" send-image @SomeBot ./avatar.png --caption "Test"
"{baseDir}/telegram-cli.py" send-file  @SomeBot ./report.pdf --caption "Latest"
"{baseDir}/telegram-cli.py" send-voice @SomeBot ./note.ogg  --caption "Update"

# Download recent voice notes (--limit to save, --scan history depth, --out-dir target)
"{baseDir}/telegram-cli.py" get-voice @SomeBot --limit 3 --scan 50 --out-dir ./downloads

# Download + transcribe voice notes in one shot (requires faster-whisper + ffmpeg)
"{baseDir}/telegram-cli.py" get-voice @SomeBot --limit 5 --transcribe --language ru

# Also grab video notes (round "telescope" videos) and regular videos, transcribed
"{baseDir}/telegram-cli.py" get-voice @SomeBot --kinds all --transcribe --language ru
"{baseDir}/telegram-cli.py" get-voice @SomeBot --kinds video_note,video --transcribe

# Transcribe local audio/video file(s) you already have, no Telegram connection needed
"{baseDir}/telegram-cli.py" transcribe ./downloads/voice_2026-08-25.oga --language ru
"{baseDir}/telegram-cli.py" transcribe ./clip1.mp4 ./clip2.oga --whisper-model small

# Delete messages whose text contains a case-sensitive substring.
# --match is required; an empty match exits 2 and deletes nothing.
# Run --dry-run first. Prints counts and ids only — never message bodies.
"{baseDir}/telegram-cli.py" delete @AflredHermesBot --match "PAUSED" --since 2026-09-26T00:00:00 --dry-run
"{baseDir}/telegram-cli.py" delete @AflredHermesBot --match "PAUSED" --since 2026-09-26T00:00:00

# Delete ids the caller already has (same 100-id batches and flood-wait retry)
"{baseDir}/telegram-cli.py" delete-ids @SomeBot 1001 1002 1003
```

Prefer `ask` over `send` whenever you need to confirm a bot replied — it captures the response instead of leaving you to poll with `read`. Use `.ogg`/Opus for `send-voice` so Telegram renders a true voice note rather than an audio file.

## Verifying a message actually landed in a DM topic

`hermes send -t telegram:<chat_id>:<topic_id>` prints only `sent`. That is an
acceptance receipt, NOT delivery proof. To prove delivery, read the topic back.

**The read path for a DM topic is NOT `read <chat_id> --topic-id <id>`.** That
form fails with:

```
ERROR: An invalid Peer was used. Make sure to pass the right peer type and that
the value is valid (for instance, bots cannot start conversations)
(caused by GetRepliesRequest)
```

for BOTH user accounts (`@whoisdzianis` and `TELEGRAM_PROFILE=raccoonfriendly`).
That error does NOT mean the message was missing — it is the wrong read path.
Do not re-send a message on the strength of that error.

Read the MAIN history instead, which also returns the topic messages:

```bash
TELEGRAM_PROFILE=raccoonfriendly telegram-cli read 1916982742 --limit 4
```

The topic's messages appear under a `=== with topic ===` marker, attributed to
the BOT that sent them (e.g. `@MonicaHallBot (...)`). A message sent with
`hermes send` from a bot account is visible in the chat the bot sent INTO, not
in the bot's own DM history read as a user.

**Timestamps inside a rendered message body are in the channel's timezone, not
the host's local time.** A body saying `2026-10-21 02:45 PDT` while the host
clock says `2026-10-20 19:56 PDT` is CORRECT, not future-dated. Compare the
message's own `[timestamp]` prefix in the read-back against the body before
concluding anything is wrong.

## Deleting messages

A user account can delete its own messages, and in a bot DM it can delete the bot's messages (verified 2026-09-26: @whoisdzianis deleted 3018 bot messages in the @AflredHermesBot DM). It cannot delete other people's messages in a group — those come back as `MessageDeleteForbidden` and are counted as skipped.

```bash
"{baseDir}/telegram-cli.py" delete <target> --match TEXT [--topic-id TOPIC_ID] [--since ISO] [--until ISO] [--limit N] [--scan N] [--dry-run] [--revoke | --no-revoke]
"{baseDir}/telegram-cli.py" delete-ids <target> ID [ID ...] [--revoke | --no-revoke]
```

- `--match` is a case-sensitive substring. Required. Empty match exits 2 before any network call.
- `--topic-id` scopes the scan the same way `read` does. If the peer rejects the reply filter (a plain DM), the command scans main history, matches `reply_to_top_id`, and says so.
- `--since` / `--until` are ISO timestamps. Messages outside the window are skipped.
- `--scan` is how far back to look (default 5000). `--limit` is the max deletes (default 5000).
- `--dry-run` prints `scanned`, `matched`, and a few ids. Deletes nothing.
- `--revoke` defaults to true (delete for everyone). `--no-revoke` deletes only for this account.
- Deletes go out in batches of 100, with 1s between batches. `FloodWaitError` sleeps `retry_after + 1` and continues. The job does not abort.
- Output is counts plus ids: `scanned`, `matched`, `deleted`, `skipped`, `flood_waits`. Message text stays off stdout.

## Transcribing voice/video messages

`get-voice --transcribe` and the standalone `transcribe` command use `faster-whisper`
(CPU, int8) plus `ffmpeg` to convert audio/video to text. Requirements:

- `pip install faster-whisper` (already present in this environment's default
  Python — check with `python3 -c "import faster_whisper"` if a fresh venv is used).
- `ffmpeg` on PATH (`brew install ffmpeg` on macOS if missing) — needed to
  normalize `.oga`/`.ogg` voice notes and `.mp4` video/video_note files to 16kHz
  mono WAV before whisper reads them.
- `--kinds` on `get-voice` controls what's downloaded: `voice` (default),
  `video_note` (round "telescope" video messages), `video` (regular video
  attachments), or `all`/comma-separated combos, e.g. `--kinds video_note,voice`.
- `--language ru` (or `en`, etc.) skips language auto-detection and is faster/more
  accurate when you know the chat's language; omit to auto-detect.
- `--whisper-model` defaults to `small` — bump to `medium`/`large-v3` for tricky
  audio at the cost of speed; the first run of a new model size downloads weights
  from Hugging Face and can take a while.
- The first `WhisperModel(...)` call in a process is the slow part (model load);
  transcribing multiple files in one `get-voice --transcribe` or one `transcribe`
  call amortizes that cost. Run long transcription jobs with
  `terminal(background=true, notify_on_complete=true)` — model load + multi-file
  transcription can exceed the default foreground timeout.

## First-time login

The session must exist before any other command works.

```bash
"{baseDir}/telegram-cli.py" login                    # interactive: asks phone + code
"{baseDir}/telegram-cli.py" login --phone +15551234  # pre-seed phone; only the code is asked
```

Re-run `login` whenever a command reports `session not authenticated`.

Use `whoami` to confirm *which* account a session belongs to before sending anything —
it prints `id`, `username`, `phone`, name, premium/bot flags, and the resolved
`profile` / `session_path`. Exit code `0` = authorized, `1` = not logged in.

```
$ TELEGRAM_PROFILE=dev "{baseDir}/telegram-cli.py" whoami
authorized   : True
id           : 6668889106
username     : @someuser
phone        : +15551234567
first_name   : Den
profile      : dev
session_path : /Users/me/.config/telethon/dev/session.dat
```

The tool auto-migrates the session DB schema to match the installed Telethon version
(Telethon 1.43+ adds a `tmp_auth_key` column that 1.40.x can't read). This is transparent
and crash-safe. If you ever hit a persistent SQLite / `too many values to unpack` error on
connect, delete the session file (`~/.config/telethon/<profile>/session.dat.session`) and
re-run `login`.

## Multiple accounts (profiles)

Each profile is an isolated account with its own session file. Set the profile env var on **every** command for that account — `login`, `send`, `read`, `ask`, `delete`, `delete-ids`, and media commands alike — or the command silently targets the default account.

```bash
# Directory-path profile (recommended): session stored at <dir>/session.dat
TELEGRAM_CLI_PROFILE=~/.config/telegram/2 "{baseDir}/telegram-cli.py" login --phone +15551234
TELEGRAM_CLI_PROFILE=~/.config/telegram/2 "{baseDir}/telegram-cli.py" ask @SomeBot "/status" --wait 20

# Short-name profile: session at ~/.config/telethon/<name>/session.dat
TELEGRAM_PROFILE=dev "{baseDir}/telegram-cli.py" send @SomeBot "Hi from dev account"
```

Session selection, most specific wins:
`TELEGRAM_SESSION_PATH` (explicit file) → `TELEGRAM_CLI_PROFILE` (dir → `<dir>/session.dat`) → `TELEGRAM_PROFILE` (name → `~/.config/telethon/<name>/session.dat`) → default `~/.config/telethon/session.dat`.

Other env vars (defaults baked into the script, rarely changed): `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`.