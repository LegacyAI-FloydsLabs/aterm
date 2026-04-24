/**
 * WebSocket handler for real-time terminal I/O.
 *
 * Protocol (JSON multiplexed):
 *   Server → Client:
 *     {type: "data", payload: "..."}     — PTY output
 *     {type: "state", ...StateResult}    — Semantic state change
 *     {type: "scrollback", payload: "..."}— Initial scrollback on connect
 *
 *   Client → Server:
 *     {type: "input", payload: "..."}    — Keyboard input
 *     {type: "resize", cols, rows}       — Terminal resize
 */
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";
import type { SessionManager } from "../session/manager.js";

interface WsMessage {
  type: string;
  payload?: string;
  cols?: number;
  rows?: number;
}

export function createWsServer(mgr: SessionManager, authToken: string): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    // Extract session ID from URL path: /ws/:sessionId
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const parts = url.pathname.split("/").filter(Boolean);
    const sessionId = parts[1]; // ["ws", "<sessionId>"]

    if (!sessionId) {
      ws.close(4000, "missing session ID");
      return;
    }

    const session = mgr.get(sessionId);
    if (!session) {
      ws.close(4004, `session not found: ${sessionId}`);
      return;
    }

    // If session isn't running, start it
    if (session.status === "stopped" || session.status === "exited") {
      try {
        mgr.start(session.id);
      } catch {
        ws.close(4500, "failed to start session");
        return;
      }
    }

    // Send initial scrollback
    const pty = mgr.getPty(session.id);
    if (pty) {
      const scrollback = pty.scrollback.raw();
      if (scrollback.length > 0) {
        safeSend(ws, { type: "scrollback", payload: scrollback });
      }
    }

    // Forward PTY output to WebSocket
    const onData = (id: string, data: string) => {
      if (id === session.id) {
        safeSend(ws, { type: "data", payload: data });
      }
    };
    mgr.on("data", onData);

    // Forward state changes
    const onState = (id: string, result: any) => {
      if (id === session.id) {
        safeSend(ws, { type: "state", ...result });
      }
    };
    mgr.on("state", onState);

    // Handle incoming messages from browser
    ws.on("message", (raw: Buffer) => {
      try {
        const msg: WsMessage = JSON.parse(raw.toString());

        switch (msg.type) {
          case "input":
            if (msg.payload) {
              mgr.write(session.id, msg.payload);
            }
            break;

          case "resize":
            if (msg.cols && msg.rows) {
              const p = mgr.getPty(session.id);
              if (p?.process) {
                p.process.resize(msg.cols, msg.rows);
              }
            }
            break;
        }
      } catch {
        // Ignore malformed messages
      }
    });

    // Cleanup on disconnect
    ws.on("close", () => {
      mgr.off("data", onData);
      mgr.off("state", onState);
    });
  });

  return wss;
}

/** Authenticate and handle WebSocket upgrade */
export function handleUpgrade(
  wss: WebSocketServer,
  authToken: string,
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
): void {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const token = url.searchParams.get("token");

  if (token !== authToken) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
}

function safeSend(ws: WebSocket, data: object): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}
