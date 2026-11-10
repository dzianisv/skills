---
name: podcast-audio
description: Turn research or a topic into a listenable podcast-style audio file and get it playing on the user's phone. Use when asked to "record a podcast", "make audio of this", "turn this into something I can listen to", "I don't have time to read", or "podcast about X". Not for verbatim readings of supplied text (use spoken-audio) or for a researched episode published to a podcast feed (use generate_podcast).
---

# Podcast Audio

Turn a topic the user already discussed into a short spoken episode they can listen to instead of reading. Outcome: one audio file, in a format that actually plays on their phone, plus the script saved next to it.

## Script

- Write for listening, not reading. Natural speech, one voice labelled `Narrator:` unless a dialogue helps the listener follow.
- Spell out every number, abbreviation and URL as it should sound ("a thousand shares", "two hundred and eighty eight dollars"). No Markdown, no citation markers, no links in the spoken text — put links in the chat message that carries the audio.
- Length: ~150 words per minute. 15 minutes ≈ 2,200 words max. A 1,686-word script renders as 11 min 20 sec.
- Save the script as `<slug>-script.txt` next to the audio, so the user can read along later.

## Synthesize

- Synthesize with `/opt/hatch/bin/tts` through `muse.exec`, following `/opt/muse/skills/spoken-audio/references/speech.md` for commands, voice choice and failures. Default voice is Helio (`avocado_v2:MAI_03`) unless the user picks another. Never say "MAI" to the user.
- Save under `~/workspace/your_files/<slug>.mp3` and use the `path` the command returns.
- Default TTS output is MP3, 24 kHz, mono, 64 kbps. Verify with `ffprobe` (duration, codec, sample rate, channels, size) before doing anything else.

## Format ladder — in this order, stop at the first one that plays

The raw 24 kHz mono MP3 does not play on the user's Android chat player. Never deliver it first. Work the ladder; each step isolates a different failure.

1. **44.1 kHz stereo MP3 (deliver this first).** Re-encode, then attach the file directly in chat:
   `ffmpeg -i <slug>.mp3 -ar 44100 -ac 2 -b:a 128k <slug>-44100.mp3`
   11 min ≈ 10.9 MB. Attach as `![Podcast](sandbox://workspace/your_files/<slug>-44100.mp3)` on its own line.
2. **Plain-text link.** If tapping the attachment does nothing, send the file link as plain text in a code block so the user can copy-paste it into a browser or download app. Muse file links expire in ~2 days — state the expiry date in the message.
3. **Split into ~3-minute parts.** If the link also does nothing, split the 44.1 kHz file and ask the user to tap Part 1:
   `ffmpeg -i <slug>-44100.mp3 -f segment -segment_time 180 -c copy part-%02d.mp3`
   Each part ≈ 2.8 MB. If Part 1 plays, the problem was the 11-minute file. If it still does nothing, the problem is the app player, not the file.
4. **WAV fallback.** Only if MP3 keeps failing:
   `ffmpeg -i <slug>.mp3 -ar 22050 -ac 1 <slug>-small.wav`
   11 min ≈ 29 MB. Do not make a full 44.1 kHz stereo WAV — ~120 MB for 11 min, too large to upload.
5. **Stop re-encoding.** If the parts and the WAV also do nothing on tap, say so plainly: it is the app's audio player, not the file. Offer another route (another device, or a host the user can open) instead of another format.

## Deliver

- One audio file per message where possible; parts go out as separate attachments in one turn, labelled Part 1–N with what each covers.
- Send every link as plain text in a code block, with its format, size and expiry. Link taps can do nothing in the user's chat client; a copy-pasteable link is the fallback that works.
- Never deliver a failed or partial render as finished. Keep a failed render apart from the finished file.

## Done when

- `ffprobe` confirms the delivered file: expected duration, 44.1 kHz stereo MP3 (or a part/WAV from the ladder), size sane for its length.
- The user confirms it plays, or the ladder is exhausted and the player is named as the blocker.
- Script `.txt` and final audio live side by side under `~/workspace/your_files/`.
