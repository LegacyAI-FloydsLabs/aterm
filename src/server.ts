import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { cors } from "hono/cors";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { SessionStore } from "./session/store.js";
import { SessionManager } from "./session/manager.js";
import { createDoHandler } from "./api/do.js";
import { createWsServer, handleUpgrade } from "./api/ws.js";
import { getBridgeClient, destroyBridgeClient } from "./bridge/anvil-client.js";

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
const AUTH_TOKEN_BUF = Buffer.from(AUTH_TOKEN, "utf8");

const PORT = parseInt(process.env.ATERM_PORT || "9600", 10);
const UI_DIST = path.join(process.cwd(), "dist", "ui");
const UI_INDEX = path.join(UI_DIST, "index.html");

/** Constant-time token comparison. Returns false on any length mismatch or
 *  non-string input — never short-circuits character-by-character, so server
 *  response timing cannot leak byte positions of the real token. */
function tokenMatches(provided: string | undefined | null): boolean {
  if (typeof provided !== "string") return false;
  const buf = Buffer.from(provided, "utf8");
  if (buf.length !== AUTH_TOKEN_BUF.length) return false;
  return crypto.timingSafeEqual(buf, AUTH_TOKEN_BUF);
}

function isApiPath(requestPath: string): boolean {
  return requestPath === "/api" || requestPath.startsWith("/api/");
}

function isSpaPath(requestPath: string): boolean {
  return !isApiPath(requestPath) && requestPath !== "/health" && !requestPath.startsWith("/ws/");
}

// ---------------------------------------------------------------------------
// Session Manager
// ---------------------------------------------------------------------------
// Session Manager + Config
// ---------------------------------------------------------------------------
import { findAndLoadConfig } from "./session/config.js";

const store = new SessionStore();
const mgr = new SessionManager(store);

// Load aterm.yml if present
const configPath = process.argv.find((a) => a.startsWith("--config="))?.split("=")[1];
const config = findAndLoadConfig(configPath);
if (config) {
  let loaded = 0;
  for (const sessionCfg of config.sessions) {
    const existing = mgr.get(sessionCfg.name);
    if (!existing) {
      mgr.create(sessionCfg, sessionCfg.autoStart);
      loaded++;
    }
  }
  if (loaded > 0) console.log(`Loaded ${loaded} session(s) from aterm.yml`);
}

// Auto-start sessions from previous run
const autoStarted = mgr.autoStartAll();

// ---------------------------------------------------------------------------
// Hono app
// ---------------------------------------------------------------------------
const app = new Hono();

// CORS — restrict to localhost in production, permissive in dev
app.use("*", cors({
  origin: (origin) => {
    // Allow requests with no origin (curl, MCP stdio, WebSocket upgrades)
    if (!origin) return "*";
    // Allow localhost and 127.0.0.1 on any port
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:[0-9]+)?$/.test(origin)) return origin;
    // Reject everything else
    return "";
  },
}));

// Rate limiting — 60 requests/minute per token, burst to 10/sec.
// Bounded LRU eviction prevents the map growing without bound under an
// adversary rotating the Authorization header.
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_MAX_KEYS = 4096;

function evictExpiredBuckets(now: number): void {
  // O(n) sweep — only invoked when the map exceeds the cap, so amortised O(1).
  for (const [k, b] of rateBuckets) {
    if (now > b.resetAt) rateBuckets.delete(k);
  }
  // If still over cap (every bucket is in-window), drop the oldest insertion
  // order entries — Map preserves insertion order natively.
  while (rateBuckets.size > RATE_LIMIT_MAX_KEYS) {
    const first = rateBuckets.keys().next().value;
    if (first === undefined) break;
    rateBuckets.delete(first);
  }
}
app.use("*", async (c, next) => {
  if (!isApiPath(c.req.path)) return next();

  const key = c.req.header("Authorization") ?? c.req.query("token") ?? "anon";
  const now = Date.now();
  let bucket = rateBuckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    if (rateBuckets.size >= RATE_LIMIT_MAX_KEYS) evictExpiredBuckets(now);
    bucket = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateBuckets.set(key, bucket);
  }

  bucket.count++;
  if (bucket.count > RATE_LIMIT_MAX) {
    return c.json({ ok: false, error: "rate limited", retryAfterMs: bucket.resetAt - now }, 429);
  }

  return next();
});
// Auth middleware — protect terminal control APIs. Static UI files are public;
// the bearer/query token still gates every command and WebSocket upgrade.
app.use("*", async (c, next) => {
  if (!isApiPath(c.req.path)) return next();

  const header = c.req.header("Authorization");
  const query = new URL(c.req.url).searchParams.get("token");
  const provided = header?.replace("Bearer ", "") || query;

  if (!tokenMatches(provided)) {
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

if (fs.existsSync(UI_INDEX)) {
  app.use("/assets/*", serveStatic({ root: UI_DIST }));
  app.get("*", async (c, next) => {
    if (!isSpaPath(c.req.path)) return next();
    return serveStatic({ path: UI_INDEX })(c, next);
  });
}

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
console.log(`UI:    ${fs.existsSync(UI_INDEX) ? "served from dist/ui" : "not built (run ui build for browser shell)"}`);
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

// Proactively start the Anvil MCP bridge (non-blocking)
const bridgeClient = getBridgeClient();
bridgeClient.ensureConnected().then((result) => {
  if (result.ok) {
    console.log("Anvil MCP: connected (bridge ready)");
  } else {
    console.log(`Anvil MCP: not available (${result.hint ?? "unknown"})`);
  }
}).catch(() => {
  // Non-fatal — bridge calls will retry lazily
  console.log("Anvil MCP: startup probe failed (bridge available on first call)");
});

// Graceful shutdown — idempotent, time-bounded. SIGTERM/SIGINT both route
// here. We tear down bridge, PTYs (SIGHUP→SIGKILL), and HTTP listeners,
// then schedule a hard process.exit(0) on a watchdog so a stuck handle
// (e.g., open websocket) cannot prevent process termination.
let shutdownStarted = false;
function shutdown(signal: NodeJS.Signals | "manual" = "manual"): void {
  if (shutdownStarted) return;
  shutdownStarted = true;
  try { destroyBridgeClient(); } catch { /* best-effort */ }
  try { mgr.destroy(); } catch { /* best-effort */ }
  try { httpServer.close(); } catch { /* best-effort */ }
  try { wss.close(); } catch { /* best-effort */ }
  // Hard fallback: never let a leaked handle stall shutdown indefinitely.
  const exitTimer = setTimeout(() => process.exit(0), 1500);
  exitTimer.unref();
  // If event loop drains cleanly before the watchdog, exit immediately.
  setImmediate(() => process.exit(0));
  void signal;
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
// Catch uncaught/unhandled to avoid silent corruption — surface and shutdown.
process.on("uncaughtException", (err) => { console.error("uncaughtException:", err); shutdown("manual"); });
process.on("unhandledRejection", (err) => { console.error("unhandledRejection:", err); });