/**
 * POST /api/do — the single agent endpoint with progressive disclosure.
 *
 * Tier 1 (3-9B models): action, session, input → ok, output, status, hint, actions
 * Tier 2 (10-70B):      + wait_until, timeout, lines
 * Tier 3 (70B+):        + output_mode, include_marks, include_advanced
 */
import type { Context } from "hono";
import type { SessionManager, SessionWithState } from "../session/manager.js";
import type { DistillMode } from "../intel/distill.js";
import { setTimeout as delay } from "node:timers/promises";

type Action =
  | "list" | "read" | "run" | "stop" | "start" | "cancel" | "answer"
  | "create" | "delete" | "note" | "search" | "broadcast" | "history";

interface DoRequest {
  action: Action;
  session?: string;
  input?: string;

  // Tier 2
  wait_until?: string;
  timeout?: number;
  lines?: number;

  // Tier 3
  output_mode?: DistillMode;
  include_marks?: boolean;
  include_advanced?: boolean;

  // Create-specific
  command?: string;
  directory?: string;
  tags?: string[];
  auto_start?: boolean;

  // Broadcast-specific
  sessions?: string[];
}

const VALID_ACTIONS = new Set<string>([
  "list", "read", "run", "stop", "start", "cancel", "answer",
  "create", "delete", "note", "search", "broadcast", "history",
]);

function hint(session: SessionWithState | undefined): string {
  if (!session) return "Session not found.";
  switch (session.status) {
    case "ready": return "Session is ready for commands.";
    case "busy": return "Session is running a command. Wait or cancel.";
    case "waiting_for_input": return `Session is waiting for input: ${session.stateResult.detail}`;
    case "error": return `Session has an error: ${session.stateResult.detail}`;
    case "stopped": return "Session is stopped. Start it first.";
    case "exited": return "Session process has exited. Restart it.";
    case "starting": return "Session is starting up.";
    default: return "Unknown state.";
  }
}

function availableActions(session: SessionWithState | undefined): Action[] {
  if (!session) return ["list", "create"];
  switch (session.status) {
    case "ready": return ["run", "read", "stop", "cancel", "note", "history"];
    case "busy": return ["read", "cancel", "stop", "note"];
    case "waiting_for_input": return ["answer", "read", "cancel", "stop", "note"];
    case "error": return ["read", "run", "stop", "cancel", "note", "history"];
    case "stopped": return ["start", "delete", "note", "history"];
    case "exited": return ["start", "delete", "read", "note", "history"];
    case "starting": return ["read", "stop", "note"];
    default: return ["list"];
  }
}

