#!/usr/bin/env python3
"""
Focused offline tests for telegram-cli.py — argument parsing and forum/
monoforum topic-filtering helpers.

No network access, no Telegram session, no live login required. Run with:

    python3 -m unittest test_telegram_cli -v

or directly:

    python3 test_telegram_cli.py
"""
from __future__ import annotations

import importlib.util
import sys
import types as _stdlib_types
import unittest
from pathlib import Path

_MODULE_PATH = Path(__file__).with_name("telegram-cli.py")
_spec = importlib.util.spec_from_file_location("telegram_cli", _MODULE_PATH)
telegram_cli = importlib.util.module_from_spec(_spec)
sys.modules["telegram_cli"] = telegram_cli
_spec.loader.exec_module(telegram_cli)  # type: ignore[union-attr]


def _fake_message(msg_id: int, reply_to=None, out: bool = False):
    """A minimal stand-in for a Telethon Message, using only the attributes
    `_belongs_to_topic`/`_message_topic_id` read (id, reply_to)."""
    return _stdlib_types.SimpleNamespace(id=msg_id, reply_to=reply_to, out=out)


def _fake_reply(reply_to_msg_id=None, reply_to_top_id=None, forum_topic=False):
    return _stdlib_types.SimpleNamespace(
        reply_to_msg_id=reply_to_msg_id,
        reply_to_top_id=reply_to_top_id,
        forum_topic=forum_topic,
    )


class CoerceTargetTests(unittest.TestCase):
    def test_username_left_as_string(self):
        self.assertEqual(telegram_cli._coerce_target("@SomeBot"), "@SomeBot")

    def test_numeric_id_coerced_to_int(self):
        self.assertEqual(telegram_cli._coerce_target("8730650283"), 8730650283)

    def test_negative_numeric_id_coerced_to_int(self):
        self.assertEqual(telegram_cli._coerce_target("-1004393946155"), -1004393946155)


class TopicReplyToTests(unittest.TestCase):
    def test_none_topic_id_returns_none(self):
        self.assertIsNone(telegram_cli._topic_reply_to(None))

    def test_topic_id_sets_both_reply_and_top_msg_id(self):
        reply_to = telegram_cli._topic_reply_to(593502)
        self.assertEqual(reply_to.reply_to_msg_id, 593502)
        self.assertEqual(reply_to.top_msg_id, 593502)


class MessageTopicIdTests(unittest.TestCase):
    def test_no_reply_header_has_no_topic(self):
        msg = _fake_message(1, reply_to=None)
        self.assertIsNone(telegram_cli._message_topic_id(msg))

    def test_reply_to_top_id_is_the_topic(self):
        msg = _fake_message(2, reply_to=_fake_reply(reply_to_msg_id=610000, reply_to_top_id=593502))
        self.assertEqual(telegram_cli._message_topic_id(msg), 593502)

    def test_direct_reply_to_topic_root_uses_reply_to_msg_id(self):
        # A message that directly replies to the topic root has forum_topic=True
        # and reply_to_msg_id == the root id, with no reply_to_top_id set.
        msg = _fake_message(3, reply_to=_fake_reply(reply_to_msg_id=593502, forum_topic=True))
        self.assertEqual(telegram_cli._message_topic_id(msg), 593502)

    def test_plain_reply_without_forum_topic_flag_has_no_topic(self):
        # A normal (non-forum) reply must not be mistaken for topic membership.
        msg = _fake_message(4, reply_to=_fake_reply(reply_to_msg_id=999, forum_topic=False))
        self.assertIsNone(telegram_cli._message_topic_id(msg))


class BelongsToTopicTests(unittest.TestCase):
    def test_no_topic_filter_matches_everything(self):
        msg = _fake_message(1, reply_to=None)
        self.assertTrue(telegram_cli._belongs_to_topic(msg, None))

    def test_root_message_itself_belongs_to_its_topic(self):
        root = _fake_message(593502, reply_to=None)
        self.assertTrue(telegram_cli._belongs_to_topic(root, 593502))

    def test_message_threaded_under_topic_matches(self):
        msg = _fake_message(610000, reply_to=_fake_reply(reply_to_msg_id=593502, reply_to_top_id=593502))
        self.assertTrue(telegram_cli._belongs_to_topic(msg, 593502))

    def test_message_in_sibling_topic_does_not_leak(self):
        # Same chat, different topic — must be filtered out.
        msg = _fake_message(700000, reply_to=_fake_reply(reply_to_msg_id=650000, reply_to_top_id=650000))
        self.assertFalse(telegram_cli._belongs_to_topic(msg, 593502))

    def test_message_with_no_topic_header_does_not_match_a_requested_topic(self):
        msg = _fake_message(800000, reply_to=None)
        self.assertFalse(telegram_cli._belongs_to_topic(msg, 593502))


