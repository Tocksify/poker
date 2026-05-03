# Poker Desktop App — Setup Guide

The `.exe` loads the frontend from GitHub Pages and talks to the backend on Render.
No local bundling needed — just build the tiny Electron shell.

---

## Step 1 — Push this repo to GitHub

Make sure this project is in a GitHub repository.

---

## Step 2 — Enable GitHub Pages

1. Go to your repo → **Settings** → **Pages**
2. Under **Source**, choose **GitHub Actions**
3. Save

---

## Step 3 — Set the backend secret

1. Go to your repo → **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Name: `VITE_API_BASE_URL`
4. Value: your Render backend URL, e.g. `https://poker-backend-xxxx.onrender.com`
5. Save

---

## Step 4 — Trigger a deploy

Push any change to `main` (or go to **Actions** → **Deploy Poker Frontend to GitHub Pages** → **Run workflow**).

After ~2 minutes your frontend will be live at:

```
https://<your-github-username>.github.io/<your-repo-name>/
```

---

## Step 5 — Build the Windows exe

Open a terminal in `artifacts/poker/electron/` and run:

```powershell
# Set the GitHub Pages URL first (one-time):
$env:POKER_FRONTEND_URL = "https://<your-github-username>.github.io/<your-repo-name>/"

# Install dependencies:
npm install

# Build the installer:
npm run build
```

The `.exe` installer will appear in `artifacts/poker/electron/dist/`.

---

## Optional — Hard-code the URL

If you don't want to set the env var every time, open `main.cjs` and replace:

```js
const FRONTEND_URL =
  process.env.POKER_FRONTEND_URL ||
  "https://REPLACE_WITH_YOUR_GITHUB_PAGES_URL";
```

with your actual URL:

```js
const FRONTEND_URL = "https://yourusername.github.io/your-repo-name/";
```

Then rebuild.
