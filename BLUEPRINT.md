# ATerm Construction Blueprint

**Objective:** Build the self-aware terminal — the agent's operating surface.
**Constraint:** No shortcuts. Every phase delivers something real that works end-to-end.
**Principle:** Build from the inside out. Output Intelligence first (the thing no one else has), then wrap it in the session manager, then expose the API, then build the UI.

---

## Why Inside-Out

Every competitor started with the UI and bolted on agent support later.
We start with what the agent needs and build the human UI as a projection of that.

```
COMPETITORS:  UI → Sessions → (maybe) Agent API
ATERM:        Output Intelligence → Session Model → Agent API → MCP → UI
```

This order means the hard, differentiating work ships first. If we only deliver Phase 1, we already have something no one else has.

---

## Phase 1 — The Core (Nerve Endings)

**Delivers:** A Bun server that manages PTY sessions with output intelligence. No UI. API only.
**Why first:** This is the moat. Everything else is commodity.

### Step 1.1 — Project Scaffold
- `bun init` in `/Volumes/SanDisk1Tb/ATerm`
- Hono server, node-pty, bun:sqlite
- TypeScript strict mode
- Directory structure:

```
src/
  server.ts           # Hono HTTP + WebSocket server
  pty/
    pool.ts           # PTY lifecycle management
    scrollback.ts     # Ring buffer with ANSI-clean export
  intel/
    state.ts          # Semantic state detection
    distill.ts        # Output distillation (5 modes)
    marks.ts          # Output marks and refs
    patterns.ts       # Pattern banks (prompts, errors, input, progress)
  session/
    model.ts          # Session type definitions
    manager.ts        # CRUD, lifecycle, automation
    store.ts          # SQLite persistence
  api/
    do.ts             # POST /api/do (progressive disclosure)
    ws.ts             # WebSocket handler
  mcp/
    server.ts         # MCP server (Streamable HTTP + stdio)
    tools.ts          # MCP tool definitions
```

**Exit criteria:** `bun run src/server.ts` starts, listens on port 9600, responds to health check.

### Step 1.2 — PTY Pool
- Spawn PTY processes via node-pty
- Per-session scrollback ring buffer (configurable, default 256KB)
- Non-blocking read via event emitter
- Resize, kill, restart with backoff (3 retries, 5 min window)
- ANSI-clean export of scrollback
- Environment variable injection per session

**Exit criteria:** Can spawn a bash session, send `echo hello`, read output back. Can kill and restart. Scrollback persists across reconnection.

### Step 1.3 — Output Intelligence: State Detection
- Pattern banks in `patterns.ts`:
  - 20+ prompt patterns (bash, zsh, fish, python, node, irb, mysql, psql, sqlite, gdb, etc.)
  - 15+ input-waiting patterns ([y/n], password, passphrase, Continue?, overwrite, etc.)
  - 25+ error patterns (traceback, panic, FATAL, npm ERR!, SyntaxError, segfault, etc.)
  - 10+ progress patterns (downloading, compiling, [====], XX%, ETA, etc.)
- State machine in `state.ts`:
  - Inputs: new PTY output chunk, PTY exit event
  - States: stopped, starting, ready, busy, waiting_for_input, error, exited
  - Output: `{ state, confidence, detail }` (detail = detected prompt text, error message, input prompt, etc.)
- State changes emit events (not just poll — push)

**Exit criteria:** Run `python3 -c "x = input('Continue? ')"` in a session. State detector identifies `waiting_for_input` with prompt text "Continue?". Run `cargo build` with an error. State detector identifies `error` with the error text.

### Step 1.4 — Output Intelligence: Distillation
- Five modes in `distill.ts`:
  - `raw` — pass-through
  - `clean` — ANSI strip (regex-based, handles all SGR, CSI, OSC sequences)
  - `summary` — skip blank lines, progress bars, repeated lines, noise. Keep errors, results, prompts. Configurable line limit.
  - `structured` — parse into `{ segments: [{ type: "command"|"output"|"error"|"prompt"|"progress", text, lines }] }`
  - `delta` — track per-consumer read cursor, return only new content since last read

**Exit criteria:** Run `npm install` in a session. `raw` returns everything. `clean` strips ANSI. `summary` returns ~10 lines (the result). `structured` returns typed segments. `delta` on second call returns only new content.

### Step 1.5 — Output Intelligence: Marks and Refs
- `marks.ts`:
  - Segment output into numbered regions based on command boundaries (prompt → command → output → next prompt)
  - Each mark: `{ id: number, type, text, startLine, endLine }`
  - Marks update as new output arrives (new commands create new marks)
  - Stable refs: `{ refId: string, markId: number, type, text }` that persist across scrollback growth
