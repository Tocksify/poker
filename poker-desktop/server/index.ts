import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import path from "node:path";
import express from "express";
import cors from "cors";
import authRouter, { initDb } from "./auth";
import { attachWsServer } from "./wsHandler";

const PORT = parseInt(process.env["PORT"] ?? "7890", 10);
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

app.get("/api/healthz", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/local-info", (_req, res) => {
  res.json({ ip: getLocalIP(), port: PORT });
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

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[poker-desktop] Server listening on port ${PORT}`);
  console.log(`[poker-desktop] Local IP: ${getLocalIP()}`);
  process.stdout.write(`SERVER_READY:${PORT}\n`);
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[poker-desktop] Port ${PORT} is already in use.`);
    process.exit(1);
  }
  console.error("[poker-desktop] Server error:", err);
  process.exit(1);
});
