const { app, BrowserWindow, shell, ipcMain } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const http = require("http");

const PREFERRED_PORT = 7890;
const PORT_RANGE = 20; // server will try 7890–7909

let resolvedPort = null; // set once server reports SERVER_READY:<port>
let serverProcess = null;
let mainWindow = null;

if (require("electron-squirrel-startup")) {
  app.quit();
}

// ─── Start the bundled server ──────────────────────────────────────────────────

function startServer() {
  return new Promise((resolve) => {
    const serverBundle = path.join(__dirname, "server-bundle.cjs");
    const sqlitePath = path.join(app.getPath("userData"), "poker.db");
    const staticDir = path.join(
      process.resourcesPath
        ? path.join(process.resourcesPath, "frontend")
        : path.join(__dirname, "..", "resources", "frontend")
    );

    console.log("[main] Starting server:", serverBundle);
    console.log("[main] SQLite path:", sqlitePath);
    console.log("[main] Static dir:", staticDir);

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

    serverProcess.stdout.on("data", (data) => {
      const text = data.toString();
      stdoutBuf += text;
      process.stdout.write("[server] " + text);

      // Parse SERVER_READY:<port> so we know which port was claimed
      const match = stdoutBuf.match(/SERVER_READY:(\d+)/);
      if (match && !resolvedPort) {
        resolvedPort = parseInt(match[1], 10);
        console.log("[main] Server ready on port", resolvedPort);
        resolve(resolvedPort);
      }
    });

    serverProcess.stderr.on("data", (data) => {
      process.stderr.write("[server] " + data.toString());
    });

    serverProcess.on("exit", (code) => {
      console.log("[main] Server process exited with code:", code);
      serverProcess = null;
    });
  });
}

// Poll until the server responds on /api/healthz at the resolved port
function waitForServer(port, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    function attempt() {
      http
        .get(`http://localhost:${port}/api/healthz`, (res) => {
          if (res.statusCode === 200) {
            resolve(true);
          } else {
            retry();
          }
        })
        .on("error", () => {
          retry();
        });
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

// ─── Create window ─────────────────────────────────────────────────────────────

function showLoadingScreen(win) {
  win.webContents.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(`
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
    `)}`,
  );
}

async function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: "Poker",
    icon: path.join(__dirname, "..", "assets", "icon.ico"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      partition: "persist:poker-desktop",
    },
    backgroundColor: "#0d3319",
    show: false,
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith("http://localhost") && !url.startsWith("http://127.")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      event.preventDefault();
    }
  });

  showLoadingScreen(mainWindow);

  const appUrl = `http://localhost:${port}`;

  try {
    await waitForServer(port);
    mainWindow.loadURL(appUrl);
  } catch (err) {
    console.error("[main] Failed to connect to server:", err.message);
    mainWindow.webContents.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(`
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              font-family: "Microsoft Sans Serif", Tahoma, sans-serif;
              background: #0d3319; color: #e8d5a0;
              display: flex; flex-direction: column;
              align-items: center; justify-content: center;
              height: 100vh; gap: 12px;
            }
            button {
              padding: 8px 24px; font-family: inherit;
              background: #1e6640; color: #e8d5a0;
              border: 1px solid #4a9a6a; cursor: pointer;
            }
          </style>
        </head>
        <body>
          <h2>Failed to start server</h2>
          <p>The server did not respond. Please close the app and reopen it.</p>
          <button onclick="location.reload()">Retry</button>
        </body>
        </html>
      `)}`,
    );
  }
}

// ─── IPC: navigate to another server (join a friend's game) ───────────────────

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

// ─── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  // Start server and wait for it to claim a port
  const port = await startServer();
  await createWindow(port);

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
