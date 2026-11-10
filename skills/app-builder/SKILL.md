---
name: app-builder
description: how to build, test and ship an Android app end to end as an AI agent — Google AI Studio first, then GitHub CI, emulator smoke tests, and a real-phone proof gate.
---

Learned building Convert264 (dzianisv/h264-converter, v0.1.0–v0.1.8, Nov 2026). Reference implementation for the CI and test setup below lives there.

## 1. Build FIRST in Google AI Studio

Free, prompt-based, generates Kotlin + Jetpack Compose native Android apps, embedded Android Emulator in the browser, no local setup: https://aistudio.google.com/welcome — start at https://ai.dev/apps?features=build_android_app.

- Its emulator often never connects in a cloud/headless browser (stuck on "Connecting to device..." for 40+ min across sessions). After one fresh reload + ~10 min, stop waiting and move to the ZIP export below.
- GitHub export from AI Studio: if the AI Studio GitHub App is already installed for the account, the link flow loops to GitHub app-settings instead of back to AI Studio's callback — no repo is created. Do NOT uninstall/reinstall the app. Use Export → Download as .zip, then `gh repo create` + git push from the CLI.
- AI Studio offers no APK download — its Install button is USB-only. The APK comes from CI after handoff.
- With a Google Play developer account, AI Studio can publish directly to an internal testing track (it auto-creates the app record, packages the bundle, uploads to Play Console).

## 2. Handoff to Android Studio / local dev

- GitHub repo first; rename `com.example` to a real applicationId before the first release.
- Keep `versionCode`/`versionName` in sync with the release tag.
- Transcoding: FFmpeg cannot be bundled in AI Studio — use AndroidX Media3 Transformer as the transcoder there. FFmpeg only after handoff to Android Studio/local dev.

## 3. CI — three workflows

All on `ubuntu-latest`, Temurin 17, `gradle/actions/setup-gradle` for caching, `platforms;android-36` + `build-tools;36.0.0` via sdkmanager. CI-generated keystore = debug-signed — say so in the release notes (a future properly-signed build needs a reinstall, not an update).

- **Android PR** (push to main / PR): unit tests + `assembleDebug`, upload the debug APK as an artifact.
- **Android Release** (push tag `v*`): unit tests + `assembleRelease`; aapt2 merged-manifest audit (`dump badging` — package name, versionName == tag, expected permissions); aapt2 share-intent audit (`dump xmltree` — SEND / SEND_MULTIPLE / VIEW present, `video/*`, `content` + `file` schemes); dex-not-obfuscated check (e.g. `Lkotlin/coroutines/Continuation;` present in classes.dex); publish with `softprops/action-gh-release`.
- **Emulator Smoke Test** (push tag `v*` + workflow_dispatch): `reactivecircus/android-emulator-runner` (Linux + KVM, x86_64, google_apis, API 35, Pixel profile, `-gpu swiftshader_indirect -noaudio -no-boot-anim`), runs the instrumented test suite via `connectedDebugAndroidTest`.

## 4. Emulator smoke testing

- Prefer an in-process instrumented Compose test over an adb/uiautomator driver — the driver flakes on boot timeouts, broken pipes, System UI ANRs, and empty dumps.
- Assert real outcomes, not screenshots alone: output file exists, ffprobe duration matches the trim, success screen shown, share intent loads the video.
- Include a generated sample clip / Try Sample Clip so the test needs no real file.
- Gate emulator readiness on `ro.build.version.sdk` before starting Gradle.
- Evidence: screenshots at every step + screenrecord chunks, in run-stamped dirs (`tool/smoke-screenshots/<run-id>-<timestamp>/`), never overwritten, uploaded as CI artifacts (30-day retention). LOOK at the screenshots and check the layout (clipped / overlapping / unreadable) — a green test with no visual check is not done.
- Test hardening that proved necessary: screenshot helper must catch Throwable (PixelCopy can throw), retry Compose idle waits, poll MediaStore up to 60s for the scanner to settle.

## 5. Media3 progress — log the state, not just the percent

`Transformer.getProgress()` — log the raw `ProgressState` (NOT_STARTED / WAITING_FOR_AVAILABILITY / AVAILABLE / UNAVAILABLE), never just the percent. Percent ramps on slow encode paths and jumps 0→99 on fast ones (setup takes the time, encode is quick); WAITING is not UNAVAILABLE. While WAITING, show an indeterminate bar + a note that the encoder doesn't report progress yet; show a determinate percent only when Media3 actually reports one. Never fabricate a time-based percent estimate.

## 6. Share intents — the Convert264 lesson

- `ACTION_SEND` + `ACTION_SEND_MULTIPLE`, `video/*`, category DEFAULT, with an explicit `android:label` on the filter (e.g. "Convert to H.264") so the share-sheet entry is unmistakable.
- `ACTION_VIEW` needs BOTH the MIME type AND the scheme (`content` + `file`) — a mimeType-only VIEW filter can never match an intent carrying a `content://` URI and a video type, so the app never appears in "Open with".
- The handler must accept shares whose type is null or `*/*` (common for file managers, Drive, messengers): collect URIs from EXTRA_STREAM (single or list), clipData, and intent.data, and validate by resolver type or file extension — don't trust the MIME type.
- No blanket `*/*` filter — it would put the app in every share sheet.
- Verify in the shipped APK, not just in source: aapt2 `dump xmltree` for the filters, and prove resolution in the emulator with `PackageManager.queryIntentActivities` for SEND / SEND_MULTIPLE / VIEW.
- A null-type or `*/*` sender still cannot *see* the app in the share sheet — that is a platform limitation; the handler accepts such a share if it ever reaches the app.

## 7. UI rules — standard Material 3 components ONLY

- Plain default `TextButton` / `OutlinedButton` / `FilledButton`, `SegmentedButton`, `ListItem`, `RangeSlider`, `LinearProgressIndicator`, stock theme colors and type scale. No custom hex, shapes, elevations, or button styles. Delete the AI Studio template's custom palette.
- No capability claim in the UI without a test proving it — never claim "USB-OTG ready" without a real OTG test on a real device.
- Trim screens must show the video: a real frame at the trim position (re-extracted as the handles move) + a muted preview player. Never just a slider and times. Note: a live player surface photographs as a black box in emulator screenshots (PixelCopy + swiftshader cannot capture it) — prove playback by the advancing position, and photographically verify the paused still frame instead.
- Show real screenshots from smoke runs, never mockups. A claimed artifact is not a delivered one.

## 8. Release discipline

- A version is "built", not "done", until it runs on a real phone — emulator software-encoder behaviour (progress, speed, surface rendering) differs from a hardware encoder.
- If a tagged version fails its own screenshot check, delete the tag/release and ship the fix under the next version; never announce a version that failed verification. (Convert264 went v0.1.4 → v0.1.8 this way: v0.1.5–v0.1.7 were built, failed the check, and were deleted, never announced.)
- Re-inspect the published APK from the release before announcing it: package, versionCode/versionName, dex not obfuscated, intent filters present.
