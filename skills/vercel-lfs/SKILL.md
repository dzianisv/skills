# Vercel + Git LFS: Deployment Guide

## Trigger phrases
- "videos not loading on Vercel"
- "LFS files not served"
- "Vercel serving pointer files"
- "15 bytes instead of video"
- "text/plain for video"
- "deploy site with LFS assets"

---

## How Vercel handles LFS

Vercel has **two deployment modes**, and they behave differently with LFS:

### 1. Git-source API (`gitSource` in REST API)
Vercel clones the repo from GitHub but **does NOT fetch LFS objects**.
LFS pointer files (~15 bytes) are deployed as-is.

**BUT**: Vercel detects pointer files and serves a `307` redirect to `media.githubusercontent.com`:
```
HTTP/2 307
location: https://media.githubusercontent.com/media/<owner>/<repo>/main/public/file.webm
```

- **Private repo** → `media.githubusercontent.com` returns `404` → videos broken
- **Public repo** → `media.githubusercontent.com` returns `200` + actual content → videos work

### 2. File-upload (`vercel deploy --prebuilt`)
Vercel receives actual file bytes. LFS files must be fetched during CI before build.
Requires `actions/checkout@v4` with `lfs: true`.

---

## Decision tree

```
Are LFS assets large (videos, binaries)?
│
├── YES: Is the repo public?
│   ├── YES → Use git-source API deployment. LFS redirect to GitHub CDN works automatically.
│   └── NO  → Either:
│             (a) Make repo public (simplest — CDN redirects start working)
│             (b) Use file-upload deploy with LFS checkout in CI (see workflow below)
│
└── NO (just a few small files) → Commit directly, avoid LFS
```

---

## Option A: Make repo public (simplest fix)

```bash
# Via GitHub API
curl -s -X PATCH \
  -H "Authorization: token $GH_TOKEN" \
  "https://api.github.com/repos/<owner>/<repo>" \
  -d '{"private": false}'
```

Then re-verify:
```bash
curl -sI "https://www.yoursite.com/video.webm"
# Expect: 307 → media.githubusercontent.com → 200
```

---

## Option B: File-upload deploy with LFS in CI

Use this when repo must stay private.

```yaml
# .github/workflows/deploy.yml
jobs:
  deploy-production:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
        with:
          lfs: true          # ← critical: fetches actual LFS objects

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - name: Build
        run: npx vercel build --prod --token=${{ secrets.VERCEL_TOKEN }}
        env:
          VERCEL_ORG_ID: ${{ secrets.VERCEL_PROJECT_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}

      - name: Deploy
        run: npx vercel deploy --prebuilt --prod --token=${{ secrets.VERCEL_TOKEN }}
        env:
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
```

**Watch out**: Vercel Hobby plan has a **5000 files/deployment** limit. If build output exceeds this, upgrade to Pro or reduce file count.

---

## Diagnosing LFS problems

```bash
# 1. Check what's in LFS
git lfs ls-files

# 2. Test if video is served correctly
curl -sI "https://www.yoursite.com/video.webm"
# BAD:  HTTP 307 + content-type: text/plain + content-length: ~130 (pointer)
# BAD:  HTTP 404
# GOOD: HTTP 307 → GitHub CDN → 200 with actual content-type (video/mp4, audio/webm)
# GOOD: HTTP 200 with actual content-type

# 3. Follow the redirect manually
LOCATION=$(curl -sI "https://www.yoursite.com/video.webm" | grep -i location | awk '{print $2}' | tr -d '\r')
curl -sI "$LOCATION" | grep -E "HTTP|content-type|content-length"
```

---

## GitHub Actions budget exhaustion (private repos)

Symptom: jobs fail immediately with 0 steps, `runner_id: 0`.

Check via API:
```bash
curl -s -H "Authorization: token $GH_TOKEN" \
  "https://api.github.com/repos/<owner>/<repo>/check-runs/<check_run_id>/annotations" \
  | python3 -c "import sys,json; [print(a['message']) for a in json.load(sys.stdin)]"
# → "The job was not started because an Actions budget is preventing further use."
```

Fix: make repo public (Actions are unlimited for public repos), or add billing.

---

## Required GitHub secrets

For Vercel deployments via CI:

| Secret | Where to find |
|--------|--------------|
| `VERCEL_TOKEN` | Vercel dashboard → Settings → Tokens |
| `VERCEL_ORG_ID` | `.vercel/project.json` → `orgId` |
| `VERCEL_PROJECT_ID` | `.vercel/project.json` → `projectId` |

Set via browser at: `https://github.com/<owner>/<repo>/settings/secrets/actions`
