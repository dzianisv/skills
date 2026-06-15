#!/usr/bin/env python3
"""
Telegram CLI — send messages/media to and read messages/media from Telegram chats.

Uses a Telethon user session stored under ~/.config/telethon/.

Usage:
    # Login (first time only)
    python scripts/telegram-cli.py login

    # Send a text message
    python scripts/telegram-cli.py send @SomeBot "Hello, test"

    # Attach image/file/voice
    python scripts/telegram-cli.py send-image @SomeBot ./avatar.png --caption "test"
    python scripts/telegram-cli.py send-file @SomeBot ./report.pdf --caption "latest"
    python scripts/telegram-cli.py send-voice @SomeBot ./note.ogg --caption "quick note"

    # Read last N messages from a chat
    python scripts/telegram-cli.py read @SomeBot --limit 20

    # Download recent voice messages from a chat
    python scripts/telegram-cli.py get-voice @SomeBot --limit 5 --out-dir ./downloads

    # Send and wait for reply (useful for bot testing)
    python scripts/telegram-cli.py ask @SomeBot "What can you do?" --wait 30

Environment variables (optional):
    TELEGRAM_API_ID       (default: 1993898)
    TELEGRAM_API_HASH     (default: 59d1e009d7ecb0c0a7224af3f461bb2e)
    TELEGRAM_SESSION_PATH (default: ~/.config/telethon/session.dat)
    TELEGRAM_CLI_PROFILE  Multi-account support via a full profile DIRECTORY path
                          (e.g. ~/.config/telegram/2). Session is stored at
                          <dir>/session.dat. Takes precedence over TELEGRAM_PROFILE.
    TELEGRAM_PROFILE      Multi-account support via a short profile NAME (e.g. "dev")
                          → ~/.config/telethon/<profile>/session.dat.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

try:
    from telethon import TelegramClient, events
except ImportError:
    print("ERROR: telethon not installed. Run: pip install telethon")
    sys.exit(1)


API_ID = int(os.environ.get("TELEGRAM_API_ID", "1993898"))
API_HASH = os.environ.get("TELEGRAM_API_HASH", "59d1e009d7ecb0c0a7224af3f461bb2e")
# Multi-account profile selection (most specific wins):
#   TELEGRAM_CLI_PROFILE — full directory path, e.g. ~/.config/telegram/2
#   TELEGRAM_PROFILE     — short name → ~/.config/telethon/<name>/session.dat
_CLI_PROFILE_DIR = os.environ.get("TELEGRAM_CLI_PROFILE", "").strip()
_PROFILE = os.environ.get("TELEGRAM_PROFILE", "").strip()
if _CLI_PROFILE_DIR:
    _DEFAULT_SESSION = os.path.join(os.path.expanduser(_CLI_PROFILE_DIR), "session.dat")
elif _PROFILE:
    _DEFAULT_SESSION = os.path.expanduser(f"~/.config/telethon/{_PROFILE}/session.dat")
else:
    _DEFAULT_SESSION = os.path.expanduser("~/.config/telethon/session.dat")

SESSION_PATH = os.environ.get("TELEGRAM_SESSION_PATH", _DEFAULT_SESSION)


def _ensure_session_schema() -> None:
    """Ensure sessions table schema matches the installed Telethon version.
    Telethon 1.43+ needs tmp_auth_key (column 6); 1.40.x only knows 5 columns
    and breaks if tmp_auth_key is present. Only add/keep tmp_auth_key for 1.43+."""
    import sqlite3 as _sqlite3
    try:
        import telethon
        _parts = telethon.__version__.split(".")
        needs_tmp = (int(_parts[0]), int(_parts[1])) >= (1, 43)
    except (ImportError, ValueError, IndexError):
        # Can't determine the Telethon version safely (e.g. an unexpected
        # version string) — leave the session alone and let Telethon proceed.
        return

    db_path = SESSION_PATH + '.session'
    if not os.path.exists(db_path):
        return
    conn = None
    try:
        # isolation_level=None → autocommit; we drive transactions explicitly so
        # the table rebuild below is atomic. Python's sqlite3 otherwise
        # auto-commits before each DDL, which would make DROP+RENAME separable
        # and lose the auth_key session on a crash between them.
        conn = _sqlite3.connect(db_path, isolation_level=None)
        cur = conn.cursor()
        cur.execute("PRAGMA table_info(sessions)")
        cols = [r[1] for r in cur.fetchall()]
        if not cols:
            return
        has_tmp = 'tmp_auth_key' in cols
        if needs_tmp and not has_tmp:
            cur.execute('ALTER TABLE sessions ADD COLUMN tmp_auth_key BLOB')
        elif not needs_tmp and has_tmp:
            # Telethon <1.43 can't unpack a 6-column sessions row — rebuild the
            # table without tmp_auth_key, in one EXCLUSIVE transaction so a crash
            # mid-rebuild rolls back and the original auth_key survives. Clear any
            # sessions_bak orphaned by a previously interrupted run first.
            cur.execute('DROP TABLE IF EXISTS sessions_bak')
            cur.execute('BEGIN EXCLUSIVE')
            cur.execute("CREATE TABLE sessions_bak AS "
                        "SELECT dc_id, server_address, port, auth_key, takeout_id FROM sessions")
            cur.execute("DROP TABLE sessions")
            cur.execute("ALTER TABLE sessions_bak RENAME TO sessions")
            cur.execute('COMMIT')
    except Exception:
        # best-effort; roll back any open transaction so a partial rebuild never
        # persists, then let Telethon surface its own error if still broken.
        try:
            if conn is not None:
                conn.execute('ROLLBACK')
        except Exception:
            pass
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass


def _make_client() -> "TelegramClient":
    _ensure_session_schema()
    return TelegramClient(SESSION_PATH, API_ID, API_HASH)


async def cmd_login(phone: str | None = None) -> int:
    # Ensure the profile directory exists before Telethon writes the session.
    session_dir = os.path.dirname(SESSION_PATH)
    if session_dir:
        os.makedirs(session_dir, exist_ok=True)
    client = _make_client()
    if phone:
        # Pre-seed the phone so only the login code is asked interactively.
        await client.start(phone=phone)  # type: ignore[func-returns-value]
    else:
        await client.start()  # type: ignore[func-returns-value]
    me = await client.get_me()  # type: ignore[assignment]
    profile_label = (
        f" [profile dir: {_CLI_PROFILE_DIR}]" if _CLI_PROFILE_DIR
        else f" [profile: {_PROFILE}]" if _PROFILE else ""
    )
    print(f"Logged in as @{getattr(me, 'username', '<unknown>')} ({getattr(me, 'first_name', '')}){profile_label}")
    print(f"Session saved to {SESSION_PATH}")
    await client.disconnect()  # type: ignore[func-returns-value]
    return 0


async def _connect() -> "TelegramClient":
    client = _make_client()
    await client.connect()  # type: ignore[func-returns-value]
    if not await client.is_user_authorized():
        print("ERROR: session not authenticated. Run: python scripts/telegram-cli.py login")
        await client.disconnect()  # type: ignore[func-returns-value]
        sys.exit(1)
    return client


def _media_tag(msg: object) -> str:
    tags: list[str] = []
    if getattr(msg, "photo", None):
        tags.append("photo")
    if getattr(msg, "voice", None):
        tags.append("voice")
    if getattr(msg, "video_note", None):
        tags.append("video_note")
    if getattr(msg, "video", None):
        tags.append("video")
    if getattr(msg, "audio", None) and "voice" not in tags:
        tags.append("audio")
    if getattr(msg, "document", None) and "audio" not in tags and "voice" not in tags:
        tags.append("document")
    if getattr(msg, "sticker", None):
        tags.append("sticker")
    if not tags and getattr(msg, "media", None):
        tags.append(type(getattr(msg, "media")).__name__)
    if not tags:
        return ""
    return f" [media: {', '.join(tags)}]"


def _validate_file(path: str) -> Path:
    file_path = Path(path).expanduser().resolve()
    if not file_path.exists():
        raise FileNotFoundError(f"file does not exist: {file_path}")
    if not file_path.is_file():
        raise FileNotFoundError(f"path is not a file: {file_path}")
    return file_path


async def cmd_send(target: str, message: str) -> int:
    client = await _connect()
    try:
        entity = await client.get_input_entity(target)
        sent = await client.send_message(entity, message)
        print(f"sent message_id={sent.id} to {target}")  # type: ignore[union-attr]
        return 0
    except Exception as exc:
        print(f"ERROR: {exc}")
        return 1
    finally:
        await client.disconnect()  # type: ignore[func-returns-value]


async def cmd_send_media(
    target: str,
    path: str,
    mode: str,
    caption: str | None = None,
) -> int:
    client = await _connect()
    try:
        file_path = _validate_file(path)
        entity = await client.get_input_entity(target)
        send_kwargs: dict[str, object] = {}
        if caption:
            send_kwargs["caption"] = caption

        if mode == "image":
            send_kwargs["force_document"] = False
        elif mode == "file":
            send_kwargs["force_document"] = True
        elif mode == "voice":
            send_kwargs["voice_note"] = True
        else:
            raise ValueError(f"unsupported media mode: {mode}")

        sent = await client.send_file(entity, str(file_path), **send_kwargs)
        print(f"sent {mode} message_id={sent.id} to {target} path={file_path}")  # type: ignore[union-attr]
        return 0
    except Exception as exc:
        print(f"ERROR: {exc}")
        return 1
    finally:
        await client.disconnect()  # type: ignore[func-returns-value]


async def cmd_read(target: str, limit: int) -> int:
    client = await _connect()
    try:
        entity = await client.get_input_entity(target)
        messages = await client.get_messages(entity, limit=limit)
        if not messages:
            print("(no messages)")
            return 0
        for msg in reversed(list(messages)):  # type: ignore[arg-type]
            sender = "you" if msg.out else target
            ts = msg.date.strftime("%Y-%m-%d %H:%M:%S") if msg.date else "?"
            text = msg.text or ""
            media_tag = _media_tag(msg)
            print(f"[{ts}] {sender}: {text}{media_tag}")
        return 0
    except Exception as exc:
        print(f"ERROR: {exc}")
        return 1
    finally:
        await client.disconnect()  # type: ignore[func-returns-value]


async def cmd_get_voice(target: str, limit: int, out_dir: str, scan: int) -> int:
    client = await _connect()
    try:
        entity = await client.get_input_entity(target)
        output_dir = Path(out_dir).expanduser().resolve()
        output_dir.mkdir(parents=True, exist_ok=True)

        history = max(limit, scan)
        messages = await client.get_messages(entity, limit=history)
        if not messages:
            print("(no messages)")
            return 0

        downloaded = 0
        for msg in messages:  # newest first
            if not getattr(msg, "voice", None):
                continue
            saved = await client.download_media(msg, file=str(output_dir))
            ts = msg.date.strftime("%Y-%m-%d %H:%M:%S") if msg.date else "?"
            if saved:
                print(f"[{ts}] downloaded voice message_id={msg.id} -> {saved}")
                downloaded += 1
            if downloaded >= limit:
                break

        if downloaded == 0:
            print("(no voice messages found in scanned history)")
        else:
            print(f"downloaded {downloaded} voice message(s) into {output_dir}")
        return 0
    except Exception as exc:
        print(f"ERROR: {exc}")
        return 1
    finally:
        await client.disconnect()  # type: ignore[func-returns-value]


async def cmd_ask(target: str, message: str, wait_seconds: int) -> int:
    """Send a message and wait for the bot's reply."""
    client = await _connect()
    handler = None
    try:
        entity = await client.get_input_entity(target)
        sent = await client.send_message(entity, message)
        print(f"sent message_id={sent.id} to {target}")  # type: ignore[union-attr]
        print(f"waiting up to {wait_seconds}s for reply...")

        reply_received = asyncio.Event()

        @client.on(events.NewMessage(from_users=[entity]))  # type: ignore[arg-type]
        async def handler(event: events.NewMessage.Event) -> None:  # type: ignore[no-redef]
            ts = event.date.strftime("%Y-%m-%d %H:%M:%S") if event.date else "?"
            text = event.text or ""
            media_tag = _media_tag(event)
            print(f"[{ts}] {target}: {text}{media_tag}")
            reply_received.set()

        # Start receiving updates
        await client.catch_up()  # type: ignore[func-returns-value]

        try:
            await asyncio.wait_for(reply_received.wait(), timeout=wait_seconds)
        except asyncio.TimeoutError:
            print(f"TIMEOUT: no reply from {target} within {wait_seconds}s")
            return 1

        # Brief extra wait to catch multi-message replies
        await asyncio.sleep(2)

        return 0
    except Exception as exc:
        print(f"ERROR: {exc}")
        return 1
    finally:
        if handler is not None:
            client.remove_event_handler(handler)
        await client.disconnect()  # type: ignore[func-returns-value]


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Telegram CLI — send/read messages via Telethon",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # login
    p_login = sub.add_parser("login", help="Interactive login flow")
    p_login.add_argument(
        "--phone",
        default=None,
        help="Phone in international format (e.g. +375259427264). Pre-seeds the "
        "prompt so only the login code is asked interactively.",
    )

    # send
    p_send = sub.add_parser("send", help="Send a message")
    p_send.add_argument("target", help="Username (@bot) or numeric Telegram ID")
    p_send.add_argument("message", help="Message text to send")

    # send-image
    p_send_image = sub.add_parser("send-image", help="Send an image/photo")
    p_send_image.add_argument("target", help="Username (@bot) or numeric Telegram ID")
    p_send_image.add_argument("path", help="Path to image file")
    p_send_image.add_argument("--caption", default=None, help="Optional caption text")

    # send-file
    p_send_file = sub.add_parser("send-file", help="Send a file/document")
    p_send_file.add_argument("target", help="Username (@bot) or numeric Telegram ID")
    p_send_file.add_argument("path", help="Path to file")
    p_send_file.add_argument("--caption", default=None, help="Optional caption text")

    # send-voice
    p_send_voice = sub.add_parser("send-voice", help="Send a voice note from audio file")
    p_send_voice.add_argument("target", help="Username (@bot) or numeric Telegram ID")
    p_send_voice.add_argument("path", help="Path to audio file (ogg/mp3/m4a etc.)")
    p_send_voice.add_argument("--caption", default=None, help="Optional caption text")

    # read
    p_read = sub.add_parser("read", help="Read recent messages from a chat")
    p_read.add_argument("target", help="Username (@bot) or numeric Telegram ID")
    p_read.add_argument("--limit", type=int, default=5, help="Number of messages (default: 5)")

    # get-voice
    p_get_voice = sub.add_parser(
        "get-voice",
        help="Download recent voice messages from a chat",
    )
    p_get_voice.add_argument("target", help="Username (@bot) or numeric Telegram ID")
    p_get_voice.add_argument(
        "--limit",
        type=int,
        default=5,
        help="Number of voice messages to download (default: 5)",
    )
    p_get_voice.add_argument(
        "--scan",
        type=int,
        default=50,
        help="How many recent messages to scan for voice notes (default: 50)",
    )
    p_get_voice.add_argument(
        "--out-dir",
        default="./downloads",
        help="Output directory for downloaded voice files (default: ./downloads)",
    )

    # ask (send + wait for reply)
    p_ask = sub.add_parser("ask", help="Send a message and wait for the reply")
    p_ask.add_argument("target", help="Username (@bot) or numeric Telegram ID")
    p_ask.add_argument("message", help="Message text to send")
    p_ask.add_argument("--wait", type=int, default=30, help="Seconds to wait for reply (default: 30)")

    args = parser.parse_args()

    if args.command == "login":
        rc = asyncio.run(cmd_login(args.phone))
    elif args.command == "send":
        rc = asyncio.run(cmd_send(args.target, args.message))
    elif args.command == "send-image":
        rc = asyncio.run(cmd_send_media(args.target, args.path, "image", args.caption))
    elif args.command == "send-file":
        rc = asyncio.run(cmd_send_media(args.target, args.path, "file", args.caption))
    elif args.command == "send-voice":
        rc = asyncio.run(cmd_send_media(args.target, args.path, "voice", args.caption))
    elif args.command == "read":
        rc = asyncio.run(cmd_read(args.target, args.limit))
    elif args.command == "get-voice":
        rc = asyncio.run(cmd_get_voice(args.target, args.limit, args.out_dir, args.scan))
    elif args.command == "ask":
        rc = asyncio.run(cmd_ask(args.target, args.message, args.wait))
    else:
        parser.print_help()
        rc = 1

    sys.exit(rc)


if __name__ == "__main__":
    main()