class ArgumentParsingTests(unittest.TestCase):
    def setUp(self):
        self.parser = telegram_cli.build_parser()

    def test_send_without_topic_id_defaults_to_none(self):
        args = self.parser.parse_args(["send", "@SomeBot", "hello"])
        self.assertIsNone(args.topic_id)

    def test_send_with_topic_id_parses_as_int(self):
        args = self.parser.parse_args(["send", "@SomeBot", "hello", "--topic-id", "593502"])
        self.assertEqual(args.topic_id, 593502)
        self.assertIsInstance(args.topic_id, int)

    def test_ask_accepts_topic_id_alongside_wait(self):
        args = self.parser.parse_args(["ask", "@SomeBot", "ping", "--wait", "10", "--topic-id", "593502"])
        self.assertEqual(args.topic_id, 593502)
        self.assertEqual(args.wait, 10)

    def test_read_accepts_topic_id(self):
        args = self.parser.parse_args(["read", "@SomeBot", "--limit", "20", "--topic-id", "593502"])
        self.assertEqual(args.topic_id, 593502)
        self.assertEqual(args.limit, 20)

    def test_send_file_and_send_image_and_send_voice_accept_topic_id(self):
        for cmd in ("send-file", "send-image", "send-voice"):
            args = self.parser.parse_args([cmd, "@SomeBot", "./x.bin", "--topic-id", "593502"])
            self.assertEqual(args.topic_id, 593502, msg=f"{cmd} did not parse --topic-id")

    def test_capabilities_subcommand_parses_with_no_extra_args(self):
        args = self.parser.parse_args(["capabilities"])
        self.assertEqual(args.command, "capabilities")

    def test_whoami_subcommand_parses_with_and_without_json(self):
        args = self.parser.parse_args(["whoami"])
        self.assertEqual(args.command, "whoami")
        self.assertFalse(args.json)
        args = self.parser.parse_args(["whoami", "--json"])
        self.assertTrue(args.json)

    def test_invalid_topic_id_fails_parsing_before_any_connection(self):
        # argparse must reject a non-integer --topic-id at parse time (exit
        # code 2), i.e. before cmd_send/_connect ever runs.
        with self.assertRaises(SystemExit) as ctx:
            self.parser.parse_args(["send", "@SomeBot", "hello", "--topic-id", "not-a-number"])
        self.assertEqual(ctx.exception.code, 2)

    def test_missing_required_target_fails_parsing(self):
        with self.assertRaises(SystemExit) as ctx:
            self.parser.parse_args(["send"])
        self.assertEqual(ctx.exception.code, 2)


class CapabilitiesCommandTests(unittest.TestCase):
    def test_capabilities_runs_offline_and_reports_topic_support(self):
        import io
        import contextlib

        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            rc = telegram_cli.cmd_capabilities()
        output = buf.getvalue()
        self.assertEqual(rc, 0)
        self.assertIn("topic_support=true", output)
        self.assertIn(telegram_cli.TOPIC_FLAG, output)
        for cmd in telegram_cli.TOPIC_AWARE_COMMANDS:
            self.assertIn(cmd, output)


class WhoamiCommandTests(unittest.IsolatedAsyncioTestCase):
    class _FakeMe:
        id = 123456789
        username = "someuser"
        phone = "15551234567"
        first_name = "Den"
        last_name = None
        bot = False
        premium = True
        verified = False
        restricted = False
        lang_code = "en"

    class _FakeWhoamiClient:
        def __init__(self, authorized: bool):
            self._authorized = authorized
            self.disconnected = False

        async def connect(self):
            return None

        async def is_user_authorized(self):
            return self._authorized

        async def get_me(self):
            return WhoamiCommandTests._FakeMe()

        async def __call__(self, request):
            raise RuntimeError("full user unavailable")

        async def disconnect(self):
            self.disconnected = True

    async def _run(self, authorized: bool, as_json: bool = False):
        import io
        import contextlib

        client = self._FakeWhoamiClient(authorized)
        original = telegram_cli._make_client
        telegram_cli._make_client = lambda: client
        buf = io.StringIO()
        try:
            with contextlib.redirect_stdout(buf):
                rc = await telegram_cli.cmd_whoami(as_json)
        finally:
            telegram_cli._make_client = original
        return rc, buf.getvalue(), client

    async def test_whoami_reports_account_identity(self):
        rc, output, client = await self._run(authorized=True)
        self.assertEqual(rc, 0)
        self.assertIn("@someuser", output)
        self.assertIn("+15551234567", output)
        self.assertIn("123456789", output)
        self.assertIn("Den", output)
        self.assertIn(telegram_cli.SESSION_PATH, output)
        self.assertTrue(client.disconnected)

    async def test_whoami_json_output_is_parseable(self):
        import json

        rc, output, _ = await self._run(authorized=True, as_json=True)
        data = json.loads(output)
        self.assertEqual(rc, 0)
        self.assertTrue(data["authorized"])
        self.assertEqual(data["username"], "@someuser")
        self.assertEqual(data["phone"], "+15551234567")
        self.assertEqual(data["id"], 123456789)
        self.assertTrue(data["is_premium"])

    async def test_whoami_unauthorized_returns_nonzero_and_no_identity(self):
        rc, output, client = await self._run(authorized=False)
        self.assertEqual(rc, 1)
        self.assertIn("authorized: false", output)
        self.assertNotIn("@someuser", output)
        self.assertTrue(client.disconnected)


