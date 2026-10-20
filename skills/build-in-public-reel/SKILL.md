---
name: build-in-public-reel
description: 'Turn a short raw clip (about 10s) plus a one-line work story into a viral-ready build-in-public package: a vertical Reel with the story burned in as timed text cards, an X thread, and an Instagram caption, with every number verified live before it is used. Use when asked to "build in public", "make a reel/story from this video", "add this story to my clip", "make it viral", "turn today''s work into an X thread and Instagram post", or when a model/product launch needs OpenRouter benchmarks pulled for a post.'
---

# build-in-public-reel

Produce, from one raw clip and one rough story line, a package that is
ready to post without further editing:

1. A vertical video (1080x1920, same length as the source) with the story
   as timed, burned-in text cards.
2. An X thread (4-6 posts) that tells the same story with proof numbers.
3. An Instagram Reel caption with hashtags.
4. A sources section listing where every number came from.

Born from a real post (Oct 20 2026): a 10s 1:30 AM desk clip became
"Microsoft locked my startup account completely -> I rebuilt my Hermes
agent team on MiniMax M3.1 Flash + Nemotron 3.5 Super VL", with
OpenRouter benchmarks pulled live the same night.

## Gate 0 — ground the story in the user's own records first

Never write the hook from general knowledge. The user's stories are
usually continuations of real sagas (a billing dispute, a launch, a
lockout). Search memory and the relevant files first and use the verified
figures from those records (amounts, dates, case status), not round or
generic versions.

- If a number cannot be verified from the user's records or a live
  source checked today, leave it out. A viral post with one wrong number
  costs more trust than it earns reach.
- Keep the user's own stated position/framing on contested topics. Do
  not soften or re-argue their dispute in their own post.

## Step 1 — resolve the names the user actually means

