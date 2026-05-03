const { app, BrowserWindow, shell } = require("electron");
const path = require("path");

// ─── CONFIGURE THIS ──────────────────────────────────────────────────────────
// Set POKER_FRONTEND_URL to your GitHub Pages URL before building the exe.
// e.g.  https://yourusername.github.io/your-repo-name/
// You can also pass it as an environment variable at build time.
const FRONTEND_URL =
  process.env.POKER_FRONTEND_URL ||
  "https://REPLACE_WITH_YOUR_GITHUB_PAGES_URL";
// ─────────────────────────────────────────────────────────────────────────────

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: "Poker",
    backgroundColor: "#0a6b2c",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  win.removeMenu();

  // Open external links in the system browser, not inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.loadURL(FRONTEND_URL);

  win.webContents.on("did-fail-load", (_e, code, desc) => {
    // If the hosted page fails (e.g. offline), show a simple error page.
    const msg = encodeURIComponent(
      `Could not load the game frontend.\n\n${desc} (${code})\n\nURL: ${FRONTEND_URL}\n\nMake sure you are connected to the internet.`
    );
    win.loadURL(
      `data:text/html,<html><body style="background:#053418;color:#f3f3f3;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center"><div><h1 style="color:#f0c14b">POKER</h1><pre style="white-space:pre-wrap;max-width:600px">${decodeURIComponent(msg)}</pre><button onclick="location.reload()" style="margin-top:16px;padding:8px 24px;font-size:14px;cursor:pointer">Retry</button></div></body></html>`
    );
  });

  win.once("ready-to-show", () => {
    if (win) win.show();
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