class _FakeClient:
    """Stand-in for TelegramClient that records raw requests instead of
    hitting the network, so the topic-aware send paths can be exercised
    offline (no session, no live Telegram)."""

    def __init__(self):
        self.sent_requests = []
        self.high_level_calls = []

    async def send_message(self, entity, message):
        self.high_level_calls.append(("send_message", entity, message))
        return _stdlib_types.SimpleNamespace(id=111)

    async def send_file(self, entity, path, **kwargs):
        self.high_level_calls.append(("send_file", entity, path, kwargs))
        return _stdlib_types.SimpleNamespace(id=222)

    async def _parse_message_text(self, message, parse_mode):
        return message, []

    async def _file_to_media(self, path, **kwargs):
        return None, _stdlib_types.SimpleNamespace(kind="fake-media"), None

    def _get_response_message(self, request, result, entity):
        return _stdlib_types.SimpleNamespace(id=999, request=request)

    async def __call__(self, request):
        self.sent_requests.append(request)
        return _stdlib_types.SimpleNamespace(raw=True)


class SendTextMessageRoutingTests(unittest.IsolatedAsyncioTestCase):
    async def test_without_topic_id_uses_high_level_send_message(self):
        client = _FakeClient()
        sent = await telegram_cli._send_text_message(client, "entity", "hi", None)
        self.assertEqual(sent.id, 111)
        self.assertEqual(client.high_level_calls[0][0], "send_message")
        self.assertEqual(client.sent_requests, [])

    async def test_with_topic_id_builds_raw_request_with_top_msg_id(self):
        client = _FakeClient()
        sent = await telegram_cli._send_text_message(client, "entity", "hi", 593502)
        self.assertEqual(sent.id, 999)
        self.assertEqual(client.high_level_calls, [])
        self.assertEqual(len(client.sent_requests), 1)
        request = client.sent_requests[0]
        self.assertEqual(request.reply_to.reply_to_msg_id, 593502)
        self.assertEqual(request.reply_to.top_msg_id, 593502)


class SendMediaMessageRoutingTests(unittest.IsolatedAsyncioTestCase):
    async def test_without_topic_id_uses_high_level_send_file(self):
        client = _FakeClient()
        sent = await telegram_cli._send_media_message(client, "entity", Path("./x.png"), "image", "caption", None)
        self.assertEqual(sent.id, 222)
        self.assertEqual(client.high_level_calls[0][0], "send_file")
        self.assertEqual(client.sent_requests, [])

    async def test_with_topic_id_builds_raw_request_with_top_msg_id(self):
        client = _FakeClient()
        sent = await telegram_cli._send_media_message(client, "entity", Path("./x.png"), "image", "caption", 593502)
        self.assertEqual(sent.id, 999)
        self.assertEqual(client.high_level_calls, [])
        self.assertEqual(len(client.sent_requests), 1)
        request = client.sent_requests[0]
        self.assertEqual(request.reply_to.reply_to_msg_id, 593502)
        self.assertEqual(request.reply_to.top_msg_id, 593502)

    async def test_unsupported_mode_raises_before_touching_client(self):
        client = _FakeClient()
        with self.assertRaises(ValueError):
            await telegram_cli._send_media_message(client, "entity", Path("./x.png"), "bogus", None, None)
        self.assertEqual(client.high_level_calls, [])
        self.assertEqual(client.sent_requests, [])


if __name__ == "__main__":
    unittest.main()
