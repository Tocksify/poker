# Poker — Windows Desktop App (fully self-contained)

A native Windows installer that runs **everything locally** — the game server, SQLite
database, and React frontend are all bundled inside the `.exe`. No internet required
for single-player. Multiplayer works over your local network (LAN or same Wi-Fi).

---

## How multiplayer works

- Each player installs and runs the `.exe` on their own PC.
- **One player is the "host"** — their machine runs the game server.
- In the app, go to **Online Play**. The host sees their LAN IP displayed (e.g. `192.168.1.5:7890`).
- Friends open the app, go to Online Play, paste the host's IP, and click **Connect**.
- Everyone creates an account on the host's server and plays in the host's rooms.
- No port forwarding needed for same Wi-Fi. For cross-network play, the host can
  port-forward TCP 7890 and share their public IP instead.

---

## Requirements (one-time, Windows only)

1. **Node.js LTS** — https://nodejs.org (includes npm)
2. **Windows Build Tools** — needed for the native database addon:
   ```
   npm install -g windows-build-tools
   ```
   *(Run as Administrator in PowerShell. This installs Visual C++ build tools.)*

---

## Building the installer

Open **Command Prompt** or **PowerShell** in this folder:

```
npm install
npm run build
```

Output: `dist/Poker Setup 1.0.0.exe`

> First run downloads Electron (~90 MB) and compiles the native SQLite addon.
> This can take a few minutes. Subsequent builds are fast.

---

## Distributing to friends

Send them `dist/Poker Setup 1.0.0.exe`. They just run the installer — no Node.js or
build tools needed on their end. The app shows up as "Poker" in Start Menu and Desktop.

---

## Testing without building an installer

```
npm install
npm run build:server   # bundles the server only (fast)
npm start              # launches Electron directly
```

---

## Data storage

Each player's accounts, bank balance, and cosmetics are stored in a SQLite file on
their own PC at:

```
%APPDATA%\poker-desktop\poker.db
```

Accounts are local to whichever server you're connected to. If you play on your own
machine, your account is in your local DB. If you connect to a friend's server, your
account lives in their DB.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "Port 7890 already in use" | Close any other Poker instance, or check Task Manager for a stale process |
| Friends can't connect | Make sure you're on the same Wi-Fi, or port-forward TCP 7890 |
| Blank window / white screen | Wait a few seconds — the server is still starting |
| Build fails on `better-sqlite3` | Run `npm install -g windows-build-tools` as Administrator first |
| `EPERM` or permission errors | Run Command Prompt as Administrator |
