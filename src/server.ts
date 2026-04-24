import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { SessionStore } from "./session/store.js";
import { SessionManager } from "./session/manager.js";
import { createDoHandler } from "./api/do.js";
import { createWsServer, handleUpgrade } from "./api/ws.js";

// ---------------------------------------------------------------------------
// Auth token — auto-generated on first run, persisted to .aterm-token
// ---------------------------------------------------------------------------
const TOKEN_FILE = path.join(process.cwd(), ".aterm-token");

function loadOrCreateToken(): string {
  try {
    const existing = fs.readFileSync(TOKEN_FILE, "utf-8").trim();
    if (existing.length >= 32) return existing;
  } catch {
    // File doesn't exist — expected on first run
  }
  const token = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(TOKEN_FILE, token + "\n", { mode: 0o600 });
  return token;
}

const AUTH_TOKEN = loadOrCreateToken();
const PORT = parseInt(process.env.ATERM_PORT || "9600", 10);

// ---------------------------------------------------------------------------
// Session Manager
// ---------------------------------------------------------------------------
const store = new SessionStore();
const mgr = new SessionManager(store);

// Auto-start sessions from previous run
const autoStarted = mgr.autoStartAll();

// ---------------------------------------------------------------------------
// Hono app
// ---------------------------------------------------------------------------
const app = new Hono();

// CORS for browser UI (same-origin in production, permissive in dev)
app.use("*", cors());

// Auth middleware — skip health check
app.use("*", async (c, next) => {
  if (c.req.path === "/health") return next();

  const header = c.req.header("Authorization");
  const query = new URL(c.req.url).searchParams.get("token");
  const provided = header?.replace("Bearer ", "") || query;

  if (provided !== AUTH_TOKEN) {
    return c.json({ ok: false, error: "unauthorized" }, 401);
  }
  return next();
});

// Health check — no auth required
app.get("/health", (c) => {
  return c.json({
    ok: true,
    version: "0.1.0",
    sessions: mgr.list().length,
    uptime: process.uptime(),
  });
});

// The API
app.post("/api/do", createDoHandler(mgr));

// WebSocket server for terminal I/O
const wss = createWsServer(mgr, AUTH_TOKEN);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
console.log("─".repeat(60));
console.log("ATerm v0.1.0");
console.log(`Port:  ${PORT}`);
console.log(`Token: ${AUTH_TOKEN}`);
console.log(`URL:   http://localhost:${PORT}?token=${AUTH_TOKEN}`);
if (autoStarted > 0) console.log(`Auto-started: ${autoStarted} session(s)`);
console.log("─".repeat(60));

const httpServer = serve({ fetch: app.fetch, port: PORT });

// Hook WebSocket upgrade into the HTTP server
httpServer.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  if (url.pathname.startsWith("/ws/")) {
    handleUpgrade(wss, AUTH_TOKEN, req, socket, head);
  } else {
    socket.destroy();
  }
});

// Graceful shutdown
process.on("SIGTERM", () => { mgr.destroy(); process.exit(0); });
process.on("SIGINT", () => { mgr.destroy(); process.exit(0); });
