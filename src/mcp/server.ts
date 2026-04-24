/**
 * ATerm MCP Server — exposes session operations as MCP tools.
 *
 * Transport: stdio (for local agent integration, e.g. Claude Code)
 *
 * Every session operation is an MCP tool. Agents don't need to know
 * ATerm's HTTP API — they discover tools through MCP's standard protocol.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { SessionStore } from "../session/store.js";
import { SessionManager } from "../session/manager.js";

const store = new SessionStore();
const mgr = new SessionManager(store);

// Auto-start persisted sessions
mgr.autoStartAll();

const server = new McpServer({
  name: "aterm",
  version: "0.1.0",
});

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

server.tool(
  "aterm_list",
  "List all terminal sessions with their current semantic state",
  {},
  async () => {
    const sessions = mgr.list().map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      tags: s.tags,
      pid: s.pid,
      state_confidence: s.stateResult.confidence,
      state_method: s.stateResult.method,
    }));
    return { content: [{ type: "text" as const, text: JSON.stringify(sessions, null, 2) }] };
  }
);

server.tool(
  "aterm_create",
  "Create a new terminal session",
  {
    name: z.string().describe("Session name"),
    command: z.string().describe("Shell command to run (e.g. 'bash', 'python3', 'npm run dev')"),
    directory: z.string().optional().describe("Working directory (defaults to cwd)"),
    tags: z.array(z.string()).optional().describe("Tags for filtering"),
    auto_start: z.boolean().optional().describe("Start immediately after creation"),
  },
  async ({ name, command, directory, tags, auto_start }) => {
    const session = mgr.create({
      name,
      command,
      directory: directory ?? process.cwd(),
      tags,
      autoStart: auto_start,
    }, auto_start);
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({ id: session.id, name: session.name, status: session.status }),
      }],
    };
  }
);

server.tool(
  "aterm_run",
  "Send a command to a terminal session and return the output. Waits for the command to complete or timeout.",
  {
    session: z.string().describe("Session name or ID"),
    input: z.string().describe("Command to run"),
    wait_until: z.string().optional().describe("Regex pattern to wait for in output"),
    timeout: z.number().optional().describe("Timeout in seconds (default: 30)"),
    output_mode: z.enum(["raw", "clean", "summary", "structured", "delta"]).optional()
      .describe("Output distillation mode (default: clean)"),
    include_marks: z.boolean().optional().describe("Include numbered output marks"),
  },
  async ({ session, input, wait_until, timeout, output_mode, include_marks }) => {
    const s = mgr.get(session);
    if (!s) return { content: [{ type: "text" as const, text: `Error: session '${session}' not found` }], isError: true };

    if (s.status === "stopped" || s.status === "exited") {
      mgr.start(s.id);
      await new Promise((r) => setTimeout(r, 1000));
    }

    mgr.write(s.id, input);

    const timeoutMs = (timeout ?? 30) * 1000;
    const start = Date.now();
    let waitMatched = false;

    if (wait_until) {
      const re = new RegExp(wait_until, "i");
      while (Date.now() - start < timeoutMs) {
        await new Promise((r) => setTimeout(r, 500));
        const out = mgr.read(s.id, "clean", { consumerId: "_mcp_wait" });
        if (re.test(out.content)) { waitMatched = true; break; }
        const cur = mgr.get(s.id);
        if (cur && (cur.status === "ready" || cur.status === "error" || cur.status === "exited")) break;
      }
    } else {
      const quick = Math.min(timeoutMs, 10_000);
      while (Date.now() - start < quick) {
        await new Promise((r) => setTimeout(r, 300));
        const cur = mgr.get(s.id);
        if (cur && (cur.status === "ready" || cur.status === "error" || cur.status === "exited")) break;
      }
    }

    const mode = output_mode ?? "clean";
    const output = mgr.read(s.id, mode, { consumerId: "mcp", maxLines: 100 });
    const updated = mgr.get(s.id)!;

    const result: any = {
      output: output.content,
      status: updated.status,
      state_confidence: updated.stateResult.confidence,
      state_method: updated.stateResult.method,
      hint: updated.status === "ready" ? "Command completed."
        : updated.status === "error" ? `Error: ${updated.stateResult.detail}`
        : updated.status === "waiting_for_input" ? `Waiting for input: ${updated.stateResult.detail}`
        : "Command may still be running.",
    };

    if (include_marks) {
      result.marks = mgr.marks(s.id);
    }

    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "aterm_read",
  "Read current output from a terminal session with optional distillation",
  {
    session: z.string().describe("Session name or ID"),
    output_mode: z.enum(["raw", "clean", "summary", "structured", "delta"]).optional()
      .describe("Output distillation mode (default: clean)"),
    lines: z.number().optional().describe("Max lines for summary mode (default: 50)"),
    include_marks: z.boolean().optional().describe("Include numbered output marks"),
  },
  async ({ session, output_mode, lines, include_marks }) => {
    const s = mgr.get(session);
    if (!s) return { content: [{ type: "text" as const, text: `Error: session '${session}' not found` }], isError: true };

    const output = mgr.read(s.id, output_mode ?? "clean", { consumerId: "mcp", maxLines: lines ?? 50 });
    const result: any = {
      output: output.content,
      status: s.status,
      state_confidence: s.stateResult.confidence,
    };
    if (include_marks) result.marks = mgr.marks(s.id);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "aterm_start",
  "Start a stopped terminal session",
  { session: z.string().describe("Session name or ID") },
  async ({ session }) => {
    mgr.start(session);
    return { content: [{ type: "text" as const, text: "Session starting." }] };
  }
);

server.tool(
  "aterm_stop",
  "Stop a running terminal session",
  { session: z.string().describe("Session name or ID") },
  async ({ session }) => {
    mgr.stop(session);
    return { content: [{ type: "text" as const, text: "Session stopped." }] };
  }
);

server.tool(
  "aterm_cancel",
  "Send Ctrl+C (interrupt) to a terminal session",
  { session: z.string().describe("Session name or ID") },
  async ({ session }) => {
    mgr.cancel(session);
    return { content: [{ type: "text" as const, text: "Sent Ctrl+C." }] };
  }
);

server.tool(
  "aterm_answer",
  "Reply to a terminal prompt that is waiting for input (e.g. y/n, password)",
  {
    session: z.string().describe("Session name or ID"),
    input: z.string().describe("Response to the prompt"),
  },
  async ({ session, input }) => {
    mgr.write(session, input);
    await new Promise((r) => setTimeout(r, 1000));
    const s = mgr.get(session);
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({ status: s?.status, hint: "Response sent." }),
      }],
    };
  }
);

server.tool(
  "aterm_delete",
  "Delete a terminal session permanently",
  { session: z.string().describe("Session name or ID") },
  async ({ session }) => {
    const deleted = mgr.delete(session);
    return { content: [{ type: "text" as const, text: deleted ? "Session deleted." : "Session not found." }] };
  }
);

server.tool(
  "aterm_note",
  "Read or write a session's scratchpad (persistent working memory)",
  {
    session: z.string().describe("Session name or ID"),
    content: z.string().optional().describe("Text to write (omit to read current scratchpad)"),
  },
  async ({ session, content }) => {
    const s = mgr.get(session);
    if (!s) return { content: [{ type: "text" as const, text: `Error: session '${session}' not found` }], isError: true };

    if (content !== undefined) {
      mgr.update(s.id, { scratchpad: content });
      return { content: [{ type: "text" as const, text: "Scratchpad updated." }] };
    }
    return { content: [{ type: "text" as const, text: s.scratchpad || "(empty)" }] };
  }
);

server.tool(
  "aterm_search",
  "Search scrollback across all terminal sessions",
  { query: z.string().describe("Regex pattern to search for") },
  async ({ query }) => {
    const re = new RegExp(query, "i");
    const results: Array<{ session: string; matches: string[] }> = [];
    for (const s of mgr.list()) {
      try {
        const out = mgr.read(s.id, "clean");
        const hits = out.content.split("\n").filter((l) => re.test(l)).slice(0, 10);
        if (hits.length > 0) results.push({ session: s.name, matches: hits });
      } catch { /* skip */ }
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }] };
  }
);

server.tool(
  "aterm_history",
  "Get command history for a terminal session",
  {
    session: z.string().describe("Session name or ID"),
    limit: z.number().optional().describe("Max commands to return (default: 50)"),
  },
  async ({ session, limit }) => {
    const history = mgr.history(session, limit ?? 50);
    return { content: [{ type: "text" as const, text: JSON.stringify(history) }] };
  }
);

// ---------------------------------------------------------------------------
// Start MCP server on stdio
// ---------------------------------------------------------------------------
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("MCP server error:", err);
  process.exit(1);
});
