import type { Server as HttpServer, IncomingMessage } from "node:http";
import { WebSocketServer } from "ws";
import { handleConnection } from "../../artifacts/api-server/src/lib/rooms";

export function attachWsServer(server: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req: IncomingMessage, socket, head) => {
    const url = req.url ?? "";
    if (
      url === "/ws" ||
      url === "/api/ws" ||
      url.startsWith("/ws?") ||
      url.startsWith("/api/ws?")
    ) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on("connection", (ws) => {
    handleConnection(ws);
  });

  console.log("[poker-desktop] WebSocket server attached at /ws and /api/ws");
}
