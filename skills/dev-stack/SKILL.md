---
name: dev-stack
description: how to build the {android, webapp, ios, backend} application by AI agent. 
---

1. setup a github repo if not yet
2. setup the ci for the required platform, use the most appropriate docker image as a base, for instance
3. for backend if needed select from 
- netlify: [Netlify CDN (Edge)](https://docs.netlify.com/platform/cdn/), [Netlify Functions](https://docs.netlify.com/functions/overview/) — skill: https://skills.sh/netlify/context-and-tools/netlify-deploy
- cloudflare: [Cloudflare CDN (Pages)](https://developers.cloudflare.com/pages/), [Cloudflare Workers (Functions)](https://developers.cloudflare.com/workers/), [Cloudflare D1 (SQL)](https://developers.cloudflare.com/d1/), [Cloudflare KV (NoSQL)](https://developers.cloudflare.com/kv/) — skill: https://skills.sh/firecrawl/skills/cloudflare-deploy
- firebase: [Firebase Hosting](https://firebase.google.com/docs/hosting), [Firebase Authentication](https://firebase.google.com/docs/auth), [Cloud Functions for Firebase](https://firebase.google.com/docs/functions), [Cloud Firestore](https://firebase.google.com/docs/firestore) — skill: https://skills.sh/firebase/agent-skills/developing-genkit-dart
- webapp: Next.js (App Router) + React + TypeScript + Tailwind CSS + shadcn/ui (https://ui.shadcn.com) — deploy to Vercel/Cloudflare Pages/Netlify
- to build the android app for most cases use Google AI Studio (free, prompt-based, no local setup): https://aistudio.google.com/welcome — start a project at https://ai.dev/apps?features=build_android_app. It generates Kotlin + Jetpack Compose native Android apps from a single prompt, with an embedded Android Emulator in the browser for preview/iteration. No SDK install needed. Workflow:
  1. Open https://ai.dev/apps?features=build_android_app and describe the app in a prompt (native Android, Kotlin + Jetpack Compose; can target phone, Pixel Watch, Pixel Fold, etc.).
  2. Iterate using the embedded Android Emulator in the browser; preview and interact with the app as it builds.
  3. Publish for testing: with a Google Play developer account, publish directly from AI Studio to an internal testing track (AI Studio auto-creates the app record, packages the bundle, uploads to Google Play Console).
  4. Hand off when needed: export the project to Android Studio via ZIP download or direct GitHub export for advanced tooling, more device types, or team dev; leverage Gemini in Android Studio or Antigravity (Android CLI) for further development.
  - Supported: personal utilities/simple social apps, hardware-enabled experiences (Camera, GPS/Location, Accelerometer, Bluetooth), AI-powered experiences (Gemini API integrations).
  - Coming soon: managing Google Play test tracks, Firebase integrations (Firestore, Auth, App Check).
  - Because AI Studio provides built-in emulator and cloud build workers, no local CI/dev environment is needed for initial Android development. Only set up CI/GitHub Actions Android build+release when the project is handed off to Android Studio/local dev.

### Android recommendations (learned building Convert264, Nov 2026 — dzianisv/h264-converter, v0.1.0–v0.1.3)
- AI Studio emulator often never connects in a cloud/headless browser (stuck on "Connecting to device..." for 40+ min across sessions). After one fresh reload + ~10 min, stop waiting and move to the ZIP export below.
- GitHub export from AI Studio: if the AI Studio GitHub App is already installed for the account, the link flow loops to GitHub app-settings instead of back to AI Studio's callback — no repo is created. Do NOT uninstall/reinstall the app. Use Export → Download as .zip, then `gh repo create` + git push from the CLI.
- AI Studio offers no APK download — its Install button is USB-only. The APK comes from CI after handoff.
- Transcoding: FFmpeg cannot be bundled in AI Studio — use AndroidX Media3 Transformer as the transcoder there. FFmpeg only after handoff to Android Studio/local dev.
- UI: use standard Material 3 components, do not invent custom ones — plain default `TextButton` / `OutlinedButton` / `Button`, no custom shape, colors, or sizing. Show real screenshots from a smoke run, never mockups.
- Package: rename `com.example` to a real applicationId before the first release; keep `versionCode`/`versionName` in sync with the release tag.
- Progress: Media3 `Transformer.getProgress()` — log the raw `ProgressState` (NOT_STARTED / WAITING_FOR_AVAILABILITY / AVAILABLE / UNAVAILABLE), never just the percent. Percent ramps on slow encode paths and jumps 0→99 on fast ones (setup takes the time, encode is quick); WAITING is not UNAVAILABLE. While WAITING, show an indeterminate bar + a note that the encoder doesn't report progress yet; show a determinate percent only when Media3 actually reports one. Never fabricate a time-based percent estimate.
- CI after handoff (3 workflows): PR (unit tests + debug APK), Release on tag `v*` (`assembleRelease`, aapt2 merged-manifest audit, dex-not-obfuscated check, `softprops/action-gh-release`), Emulator Smoke (reactivecircus/android-emulator-runner, Linux + KVM, x86_64 google_apis API 35). Use `gradle/actions/setup-gradle` for caching. CI-generated keystore = debug-signed — say so in the release notes.
- Smoke test: prefer an in-process instrumented Compose test over an adb/uiautomator driver (the driver flakes on boot timeouts, broken pipes, ANRs, empty dumps). Assert real outcomes — output file exists, ffprobe duration matches the trim, success screen shown — not screenshots alone. Include a generated sample clip / Try Sample Clip so the test needs no real file, and exercise the share intent with an explicit-component `ACTION_SEND`. Gate emulator readiness on `ro.build.version.sdk` before starting Gradle.
- Evidence: screenshots at every step + screenrecord chunks, in run-stamped dirs, never overwritten, uploaded as CI artifacts. Look at the screenshots and check the layout (clipped / overlapping / unreadable) — a green test with no visual check is not done.
- Real-device proof is the final gate: emulator software-encoder behaviour (progress, speed) differs from a hardware encoder. A release is "built", not "done", until it runs on a real phone.

4. setup ci to build an {app,container} and cache the build
   - in case of the docker image publish on github registry
   - in case of android app publish on github release page
   - use `actions/cache` for dependencies and docker layer cache (`type=gha`)
5. write github actions workflows under `.github/workflows/` (see https://docs.github.com/en/actions/writing-workflows)
   - trigger on push/pull_request; use matrix for node/python versions
   - cache with `actions/setup-node` `cache: npm` / `actions/setup-python` `cache: pip`
   - build, lint, typecheck, test; upload artifacts with `actions/upload-artifact`
   - deploy step gated on main branch with environment protection
### Example: Android build + release on tag

```yaml
# .github/workflows/android-release.yml
name: Android Release
on:
  push:
    tags: ['v*']
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 17
      - uses: gradle/gradle-build-action@v3
        with:
          cache-disabled: false
      - run: ./gradlew assembleRelease
      - uses: softprops/action-gh-release@v2
        with:
          files: app/build/outputs/apk/release/*.apk
```

### Example: Cloudflare Pages + Workers deploy

```yaml
# .github/workflows/cloudflare-deploy.yml
name: Cloudflare Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci && npm run build
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: pages deploy ./dist --project-name=my-app
``` 

### Docker base images (short)

- Android: `eclipse-temurin:17-jdk` + Android SDK via sdkmanager; or `registry.gitlab.com/szndev/ci-droid:latest`
- iOS: macOS runners required; cross-compile via `mobaiapp/iosbox` only if needed
- Go: `golang:1.24-alpine` (static) / `golang:1.24-bookworm` (CGO)
- TS/Node: `node:22-alpine` (multi-stage build)
- Python: `python:3.12-slim`
- Firebase: `node:lts-slim` + `npm i -g firebase-tools`
- Netlify: `node:lts-slim` + `npm i -g netlify-cli`
- Cloudflare: `node:lts-slim` + `npm i -g wrangler`

7. test
    - the android apps in emulator. record video, analyze. test end to end. most of the issues could be resolved
      - make screenshots. 
      - check out layout
      - check out that functionality works end to end
    - test the webapp using available browser tools. 
      - make screenshots. 
      - check out layout
      - check out that functionality works end to end

# Plannign and execution

Follow this rules for better planning and context engineering

1. Review codebase first to get the idea
2. Think about the implementation design as system designer
3. Draw the system design and components diagram in mermaid
4. Draw the user flow diagram
5. Now when yo uunderstand the system and how it iterract, think on impmenetation plan
6. Put implementation plan and diagram on github issue 
7. If split work if could be done in parallel. 
8. Start subagetns of model of your choice that fits the best every task to complete
9. Review subagents work. Commit. Push. Deliver.