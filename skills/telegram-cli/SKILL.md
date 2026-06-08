---
name: telegram-cli
description: 'Send and read Telegram messages and media from a personal Telegram user account using the bundled `telegram-cli.py` Telethon helper. Use for DM-ing a bot or user, reading recent chat history, sending images/files/voice notes, downloading voice messages, and send-and-wait bot smoke tests. Triggers on: "message @SomeBot on Telegram", "read my Telegram chat with X", "send a Telegram message/photo/voice note", "test the Telegram bot reply", "download Telegram voice messages".'
---

# telegram-cli

Drive Telegram from a **personal user account** (not a bot account) via a Telethon-backed CLI — message bots and users, read history, exchange media, and run send-and-wait QA checks without opening the Telegram app.

The bundled script lives next to this file: `{baseDir}/telegram-cli.py` (`{baseDir}` = this skill's directory). Run it with `python3`. Telethon must be installed (`pip install telethon`).

## Commands

`target` is a username (`@SomeBot`) or numeric Telegram ID for every command.

```bash
# Read recent history (default --limit 5)
python3 "{baseDir}/telegram-cli.py" read @SomeBot --limit 10

# Send a text message
python3 "{baseDir}/telegram-cli.py" send @SomeBot "Hello"

# Send and wait for the reply — the command for bot testing (default --wait 30s)
python3 "{baseDir}/telegram-cli.py" ask @SomeBot "What can you do?" --wait 30

# Send media (--caption optional)
python3 "{baseDir}/telegram-cli.py" send-image @SomeBot ./avatar.png --caption "Test"
python3 "{baseDir}/telegram-cli.py" send-file  @SomeBot ./report.pdf --caption "Latest"
python3 "{baseDir}/telegram-cli.py" send-voice @SomeBot ./note.ogg  --caption "Update"

# Download recent voice notes (--limit to save, --scan history depth, --out-dir target)
python3 "{baseDir}/telegram-cli.py" get-voice @SomeBot --limit 3 --scan 50 --out-dir ./downloads
```

Prefer `ask` over `send` whenever you need to confirm a bot replied — it captures the response instead of leaving you to poll with `read`. Use `.ogg`/Opus for `send-voice` so Telegram renders a true voice note rather than an audio file.

## First-time login

The session must exist before any other command works.

```bash
python3 "{baseDir}/telegram-cli.py" login                    # interactive: asks phone + code
python3 "{baseDir}/telegram-cli.py" login --phone +15551234  # pre-seed phone; only the code is asked
```

Re-run `login` whenever a command reports `session not authenticated`.

## Multiple accounts (profiles)

Each profile is an isolated account with its own session file. Set the profile env var on **every** command for that account — `login`, `send`, `read`, `ask`, and media commands alike — or the command silently targets the default account.

```bash
# Directory-path profile (recommended): session stored at <dir>/session.dat
TELEGRAM_CLI_PROFILE=~/.config/telegram/2 python3 "{baseDir}/telegram-cli.py" login --phone +15551234
TELEGRAM_CLI_PROFILE=~/.config/telegram/2 python3 "{baseDir}/telegram-cli.py" ask @SomeBot "/status" --wait 20

# Short-name profile: session at ~/.config/telethon/<name>/session.dat
TELEGRAM_PROFILE=dev python3 "{baseDir}/telegram-cli.py" send @SomeBot "Hi from dev account"
```

Session selection, most specific wins:
`TELEGRAM_SESSION_PATH` (explicit file) → `TELEGRAM_CLI_PROFILE` (dir → `<dir>/session.dat`) → `TELEGRAM_PROFILE` (name → `~/.config/telethon/<name>/session.dat`) → default `~/.config/telethon/session.dat`.

Other env vars (defaults baked into the script, rarely changed): `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`.

## Troubleshooting

- `telethon not installed` → `pip install telethon` in the env running the script.
- `session not authenticated` → run `login` (with the right profile env var if using one).
- `file does not exist` → check the path passed to `send-image`/`send-file`/`send-voice`.
- Voice note sent as plain audio → re-send with an `.ogg`/Opus file.
- No reply within `--wait` timeout → confirm the target is online/running and raise `--wait`.
