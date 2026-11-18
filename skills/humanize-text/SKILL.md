---
name: humanize-text
description: >
  Rewrite text to remove AI slop and make it human readable. Cut fluff,
  jargon, and verbose statements. Keep it short, plain English, one short
  statement per point. Use when the user asks to humanize, de-fluff, remove
  AI slop, make text readable, or invokes /no-ai-fluff or /no-ai-slop.
  Triggers on "humanize", "remove AI fluff", "remove AI slop", "make this
  readable", "no-ai-fluff", "no-ai-slop", "plain english", "too verbose".
argument-hint: "[text or file]"
---

# Humanize text

Rewrite the text so a human can read it fast.

## Rules

1. Remove AI slop. Cut filler words, hedges, and empty phrases ("it is important to note", "in order to", "leverage", "delve", "furthermore", "moreover", "in conclusion").
2. Concise. One short statement in plain English per point is enough. If a sentence can be cut in half, cut it.
3. Plain English. Short words, short sentences. No professional jargon. No acronyms without spelling them out once.
4. No verbose statements. Say what happened and what it means. Nothing else.
5. Remove duplication. Say each fact once.
6. Remove anything that no longer matters. Old status, stale dates, dead links, superseded sections. Delete them.

## What stays

Facts, numbers, dates, names, links that still work, decisions, and what to do next. Keep the meaning. Only the words change.

## Output

Return the rewritten text. Keep headings and lists only if they help. If a heading has one line under it, drop the heading.

## Done when

The rewritten text keeps every fact, number, date, name, and decision from the original, contains no banned word or filler phrase from the Rules list, and reads as one short plain-English statement per point. Check: read the rewrite against the original line by line.
