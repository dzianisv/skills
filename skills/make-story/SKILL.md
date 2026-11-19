# Story/Reel Production — Bilingual Deadpan Cards on Den's Own Video

How to make the vertical Stories/Reels Den likes: his own clip as background, modern filter, bilingual subtitle cards, and a dry sarcastic script. Proven across four productions on 2026-10-29 (final approved version: AirPods/fax story v3). Follow this playbook instead of re-inventing the format each time.

## Format and picture

- Output vertical 1080×1920, H.264 + AAC, `yuv420p`, crf 22, preset veryfast.

- Use Den's own uploaded clip as the background; loop it with `-stream_loop` to cover the total duration and trim with `-t`. Phone clips arrive as 1920×1080 with a rotation tag; ffmpeg applies the rotation on decode, then `scale=1080:1920` gives the upright frame.

- Apply the "Bali" filter chain Den approved (low exposure, muted saturation, teal shadows, warm highlights, light vignette), in this order, BEFORE the subtitles so the text stays crisp:

  `eq=brightness=-0.08:contrast=1.10:saturation=0.85:gamma=0.96,colorbalance=bs=0.14:gs=0.06:rs=-0.04:rm=0.02:rh=0.09:gh=0.04:bh=-0.06,vignette=angle=PI/5`

- Keep the clip's original audio low underneath (`volume=0.5`) with a 2-second fade-out at the end.

## Subtitle style (ASS, burned in)

- Style: font Noto Sans bold, `BorderStyle=3` with `BackColour=&H80000000` (semi-transparent black box behind the text), bottom-centred, `MarginV=260` so the cards sit above the Instagram/Reels UI.

- Two languages on every card: English on top in white (`&HFFFFFF&`, ~fs 60–68), Russian below in yellow, smaller (~fs 44–50). ASS colours are BGR, not RGB — yellow is `&H4DD8FF&`. (Getting this backwards once produced cyan Russian text; check a frame.)

- Generate the `.ass` with a small script that takes (EN, RU, big?) beats and a per-card duration; keep the `.ass` file beside the finished video.

## Script style — the part Den kept correcting until it landed

- Write deadpan short phrases, ONE per card, each ending with a period. Read it as a telegram of absurdity: "Пропали AirPods. На Burning Man. Lost and Found не нашли." Escalate the bureaucracy step by step (claim → denied → another claim → police report → fax) and let the facts be the joke; do not add jokes on top.

- NO backstory. Den rejected two longer versions with history and explanations ("опять какую-то муть написал"). Start at the bare fact, escalate, finish on the purpose or a cliffhanger ("Чтобы получить страховую выплату." / "AirPods всё ещё не нашлись.").

- Punch words get their own card in BIG CAPS, larger font (EN ~fs 130, RU ~fs 115): "ФАКСОМ!" — with the exclamation mark. Repeat the key destination words big too ("ШЕРИФУ", "В НЕВАДУ"). Ordinary cards stay normal size so the big ones hit.

- When Den dictates the text, use it verbatim — fix only obvious speech-recognition typos (Birdingman → Burning Man, немацкую → невадскую). Do not add beats he did not say, do not reorder his punchline, and if he appends a phrase mid-work, insert it where the sentence stays whole and say where you put it.

- Facts only from his records: pull dates, amounts, claim numbers from memory/files before writing beats; never invent a detail for rhythm.

- Tempo: ~2.0 seconds per short-phrase card (2.4s felt slow to him; he asked "чуть быстрее"). Full-sentence cards need ~4.5s.

## Screenshot pop-ins

- When a card says Muse did something ("Агент Muse заполнил PDF."), pop in the chat screenshots Den supplies as small examples at that exact beat: scale to height ~640, add an 8px white border (`pad=iw+16:ih+16:8:8:white`), place side by side in the upper-middle area (y≈430), overlay `enable='between(t,start+0.1,end-0.05)'`.

- Add a "пшых" (whoosh) at the pop-in moment: synthesize it once — white noise 0.45s, bandpass ~750Hz, fast fade-in and fade-out (`anoisesrc`, `bandpass=f=750:w=550`, `afade` in/out) — then `adelay` it to the beat start and `amix` with the background audio at a clearly audible level.

## Render discipline

- Render in the background (`muse.exec background: true`); a ~30s video takes ~2 minutes. Never report the video done from the ffmpeg command alone.

- Verify before delivering: `ffprobe` must return duration/streams (a render killed mid-write leaves an mp4 with no moov atom that fails probe — runtime restarts do kill renders; if probe fails, delete and re-render), and extract + visually check at least two frames: the screenshot-pop-in frame and one big-CAPS frame.

- Deliver the mp4 as an attachment in the reply, with the beat list written out in his dotted style ("Фраза. Точка. Фраза. Точка.") and nothing else extra.
