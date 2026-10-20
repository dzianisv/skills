---
name: flutter-android-release
description: 'Build, verify and release a Flutter Android app via GitHub Actions so a broken first-run flow can never ship green. Covers the CI build, merged-manifest audit, emulator smoke test and icon checks. Use when building, releasing or debugging a Flutter Android app or its release workflow, especially one with first-launch downloads, foreground services or on-device ML models.'
---

# flutter-android-release

Build and release a Flutter Android app through GitHub Actions, with hard
verification gates between "CI is green" and "tell the user it is ready".

Born from a real failure: v0.2.2 of an on-device AI tutor app shipped with
all tests green, but its first-launch model download failed on Android 14+
and its launcher icon was cropped badly by circular masks. Every gate
below exists because one of those failures reached a user.

## Environment facts

- Some sandboxes cannot run Gradle at all (blocked Java TCP kills the
  Gradle daemon's loopback IPC). Do not burn time retrying local builds
  there. GitHub Actions is the canonical build path.
- Toolchain that works: Temurin JDK 17, Flutter pinned (for example
  3.47.7) via subosito/flutter-action, `flutter build apk --release
  --target-platform android-arm64`.
- If the repo snapshot cannot carry binaries, run
  `flutter create --platforms=android,ios --org <org> --project-name <name> .`
  in CI to regenerate template files before `flutter pub get`.

## Release flow

1. Bump the version in `pubspec.yaml` AND the release tag, APK file name
   and release title in the workflow in the same commit. They must match.
2. Run `flutter analyze` (zero errors) and `dart format` before pushing.
3. Push to main. The workflow runs `flutter test`, builds the release APK
   and publishes a GitHub Release.
4. Watch the run to completion (`gh run watch`). Never announce a build
   before it is green.

## Gate 1 — audit the merged manifest in the built APK

Unit tests and the Dart compiler cannot see the merged Android manifest.
Plugins put real duties on the host app, and a missing one fails only on
a device. After building, inspect the APK itself:

```bash
AAPT2=$(ls "$ANDROID_HOME"/build-tools/*/aapt2 | sort -V | tail -1)
"$AAPT2" dump badging app-release.apk | grep uses-permission
"$AAPT2" dump xmltree app-release.apk --file AndroidManifest.xml
```

- Assert every permission and service attribute your features need is
  actually present in the merged result, and make the CI build FAIL if
  one goes missing.
- Long foreground downloads on Android 14+ need all of: `INTERNET`,
  `ACCESS_NETWORK_STATE`, `FOREGROUND_SERVICE`,
  `FOREGROUND_SERVICE_DATA_SYNC`, `POST_NOTIFICATIONS`, `WAKE_LOCK`, plus
  a `SystemForegroundService` manifest entry (tools:node="merge") with
  `android:foregroundServiceType="dataSync"`. Missing any piece means the
  download dies when the foreground service starts.
- Read the plugin's own example app manifest and platform setup docs.
  They are the spec for host-app duties (for flutter_edge_ai this also
  includes the `libvndksupport.so` / `libOpenCL.so` uses-native-library
  entries the GPU backend needs on Android 12+).

## Gate 2 — emulator smoke test of the first-run flow

Green tests plus a green build do not prove the app works. Before
calling a release ready, run the critical first-run flow in an emulator:

- Run the emulator where it can actually boot: Linux + KVM with an
  x86_64 google_apis image (API 35) works in GitHub Actions; the macOS
  arm64 route failed to boot (HVF error) in practice. If the flow under
  test is ABI-independent platform code (e.g. a download — native libs
  load later), a fat debug APK on x86_64 is a valid route; keep
  ABI-bound claims (on-device inference) out of this gate.
- Install the APK, launch the app, and drive the real UI: dump the UI
  hierarchy (`adb shell uiautomator dump`), find the control, tap its
  bounds center. Never hard-code tap coordinates. Flutter exposes
  widget labels as `content-desc` in uiautomator dumps, NOT `text` —
  match both attributes, and poll for the control (first frames can
  dump empty); scroll if the screen's title is present but the
  control is below the fold.
- Pre-grant runtime permissions the flow needs (`adb shell pm grant`)
  so permission dialogs cannot stall the test.
- Require the real outcome, not a screenshot: UI progress advancing AND
  the payload bytes on disk across the WHOLE app data dir
  (`adb shell run-as <pkg> du -sm .` — the installed payload may not
  live in `files/`; a downloader temp file moving out of `files/` at
  completion looks exactly like a deletion if you measure only there).
  Fail fast the moment the app shows an error string.
- Bytes are not enough: after the payload lands, dump the UI once more
  and require that the app has LEFT the first-run screen (no setup
  title, no error). A release can pass every byte check while the
  post-download step is broken.
- Reference implementation: `.github/workflows/emulator-smoke.yml`
  (reactivecircus/android-emulator-runner) plus a `tool/` shell script
  in the app repo.

## Gate 3 — re-inspect the published artifact

- Download the APK from the published release (`gh release download`)
  and re-check it: package id, versionName and versionCode against
  pubspec, permissions, native libraries present (`unzip -l`), size sane.
- Confirm the dex is NOT obfuscated: `Lkotlin/coroutines/Continuation;`
  must appear in `classes*.dex`. An obfuscated release renames Kotlin
  classes (Continuation became `jb`), and plugins that resolve JVM
  methods BY NAME at runtime — shared_preferences_android's JNI/pigeon
  bridge — then die with `NoSuchMethodError` when they first save
  state (in the tutor app: "Download failed" at model-install time on
  the user's phone, while every debug/emulator run stayed green —
  debug builds never obfuscate). Keep `isMinifyEnabled = false` and
  `isShrinkResources = false` explicit in the release build type for
  prototypes, and fail the CI build if the descriptor disappears.
- Verify every asset the app downloads at runtime with `curl -I` on the
  exact URL: expect a 200 after redirects and a content-length matching
  the documented size, from an ungated source.

## Gate 4 — check the launcher icon in real masks

- Adaptive icon foregrounds must be transparent-background art composed
  for the central 66 percent safe zone. A full-bleed photo gets cropped
  by circle and squircle masks — key details at the edges (faces, props,
  speech bubbles, feet) will be cut.
- Before shipping, render the final icon inside a circle mask at 192 px
  and at 48 px and look at both. The subject and its key prop must sit
  fully inside the circle, and the icon must still read at 48 px.
- Regenerate every density plus the iOS sizes from the fixed master in
  the same pass.

## Signing honesty

- If CI builds are debug-signed (release keystore not in CI), say so in
  the release notes, and warn that a future properly-signed build will
  need a reinstall rather than an update.

## Definition of done

A release is done only when all of these hold: CI green, merged manifest
audit passed, emulator smoke test green, published artifact re-inspected,
and the user has run the first-launch flow on a real device. Anything
less is "built", not "done" — report it that way.
