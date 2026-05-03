# Poker — Windows Desktop App

A native Windows desktop wrapper for the Poker web app.  
Multiplayer rooms and accounts are hosted on Replit — you just need an internet connection.

---

## Before you build — update the URL

Open `src/main.js` and replace the placeholder on line 8 with your actual deployed URL:

```js
const APP_URL = "https://YOUR-DEPLOYED-URL.replit.app";
```

To get your deployed URL:
1. Go to your Replit project
2. Click **Deploy** (top-right)
3. After deployment, copy the `.replit.app` URL shown

---

## Requirements (one-time setup on Windows)

1. Install **Node.js** (LTS): https://nodejs.org  
   *(includes npm — no other tools needed)*

---

## Build the installer

Open **Command Prompt** or **PowerShell** in this folder, then run:

```
npm install
npm run build
```

This produces `dist/Poker Setup 1.0.0.exe` — a standard Windows installer.  
Double-click it to install, and a **Poker** shortcut appears on the Desktop.

> First build downloads Electron (~90 MB). Subsequent builds are fast.

---

## Distribute to friends

Send your friends the file: `dist/Poker Setup 1.0.0.exe`

They just run it, click through the installer, and open Poker from the Desktop shortcut.  
No other setup is needed on their side.

---

## Test without building

To run the app locally without building an installer:

```
npm install
npm start
```

---

## Updating the app

The desktop app always loads the latest version from the server — no reinstall needed when you push changes to Replit. Only rebuild the `.exe` if you want to change app window settings.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "Cannot connect to server" screen | Check internet connection; make sure the Replit app is deployed |
| Blank white window | The URL in `src/main.js` may be wrong or the app isn't deployed yet |
| Build fails on `electron-builder` | Make sure Node.js is installed and you're in the `poker-desktop` folder |