export function createDoHandler(mgr: SessionManager) {
  return async (c: Context) => {
    let body: DoRequest;
    try {
      body = await c.req.json<DoRequest>();
    } catch {
      return c.json({ ok: false, error: "invalid JSON body" }, 400);
    }

    const { action } = body;
    if (!action || !VALID_ACTIONS.has(action)) {
      return c.json({
        ok: false,
        error: `invalid action: ${action}. Valid: ${[...VALID_ACTIONS].join(", ")}`,
      }, 400);
    }

    try {
      switch (action) {
        case "list": return handleList(c, mgr, body);
        case "read": return handleRead(c, mgr, body);
        case "run": return handleRun(c, mgr, body);
        case "stop": return handleStop(c, mgr, body);
        case "start": return handleStart(c, mgr, body);
        case "cancel": return handleCancel(c, mgr, body);
        case "answer": return handleRun(c, mgr, body); // answer = run with input
        case "create": return handleCreate(c, mgr, body);
        case "delete": return handleDelete(c, mgr, body);
        case "note": return handleNote(c, mgr, body);
        case "search": return handleSearch(c, mgr, body);
        case "broadcast": return handleBroadcast(c, mgr, body);
        case "history": return handleHistory(c, mgr, body);
        default: return c.json({ ok: false, error: "not implemented" }, 501);
      }
    } catch (err: any) {
      return c.json({ ok: false, error: err.message }, 500);
    }
  };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

function handleList(c: Context, mgr: SessionManager, body: DoRequest) {
  const sessions = mgr.list().map((s) => ({
    id: s.id,
    name: s.name,
    label: s.label,
    status: s.status,
    tags: s.tags,
    pid: s.pid,
    ...(body.include_advanced ? {
      order: s.order,
      pinned: s.pinned,
      autoStart: s.autoStart,
      startedAt: s.startedAt,
      restartCount: s.restartCount,
      stateResult: s.stateResult,
    } : {}),
  }));

  return c.json({
    ok: true,
    sessions,
    hint: `${sessions.length} session(s). ${sessions.filter((s) => s.status === "ready").length} ready.`,
    actions: ["create", "read", "run", "start", "stop"],
  });
}

function handleRead(c: Context, mgr: SessionManager, body: DoRequest) {
  if (!body.session) return c.json({ ok: false, error: "session required" }, 400);
  const session = mgr.get(body.session);
  if (!session) return c.json({ ok: false, error: `session not found: ${body.session}` }, 404);

  const mode: DistillMode = body.output_mode ?? "clean";
  const output = mgr.read(session.id, mode, {
    consumerId: "api",
    maxLines: body.lines ?? 50,
  });

  return c.json({
    ok: true,
    output: output.content,
    status: session.status,
    hint: hint(session),
    actions: availableActions(session),
    ...(body.include_marks ? { marks: mgr.marks(session.id) } : {}),
    ...(body.include_advanced ? {
      reduction_pct: output.reductionPct,
      original_bytes: output.originalBytes,
      distilled_bytes: output.distilledBytes,
      state_result: session.stateResult,
    } : {}),
  });
}

async function handleRun(c: Context, mgr: SessionManager, body: DoRequest) {
  if (!body.session) return c.json({ ok: false, error: "session required" }, 400);
  if (!body.input) return c.json({ ok: false, error: "input required" }, 400);

  const session = mgr.get(body.session);
  if (!session) return c.json({ ok: false, error: `session not found: ${body.session}` }, 404);

  if (session.status === "stopped" || session.status === "exited") {
    mgr.start(session.id);
    await delay(1000); // Wait for shell to initialize
  }

  mgr.write(session.id, body.input);

  // Tier 2: wait_until pattern
  const timeoutMs = (body.timeout ?? 30) * 1000;
  const waitPattern = body.wait_until;
  const startTime = Date.now();
  let waitMatched = false;

  if (waitPattern) {
    const re = new RegExp(waitPattern, "i");
    while (Date.now() - startTime < timeoutMs) {
      await delay(500);
      const current = mgr.read(session.id, "clean", { consumerId: "_wait" });
      if (re.test(current.content)) {
        waitMatched = true;
        break;
      }
      // Also break if session returned to ready/error state
      const s = mgr.get(session.id);
      if (s && (s.status === "ready" || s.status === "error" || s.status === "exited")) {
        break;
      }
    }
  } else {
    // No wait pattern — just wait for prompt or timeout
    const quickTimeout = Math.min(timeoutMs, 10_000);
    while (Date.now() - startTime < quickTimeout) {
      await delay(300);
      const s = mgr.get(session.id);
      if (s && (s.status === "ready" || s.status === "error" || s.status === "exited")) {
        break;
      }
    }
  }

  // Read result
  const mode: DistillMode = body.output_mode ?? "clean";
  const output = mgr.read(session.id, mode, {
    consumerId: "api",
    maxLines: body.lines ?? 50,
  });

  const updated = mgr.get(session.id)!;

  return c.json({
    ok: true,
    output: output.content,
    status: updated.status,
    hint: hint(updated),
    actions: availableActions(updated),
    ...(waitPattern ? { wait_matched: waitMatched, timed_out: !waitMatched && Date.now() - startTime >= timeoutMs } : {}),
    ...(body.include_marks ? { marks: mgr.marks(session.id) } : {}),
    ...(body.include_advanced ? {
      reduction_pct: output.reductionPct,
      state_result: updated.stateResult,
      pid: updated.pid,
      uptime: updated.startedAt ? Date.now() - updated.startedAt : null,
      restart_count: updated.restartCount,
    } : {}),
  });
}

function handleStop(c: Context, mgr: SessionManager, body: DoRequest) {
  if (!body.session) return c.json({ ok: false, error: "session required" }, 400);
  mgr.stop(body.session);
  return c.json({ ok: true, status: "stopped", hint: "Session stopped.", actions: ["start", "delete"] });
}

function handleStart(c: Context, mgr: SessionManager, body: DoRequest) {
  if (!body.session) return c.json({ ok: false, error: "session required" }, 400);
  mgr.start(body.session);
  const session = mgr.get(body.session);
  return c.json({ ok: true, status: "starting", hint: "Session starting.", actions: availableActions(session) });
}

function handleCancel(c: Context, mgr: SessionManager, body: DoRequest) {
  if (!body.session) return c.json({ ok: false, error: "session required" }, 400);
  mgr.cancel(body.session);
  return c.json({ ok: true, hint: "Sent Ctrl+C.", actions: ["read", "run"] });
}

function handleCreate(c: Context, mgr: SessionManager, body: DoRequest) {
  if (!body.session) return c.json({ ok: false, error: "session (name) required" }, 400);
  if (!body.command) return c.json({ ok: false, error: "command required" }, 400);

  const session = mgr.create({
    name: body.session,
    command: body.command,
    directory: body.directory ?? process.cwd(),
    tags: body.tags,
    autoStart: body.auto_start,
  }, body.auto_start);

  return c.json({
    ok: true,
    id: session.id,
    status: session.status,
    hint: body.auto_start ? "Session created and started." : "Session created. Start it when ready.",
    actions: availableActions(mgr.get(session.id)),
  });
}

function handleDelete(c: Context, mgr: SessionManager, body: DoRequest) {
  if (!body.session) return c.json({ ok: false, error: "session required" }, 400);
  const deleted = mgr.delete(body.session);
  return c.json({ ok: deleted, hint: deleted ? "Session deleted." : "Session not found.", actions: ["list", "create"] });
}

function handleNote(c: Context, mgr: SessionManager, body: DoRequest) {
  if (!body.session) return c.json({ ok: false, error: "session required" }, 400);
  const session = mgr.get(body.session);
  if (!session) return c.json({ ok: false, error: `session not found: ${body.session}` }, 404);

  if (body.input !== undefined) {
    mgr.update(session.id, { scratchpad: body.input });
    return c.json({ ok: true, hint: "Scratchpad updated." });
  }

  return c.json({ ok: true, scratchpad: session.scratchpad, hint: "Current scratchpad contents." });
}

function handleSearch(c: Context, mgr: SessionManager, body: DoRequest) {
  if (!body.input) return c.json({ ok: false, error: "input (search query) required" }, 400);

  const re = new RegExp(body.input, "i");
  const results: Array<{ session: string; matches: string[] }> = [];

  for (const session of mgr.list()) {
    try {
      const output = mgr.read(session.id, "clean");
      const lines = output.content.split("\n").filter((l) => re.test(l));
      if (lines.length > 0) {
        results.push({ session: session.name, matches: lines.slice(0, 10) });
      }
    } catch {
      // Skip sessions without PTY
    }
  }

  return c.json({
    ok: true,
    results,
    hint: `Found matches in ${results.length} session(s).`,
  });
}

function handleBroadcast(c: Context, mgr: SessionManager, body: DoRequest) {
  if (!body.input) return c.json({ ok: false, error: "input required" }, 400);
  const targets = body.sessions ?? mgr.list().filter((s) => s.status === "ready").map((s) => s.name);

  let sent = 0;
  for (const name of targets) {
    try {
      mgr.write(name, body.input);
      sent++;
    } catch {
      // Skip failed
    }
  }

  return c.json({ ok: true, sent, total: targets.length, hint: `Broadcast to ${sent}/${targets.length} sessions.` });
}

function handleHistory(c: Context, mgr: SessionManager, body: DoRequest) {
  if (!body.session) return c.json({ ok: false, error: "session required" }, 400);
  const history = mgr.history(body.session, body.lines ?? 50);
  return c.json({ ok: true, history, hint: `${history.length} commands in history.` });
}
