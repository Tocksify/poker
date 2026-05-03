# Poker — Windows Desktop App

A native Windows installer that runs everything locally — the game server, SQLite
database, and React frontend are all bundled inside the `.exe`. No internet required
for single-player. Multiplayer works over your local network (LAN / same Wi-Fi).

The server uses Node.js's **built-in SQLite** (`node:sqlite`, available in Node 22+) —
no Visual Studio, no C++ build tools, no native compilation needed.

---

## Requirements (one-time, build machine only)

- **Node.js 22 or newer** — https://nodejs.org
  *(Your friends who just run the installer don't need Node.js at all.)*

Check your version: `node --version` — it should print `v22.x.x` or higher.
Node.js 24.x works too.

---

## Build the installer

Open **Command Prompt** or **PowerShell** in this folder and run:

```
npm install
npm run build
```

The finished installer will be at:

```
dist\Poker Setup 1.0.0.exe
```

> The first run downloads Electron (~90 MB). Subsequent builds are fast.

---

## Distribute to friends

Send them `dist\Poker Setup 1.0.0.exe`. They double-click it and play.
No Node.js, no extra software needed on their end.

---

## Multiplayer (LAN)

- One player is the **host** — they run the app and share their IP.
- In the app, go to **Online Play**. The host's LAN IP is shown automatically.
- Friends open the app → **Online Play** → paste the host's IP → **Connect**.
- Accounts are stored locally on the host's machine.

---

## Test without building an installer

```
npm install
npm start
```

This opens the Electron window directly without packaging an `.exe`.

---

## Where data is stored

Player accounts, bank balance, and cosmetics are in a SQLite file at:

```
%APPDATA%\poker-desktop\poker.db
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `npm install` fails | Make sure you have Node.js v22 or newer — `node --version` |
| "Port 7890 in use" | Close other Poker instances; check Task Manager for stray processes |
| Friends can't connect | Make sure you're on the same Wi-Fi network |
| Blank window on launch | Wait 5–10 seconds — the local server is starting |
| Build fails with "cannot find icon" | The `assets/icon.ico` file is missing; re-extract the archive |
