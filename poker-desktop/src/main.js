const { app, BrowserWindow, shell, ipcMain } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const http = require("http");

const PREFERRED_PORT = 7890;
let resolvedPort = null;
let serverProcess = null;
let mainWindow = null;

if (require("electron-squirrel-startup")) {
  app.quit();
}

function startServer() {
  return new Promise((resolve, reject) => {
    const serverBundle = path.join(__dirname, "server-bundle.cjs");
    const sqlitePath = path.join(app.getPath("userData"), "poker.db");
    const staticDir = path.join(process.resourcesPath || __dirname, "frontend");

    serverProcess = spawn(process.execPath, [serverBundle], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        PORT: String(PREFERRED_PORT),
        SQLITE_DB_PATH: sqlitePath,
        STATIC_DIR: staticDir,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdoutBuf = "";
    let settled = false;
    const failTimer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error("Server did not start in time"));
      }
    }, 20000);

    serverProcess.stdout.on("data", (data) => {
      const text = data.toString();
      stdoutBuf += text;
      process.stdout.write("[server] " + text);
      const match = stdoutBuf.match(/SERVER_READY:(\d+)/);
      if (match && !settled) {
        settled = true;
        clearTimeout(failTimer);
        resolvedPort = parseInt(match[1], 10);
        resolve(resolvedPort);
      }
    });

    serverProcess.stderr.on("data", (data) => {
      process.stderr.write("[server] " + data.toString());
    });

    serverProcess.on("exit", (code) => {
      serverProcess = null;
      if (!settled) {
        settled = true;
        clearTimeout(failTimer);
        reject(new Error(`Server exited early with code ${code}`));
      }
    });
  });
}

function waitForServer(port, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    function attempt() {
      http.get(`http://localhost:${port}/api/healthz`, (res) => {
        if (res.statusCode === 200) resolve(true);
        else retry();
      }).on("error", retry);
    }
    function retry() {
      if (Date.now() - start > timeout) {
        reject(new Error(`Server on port ${port} did not respond in time`));
        return;
      }
      setTimeout(attempt, 300);
    }
    attempt();
  });
}

function showLoadingScreen(win) {
  win.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: "Microsoft Sans Serif", Tahoma, sans-serif;
          background: radial-gradient(ellipse at center, #1a5c32 0%, #0d3319 70%, #061a0d 100%);
          color: #e8d5a0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100vh;
          gap: 18px;
        }
        h2 { font-size: 22px; letter-spacing: 1px; }
        p { font-size: 12px; opacity: 0.6; }
        .dots { font-size: 20px; animation: pulse 1.2s infinite; }
        @keyframes pulse { 0%,100%{opacity:.3} 50%{opacity:1} }
      </style>
    </head>
    <body>
      <h2>Poker</h2>
      <div class="dots">● ● ●</div>
      <p>Starting local server...</p>
    </body>
    </html>
  `)}`);
}

async function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: "Poker",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      partition: "persist:poker-desktop",
    },
    backgroundColor: "#0d3319",
    show: false,
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith("http://localhost") && !url.startsWith("http://127.")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("http://") && !url.startsWith("https://")) event.preventDefault();
  });

  showLoadingScreen(mainWindow);

  try {
    await waitForServer(port);
    mainWindow.loadURL(`http://localhost:${port}`);
  } catch (err) {
    console.error("[main] Failed to connect to server:", err.message);
    mainWindow.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
      <!DOCTYPE html>
      <html><body style="font-family:Microsoft Sans Serif,Tahoma,sans-serif;background:#0d3319;color:#e8d5a0;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:12px;">
        <h2>Failed to start server</h2>
        <p>Please close the app and reopen it.</p>
      </body></html>
    `)}`);
  }
}

ipcMain.handle("navigate-to", (_event, url) => {
  if (mainWindow && typeof url === "string" && url.startsWith("http://")) {
    mainWindow.loadURL(url);
  }
});

ipcMain.handle("go-home", () => {
  if (mainWindow && resolvedPort) {
    mainWindow.loadURL(`http://localhost:${resolvedPort}`);
  }
});

app.whenReady().then(async () => {
  try {
    const port = await startServer();
    await createWindow(port);
  } catch (err) {
    console.error("[main] Server startup failed:", err.message);
    app.quit();
    return;
  }

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow(resolvedPort || PREFERRED_PORT);
    }
  });
});

app.on("window-all-closed", () => {
  if (serverProcess) {
    serverProcess.kill("SIGTERM");
    serverProcess = null;
  }
  app.quit();
});

app.on("before-quit", () => {
  if (serverProcess) {
    serverProcess.kill("SIGTERM");
    serverProcess = null;
  }
});