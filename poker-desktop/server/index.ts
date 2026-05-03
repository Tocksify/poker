import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import path from "node:path";
import express from "express";
import cors from "cors";
import authRouter, { initDb } from "./auth";
import { attachWsServer } from "./wsHandler";

const BASE_PORT = parseInt(process.env["PORT"] ?? "7890", 10);
const PORT_RANGE = 20; // try 7890–7909
const SQLITE_DB_PATH = process.env["SQLITE_DB_PATH"] ?? "./poker-desktop.db";
const STATIC_DIR = process.env["STATIC_DIR"] ?? "";

function getLocalIP(): string {
  const nets = networkInterfaces();
  for (const ifaces of Object.values(nets)) {
    if (!ifaces) continue;
    for (const iface of ifaces) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "127.0.0.1";
}

initDb(SQLITE_DB_PATH);
console.log(`[poker-desktop] Database: ${SQLITE_DB_PATH}`);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let actualPort = BASE_PORT;

app.get("/api/healthz", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/local-info", (_req, res) => {
  res.json({ ip: getLocalIP(), port: actualPort });
});

app.use("/api", authRouter);

if (STATIC_DIR) {
  app.use(express.static(STATIC_DIR));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(STATIC_DIR, "index.html"));
  });
}

const server = createServer(app);
attachWsServer(server);

let currentPort = BASE_PORT;

function tryListen(port: number): void {
  currentPort = port;
  server.listen(port, "0.0.0.0");
}

server.on("listening", () => {
  const addr = server.address();
  actualPort = typeof addr === "object" && addr !== null ? addr.port : currentPort;
  console.log(`[poker-desktop] Server listening on port ${actualPort}`);
  console.log(`[poker-desktop] Local IP: ${getLocalIP()}`);
  process.stdout.write(`SERVER_READY:${actualPort}\n`);
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    const next = currentPort + 1;
    if (next < BASE_PORT + PORT_RANGE) {
      console.warn(`[poker-desktop] Port ${currentPort} busy, trying ${next}...`);
      // Must remove the error listener temporarily and re-attach after close
      // to avoid double-firing on the close itself
      server.close(() => tryListen(next));
    } else {
      console.error(
        `[poker-desktop] No free port found in range ${BASE_PORT}–${BASE_PORT + PORT_RANGE - 1}`
      );
      process.exit(1);
    }
    return;
  }
  console.error("[poker-desktop] Server error:", err);
  process.exit(1);
});

tryListen(BASE_PORT);