Founders type fast and phonetically ("minimax m3.1 fast", "nemotein
3.5"). Resolve every product/model name before researching:

- "fast" next to a model name is usually **Flash**; a garbled vendor name
  is usually the closest newly-released model from that vendor.
- Confirm the resolution with a search hit that matches all of: vendor,
  version number, and a release date within the last few days ("newly
  released" in the user's message is a constraint, not flavour).
- Look inside the clip itself for confirmation: terminals and screens in
  frame often show the exact model slug/config the user is running.
  Quote that slug in the copy — it is first-party proof.

## Step 2 — pull benchmarks live from OpenRouter

For each model, open its OpenRouter model page (not a blog summary) and
record:

- Release date, price per 1M input/output, context window, max output.
- Throughput (tok/s) and latency (p50, best provider), availability (3d).
- Benchmarks shown on the page (e.g. GPQA Diamond, TAU-Bench) with the
  provider that scored them.
- The "Apps" list — a well-known app already running on the model is a
  stronger hook than a benchmark point.

Keep three kinds of numbers separate and labelled in your notes:
OpenRouter-measured (speed/latency/uptime), Artificial Analysis indices
(intelligence/coding/agentic), and vendor-claimed scores (launch-post
benchmarks). Never present a vendor claim as independently measured.

If OpenRouter has no page yet for a just-released model, use its
stealth/preview history and reputable launch coverage, and say which
numbers are vendor-reported in the sources section.

## Step 3 — write the story as 4 timed cards

A 10s clip carries exactly 4 beats. Map the story onto them:

| Card | Time | Job | Example shape |
|---|---|---|---|
| 1 | 0.0-2.8s | Hook: the pain, blunt | "MICROSOFT LOCKED MY STARTUP ACCOUNT. COMPLETELY." |
| 2 | 2.8-5.5s | Pivot: what you did tonight | "SO TONIGHT I REBUILT MY HERMES AGENT TEAM" |
| 3 | 5.5-8.1s | Reveal: the new thing(s), named | "NEW BRAINS: MiniMax M3.1 Flash / Nemotron 3.5 Super VL" |
| 4 | 8.1-end | Proof + principle: numbers, then the lesson | "1M CONTEXT - 255 TOK/S / $0.15 / 1M TOKENS / OPEN MODELS CAN'T BE LOCKED." |

Rules:

- One idea per card, max 4 short lines, max ~7 words per line. If it does
  not fit, cut words, never shrink the font below readability.
- Card 4 ends on a principle the audience can repeat ("open models can't
  be locked"), not on a spec.
- Add one persistent top bar for series identity and context:
  "BUILD IN PUBLIC - 1:30 AM - SF" (time/place from the clip's real
  metadata and story).

For longer clips, scale at ~2.5s per card and keep the same 4 jobs —
merge beats, do not add new ones.

## Step 4 — burn the cards into a vertical video

```bash
ffprobe -v error -show_entries format=duration \
  -show_entries stream=width,height,codec_name in.mp4
ffmpeg -y -v error -i in.mp4 -vf "select=eq(n\,30)" \
  -vframes 1 /tmp/frame.jpg   # look at this frame before editing
```

- **Check rotation metadata before assuming orientation.** Phone clips
  often probe as 1920x1080 but carry a rotation tag; ffmpeg
  auto-rotates on decode, so the extracted frame — not the probe size —
  is the truth about orientation and content.
- Write each card to its own text file and use `textfile=` in drawtext.
  Inline text in the filter string breaks on apostrophes and colons.
- Render: `scale=1080:1920:force_original_aspect_ratio=increase,
  crop=1080:1920`, font DejaVuSans-Bold (or Noto Sans Bold), 54-58px for
  cards, 34px for the top bar, white text on `box=1:boxcolor=black@0.55:
  boxborderw=22`, centered `x=(w-text_w)/2`, cards at `y=150`, top bar at
  `y=56`. Final card in yellow for the payoff.
- Time each card with `enable='between(t,<start>,<end>)'`.
- Encode `libx264 -crf 18 -preset medium -pix_fmt yuv420p`, audio to AAC
  128k, `-movflags +faststart`. Output lands next to the copy, named
  `<slug>-reel.mp4`.

## Gate 5 — inspect stills from the finished video

Never deliver an unviewed render. Extract a still from the first card
and the last card (`ffmpeg -ss 1` / `-ss 9`) and look at both:

- Text fully inside the frame, no line clipped at the edges.
- Cards appear in the right order at the right times.
- The underlying clip still reads (subject visible, not buried under
  boxes).

Fix and re-render on any failure. "ffmpeg exited 0" is not verification.

## Step 6 — write the copy pack

Save everything to `~/workspace/build-in-public/<YYYY-MM-DD>-<slug>/`:
the reel as `<slug>-reel.mp4` and `post-copy.md` containing:

**X thread (4-6 posts)**
1. Hook post = card 1 + the verified stakes (amounts/dates from Gate 0)
   + "🧵". The hook must stand alone if nobody expands the thread.
2. The reveal: what was switched/built, with release dates ("released
   YESTERDAY" beats "recently").
3. One post per proof subject (per model): the 3-4 best OpenRouter
   numbers, plus one story fact (stealth run, top app, token volume).
4. Closing post: the principle from card 4, what happens next
   ("results tomorrow"), and the series promise. Hashtags last post
   only, 3-4 max.

**Instagram caption**
Same hook first line, stakes in line 2, reveal as short emoji-bulleted
lines, principle as the kicker, "follow the build" CTA, then a hashtag
block (8-10, specific over generic).

**Sources section**
One bullet per model: page URL, the exact figures used, and which kind
of measurement each is. This section is for the user, not for posting —
it is how they can defend every number in replies.

## Posting gate

- Deliver the video as an attachment and the thread opener in chat.
  Never post under the user's identity without their explicit go-ahead
  for that specific post.
- Before promising an Instagram post, check whether the account is
  actually linked/connected. If it is not, say so plainly and hand over
  the reel for manual upload instead of implying it will auto-post.

## Definition of done

- [ ] Story figures verified against the user's records (Gate 0).
- [ ] Every benchmark traced to a live OpenRouter page opened today,
      with vendor-claimed numbers labelled as such.
- [ ] Reel is 1080x1920, source length, 4 timed cards + top bar.
- [ ] First-card and last-card stills inspected and clean (Gate 5).
- [ ] `post-copy.md` holds the X thread, IG caption, and sources.
- [ ] Nothing posted anywhere without the user's per-post go-ahead.