- API: `GET /api/session/:id/marks` returns current marks
- API: `GET /api/session/:id/mark/:markId` returns specific mark content

**Exit criteria:** Run three commands in a session. Marks endpoint returns 3+ marks with correct types. Mark content matches actual output.

### Step 1.6 — Session Model and Persistence
- Full Session type from the design plan (identity, process, lifecycle, intelligence, agent, metrics)
- SQLite schema: sessions, checkpoints, command_history, scratchpads
- CRUD: create, read, update, delete sessions
- Session config supports: name, command, directory, env, tags, order, pinned, autoStart, autoRestart, restartPolicy, automation (cron/timer/hook/keepalive)
- Import from TCC's `agents.json` format (backward compat)
- Export/import as `aterm.yml` (declarative config)

**Exit criteria:** Create a session via API. Restart the server. Session persists. Import TCC agents.json — sessions appear.

### Step 1.7 — The API: POST /api/do
- Single endpoint, progressive disclosure
- Tier 1 (3 fields): `action`, `session`, `input`
- Tier 2 (adds): `wait_until`, `timeout`, `lines`
- Tier 3 (adds): `output_mode`, `include_marks`, `include_advanced`, `checkpoint`, `verify`
- All 17 actions: list, read, run, stop, start, cancel, answer, create, delete, checkpoint, record, verify, note, batch, search, broadcast, bridge
- Response always includes: `ok`, `output`, `status`, `hint`, `actions`
- Tier 2 adds: `wait_matched`, `timed_out`
- Tier 3 adds: `marks`, `refs`, `pid`, `scrollback_bytes`, `uptime`, `command_history`

**Exit criteria:** Tier 1 — `curl -X POST /api/do -d '{"action":"run","session":"test","input":"echo hello"}'` returns `{ok:true, output:"hello\n", status:"ready", hint:"Session is ready for commands", actions:["run","read","stop"]}`. All 17 actions work.

### Step 1.8 — MCP Server
- `@modelcontextprotocol/sdk` integration
- Transport: stdio (for local agents) + Streamable HTTP (for remote agents)
- Tools: one MCP tool per API action (aterm_list, aterm_run, aterm_read, etc.)
- Tool schemas with progressive disclosure (required fields minimal, optional fields documented)
- Resources: session list, session state, session marks

**Exit criteria:** Claude Code can connect via MCP, list sessions, run commands, read output with marks. Verified with `claude --mcp-config` pointing at ATerm.

---

## Phase 2 — The Surface (Human Interface)

**Delivers:** Browser UI that humans can use. Same data as API, visual projection.
**Why second:** The API is the truth. The UI renders it.

### Step 2.1 — Frontend Scaffold
- Vite + React 19 + TypeScript + Tailwind 4
- xterm.js v6 with WebGL renderer, fit addon, search addon, unicode11 addon, web-links addon
- WebSocket connection to server
- PWA manifest + service worker (vite-plugin-pwa)

### Step 2.2 — Terminal View
- Single session view: xterm.js instance connected to PTY via WebSocket
- Status indicator (dot color = semantic state)
- Frame header: name, state, uptime, tags
- Inline search (Ctrl+F within terminal)
- Fullscreen toggle

### Step 2.3 — Multi-Session Layout
- Grid view (auto-fit, 2x1, 3x1, 2x2, 1x1)
- Tab view
- Split view with draggable divider
- Layout presets: save/restore as named layouts
- Drag-and-drop session reordering

### Step 2.4 — Session Management Sidebar
- Session list with state dots, last output line, uptime, tags
- Add session form (name, command, directory, env, tags, automation)
- Tag filtering, bulk operations (start/stop/restart/delete selected)
- Agent activity indicator (when an agent is connected via API/MCP)
- Quick presets (bash, python3, node, zsh)
- Import/export (agents.json compat, aterm.yml)

### Step 2.5 — Command Palette and Keyboard
- Ctrl+K command palette (all actions searchable)
- Ctrl+Tab session cycling, Ctrl+1-9 jump
- Ctrl+B sidebar toggle
- Broadcast mode (Ctrl+Shift+B — type once, send to all)
- Every action has a keybinding

### Step 2.6 — Output Marks Overlay
- Toggleable numbered marks on terminal output
- Click mark to highlight/select that output region
- "Copy mark N" action
- Visual distinction between command, output, error, prompt marks

### Step 2.7 — Theme and Polish
- Dark/light theme with CSS variables
- Mobile responsive (activity bar moves to bottom on narrow screens)
- Toast notifications for state changes
- Context menu on right-click
- Notification badges on sessions with errors/waiting-for-input

