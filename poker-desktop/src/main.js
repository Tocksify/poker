const { app, BrowserWindow, shell } = require("electron");
const path = require("path");

// ─── IMPORTANT ───────────────────────────────────────────────────────────────
// Set this to your deployed Replit URL after you publish the app.
// It should look like: https://poker.yourusername.replit.app
// Until you deploy, you can test with the dev URL below.
const APP_URL = "https://YOUR-DEPLOYED-URL.replit.app";
// ─────────────────────────────────────────────────────────────────────────────

// Handle Windows installer events
if (require("electron-squirrel-startup")) {
  app.quit();
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "Poker",
    icon: path.join(__dirname, "..", "assets", "icon.ico"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // Allow localStorage and all web APIs to work normally
      partition: "persist:poker",
    },
    backgroundColor: "#1a4a2a",
    show: false,
  });

  // Show window once ready to avoid white flash
  win.once("ready-to-show", () => {
    win.show();
  });

  // Open external links in the system browser, not a new Electron window
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.loadURL(APP_URL);

  // Show a friendly error page if the server is unreachable
  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
    win.webContents.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(`
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              font-family: "Microsoft Sans Serif", Tahoma, sans-serif;
              background: #1a4a2a;
              color: #e8d5a0;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
              gap: 16px;
            }
            h2 { margin: 0; }
            p { margin: 0; opacity: 0.75; font-size: 13px; }
            button {
              margin-top: 8px;
              padding: 8px 24px;
              font-family: inherit;
              font-size: 13px;
              background: #2d7a4a;
              color: #e8d5a0;
              border: 1px solid #4a9a6a;
              cursor: pointer;
            }
          </style>
        </head>
        <body>
          <h2>Cannot connect to server</h2>
          <p>Check your internet connection and try again.</p>
          <p style="font-size:11px;opacity:0.5;">${errorDescription} (${errorCode})</p>
          <button onclick="window.location.reload()">Retry</button>
        </body>
        </html>
      `)}`
    );
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  app.quit();
});
