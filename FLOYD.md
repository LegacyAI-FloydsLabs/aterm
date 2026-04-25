# ATerm — FLOYD.md
**Version:** 0.1.0
**Initialized:** 2026-04-24
**Governance:** .supercache/ v1.3.0

---

## Agent Contract

You are working on **ATerm**, a Floyd's Labs project.

### Before You Start
1. Read this file completely.
2. Read `.supercache/READONLY` — you MUST NOT write to .supercache/.
3. Check the documents in this project root for current state.

### Governance Location
```
.supercache/ → /Volumes/SanDisk1Tb/.supercache
```

This directory contains global templates, contracts, manifests, and routing config. It is **READ-ONLY**.

### Where You Write
- Project source files — your actual work
- `src/` — all TypeScript source code
- `ui/` — React frontend (Vite project)

### Execution Contract
Before claiming any task complete, provide:
1. Exact action taken
2. Direct evidence (file/line/command/output)
3. Verification result
4. Status only after proof

---

## Project-Specific Context

**Purpose:** Self-aware terminal emulator that transforms terminal output into structured, progressive-disclosure APIs for AI agents. Simultaneously the ultimate human power-terminal and the native operating surface for AI agents of any size.

**Tech Stack:**
- Server: TypeScript / Node.js (tsx) / Hono / node-pty / better-sqlite3
- Frontend: React 19 / Vite 8 / Tailwind 4 / xterm.js v6
- MCP: @modelcontextprotocol/sdk / stdio transport
- Tests: node:test runner (62 tests)
- Package manager: Bun (install only — runtime is Node due to node-pty event loop incompatibility)

**Key Files:**
- `src/server.ts` — Hono HTTP + WebSocket server, entry point
- `src/intel/state.ts` — 5-layer semantic state detector (the moat)
- `src/intel/distill.ts` — Output distillation (5 modes)
- `src/intel/marks.ts` — Output marks with numbered anchors
- `src/intel/patterns.ts` — Pattern banks (prompts, errors, input, progress)
- `src/pty/pool.ts` — PTY lifecycle management with command tracking
- `src/pty/scrollback.ts` — Ring buffer with ANSI-clean export and delta reads
- `src/session/manager.ts` — Session orchestration (PTY + Intel + Store)
- `src/session/store.ts` — SQLite persistence (sessions, checkpoints, recordings, history)
- `src/session/model.ts` — Session type definitions
- `src/session/config.ts` — aterm.yml declarative config loader
- `src/api/do.ts` — POST /api/do handler (17 actions, progressive disclosure)
- `src/api/ws.ts` — WebSocket handlers (terminal I/O + global events)
- `src/mcp/server.ts` — MCP server (13 tools, HTTP proxy to API)
- `ui/src/App.tsx` — React app shell with layouts and command palette
- `ui/src/components/Terminal.tsx` — xterm.js + WebSocket + auto-reconnect
- `ui/src/components/Sidebar.tsx` — Push-driven session list
- `ui/src/components/CommandPalette.tsx` — Ctrl+K searchable command surface
- `ui/src/components/MarksPanel.tsx` — Output marks gutter panel
- `ui/src/components/StatusBar.tsx` — State detection display
- `ui/src/hooks/useApi.ts` — HTTP API wrapper
- `ui/src/hooks/useEvents.ts` — Global events WebSocket hook

**Port:** 9600 (claimed — baud rate homage)

**Current Phase:** Phases 1-3 + Floyd's Build complete. Phase 4 (Bridge + Automation) next.

**Build Commands:**
```bash
# Install dependencies
bun install
cd ui && bun install && cd ..

# Run server (backend)
npx tsx src/server.ts

# Run frontend dev server (proxies to backend)
cd ui && bun run dev

# Run tests
node --import tsx --test src/**/*.test.ts

# Run with config
npx tsx src/server.ts --config=aterm.yml

# Fix node-pty permissions (required after install)
chmod +x node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper
```

**Auth:** Auto-generated 256-bit token written to `.aterm-token` on first run. Pass as `Authorization: Bearer <token>` header or `?token=<token>` query param.

---

## Key Design Decisions

1. **Node.js, not Bun** — node-pty's onData callback doesn't fire under Bun's event loop. Spike confirmed 2026-04-24.
2. **MCP server is HTTP proxy, not standalone** — Prevents dual PTY pool race condition. MCP tools forward to POST /api/do. Single source of truth.
3. **5-layer state detection** — Original regex-only design failed all 5 test scenarios (metacognitive analysis). Revised to: process signals → prompt patterns + command tracking → error patterns + command context → timing heuristics → honest uncertainty.
4. **Push, not poll** — Sidebar uses /ws/events for session list updates. Project thesis: "terminal notifies agent, not agent polls terminal."
5. **Inside-out build order** — Output Intelligence first, then sessions, then API, then MCP, then UI. The moat ships before the paint.

---

## Mandatory Execution Contract
For EACH requested item:
1) Show exact action taken
2) Show direct evidence (file/line/command/output)
3) Show verification result
4) Mark status only after proof

## Forbidden Behaviors
- Declaring "done" without evidence
- Collapsing multiple requested items into one vague summary
- Skipping failed steps without explicit blocker report

## Required Output Structure
A) Requested items checklist
B) Per-item evidence ledger
C) Verification receipts
D) Completeness matrix

## Hard Gate
If any requested item has no evidence row, final status MUST be INCOMPLETE.
