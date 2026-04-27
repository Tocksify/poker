import type { Server as HttpServer, IncomingMessage } from "node:http";
import { WebSocketServer } from "ws";
import { logger } from "./logger";
import { handleConnection } from "./rooms";

export function attachWsServer(server: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req: IncomingMessage, socket, head) => {
    const url = req.url ?? "";
    // Accept both /ws and /api/ws (path-router strips /api prefix when it routes to api-server)
    if (url === "/ws" || url === "/api/ws" || url.startsWith("/ws?") || url.startsWith("/api/ws?")) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on("connection", (ws) => {
    logger.info("WS client connected");
    handleConnection(ws);
  });

  logger.info("WebSocket server attached at /ws and /api/ws");
}