**Exit criteria:** Open browser to localhost:9600. See terminal sessions. Type commands. See output marks. Switch themes. Works on phone.

---

## Phase 3 — The Memory (Persistence and History)

**Delivers:** Sessions that survive restarts. Searchable history. Checkpoints.

### Step 3.1 — Session Persistence
- All sessions auto-persist to SQLite
- Server restart recovers all sessions
- Auto-start sessions launch on server start (respecting order + stagger)
- Scrollback replays on reconnection

### Step 3.2 — Command History
- Per-session command history stored in SQLite
- Searchable via API and UI
- Cross-session search (Ctrl+Shift+F)

### Step 3.3 — Checkpoints
- `checkpoint` action saves: session state, scrollback, environment, scratchpad
- `restore` action returns to checkpoint
- Multiple named checkpoints per session
- Auto-checkpoint before risky operations (when `checkpoint: true` in API call)

### Step 3.4 — Session Scratchpad
- Per-session markdown scratchpad
- Read/write via API (`note` action) and UI (CodeMirror panel)
- Persists across server restarts
- Searchable

### Step 3.5 — Workflow Recording
- `record` action starts/stops recording
- Records: commands sent, output received, state changes, timestamps
- Export as: JSON (machine-readable), Markdown (human-readable), shell script (reproducible)

---

## Phase 4 — The Bridges (Integration)

**Delivers:** ATerm connects to everything else.

### Step 4.1 — Floyd TTY Bridge Integration
- `bridge` action routes to Floyd TTY Bridge
- File-based IPC (`~/floyd_comm/`) or WebSocket
- Bridge tools available through ATerm's API and MCP
- Bridge sessions appear as ATerm sessions

### Step 4.2 — Automation
- Cron scheduling (5-field expressions)
- launchd plist generation (macOS: timer, hook, keepalive)
- Auto-restart with configurable backoff
- Health monitoring (CPU, memory per session)

### Step 4.3 — Declarative Config (aterm.yml)
- Define sessions, layouts, automation in YAML
- Commit to repo — teammates run `aterm --config aterm.yml`
- Same pattern as HiveTerm's `hive.yml` but with ATerm's full session model
- Environment variable substitution, secret references

### Step 4.4 — Agent-to-Agent Communication
- Cross-session event bus
- Broadcast channel (one-to-many)
- Session scratchpads readable by other sessions
- State change webhooks (notify URL when session state changes)

---

## Phase 5 — The Network (Multi-Instance)

**Delivers:** ATerm instances talk to each other.

### Step 5.1 — Remote Session Proxy
- ATerm instance A can proxy sessions from ATerm instance B
- Same API — agent doesn't know if session is local or remote
- Authenticated via token + TLS

### Step 5.2 — Unified View
- Browser UI shows sessions from multiple ATerm instances
- Federated session list with instance labels
- Cross-instance search
- Cross-instance broadcast

### Step 5.3 — Headless Mode
- `aterm --headless` runs server without UI build
- For CI/CD, production monitoring, Docker containers
- API and MCP only — no frontend assets served

---

## Invariants (Verified After Every Step)

1. All existing tests pass
2. API returns correct progressive-disclosure responses at all 3 tiers
3. Output Intelligence correctly detects state for bash, python, node shells
4. MCP server responds to `tools/list` and `tools/call`
5. No unhandled promise rejections or uncaught exceptions
6. SQLite schema migrations are forward-compatible
7. WebSocket connections survive server restart (auto-reconnect)
8. Memory usage stays under 100MB for 10 concurrent sessions

---

## What This Achieves

After Phase 1: The moat. Output Intelligence + API + MCP. No UI, but any agent can connect.
After Phase 2: The product. Humans and agents use the same tool.
After Phase 3: The memory. Sessions persist, history searchable, checkpoints enable experimentation.
After Phase 4: The network effect. ATerm connects to everything — bridges, automation, other agents.
After Phase 5: The platform. ATerm instances form a mesh. One surface for everything.

The gap table from the competitive research:

```
                  Has API  Has Web  Has Output  Has MCP  Has Multi-  Has
                  for LLMs UI       Intelligence Server   Session    Automation
After Phase 1:   YES      no       YES         YES      YES         no
After Phase 2:   YES      YES      YES         YES      YES         no
After Phase 3:   YES      YES      YES         YES      YES         partial
After Phase 4:   YES      YES      YES         YES      YES         YES
After Phase 5:   YES      YES      YES         YES      YES         YES (mesh)
```

Phase 1 alone puts ATerm ahead of every competitor on 4 of 6 properties.
Phase 2 puts it at 5 of 6.
Phase 4 completes the set.
Phase 5 goes beyond.
