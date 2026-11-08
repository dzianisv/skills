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
- to build the android app for most cases it is enough to login on Google Ai Studio https://aistudio.google.com/welcome and start the android app project https://developer.android.com/blog/posts/build-native-android-apps-in-google-ai-studio. The google ai studio has build-in emulator and the build workers, so we shouldnt' setup ci and dev environment for android app. 

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

