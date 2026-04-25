# ATerm — Single Source of Truth

**Project:** ATerm
**Last Updated:** 2026-04-24 17:30 EDT
**Authority:** This document is the authoritative source for ATerm architecture and state facts.

---

## Architecture Facts

| Fact | Value | Verified |
|------|-------|----------|
| Runtime | Node.js via tsx (not Bun — node-pty event loop incompatible) | 2026-04-24 100% — spike confirmed |
| Server framework | Hono | 2026-04-24 100% |
| PTY library | node-pty (prebuilt darwin-arm64) | 2026-04-24 100% |
| Database | better-sqlite3 (WAL mode) | 2026-04-24 100% |
| Frontend | React 19 + Vite 8 + Tailwind 4 + xterm.js v6 | 2026-04-24 100% |
| MCP SDK | @modelcontextprotocol/sdk | 2026-04-24 100% |
| Port | 9600 (claimed in port-registry.json) | 2026-04-24 100% |
| Auth | Auto-generated 256-bit token, .aterm-token, 0600 permissions | 2026-04-24 100% |
| Tests | 62 tests via node:test runner | 2026-04-24 100% |
| Lines | 5,390 TypeScript + TSX + CSS | 2026-04-24 100% |
| Files | 55 tracked in git | 2026-04-24 100% |

## State Detection Architecture

| Fact | Value | Verified |
|------|-------|----------|
| Detection layers | 5: process signals → prompt patterns + command tracking → error patterns + command context → timing heuristics → honest uncertainty | 2026-04-24 100% — 17 regression tests |
| Original design | Failed all 5 scenarios (metacognitive analysis ep_1777056625987_f4nzipfq7) | 2026-04-24 100% |
| Confidence scores | Every response includes {state, confidence: 0-1, method, detail} | 2026-04-24 100% |
| Pattern banks | 20+ prompt, 15+ input, 25+ error, 10+ progress patterns | 2026-04-24 100% |

## API State

| Fact | Value | Verified |
|------|-------|----------|
| Endpoint | POST /api/do | 2026-04-24 100% |
| Actions | 17: list, read, run, stop, start, cancel, answer, create, delete, note, search, broadcast, history, checkpoint, record, verify, batch | 2026-04-24 100% |
| Progressive disclosure | 3 tiers (small/average/frontier models) | 2026-04-24 100% |
| MCP tools | 13 via stdio transport | 2026-04-24 100% |
| MCP architecture | HTTP proxy to POST /api/do (no standalone SessionManager) | 2026-04-24 100% |

## Phase Completion

| Phase | Status | Commit |
|-------|--------|--------|
| Phase 1: Core | COMPLETE | c5fd130 |
| Phase 2: UI | COMPLETE | fcdb5f4 |
| Phase 3: Memory | COMPLETE | fedeed6 |
| Floyd's Build | COMPLETE | 4892441 |
| Documentation | COMPLETE | 08e3550 |
| Phase 4: Bridges | NOT STARTED | — |
| Phase 5: Network | NOT STARTED | — |

## Key Design Decisions

| Decision | Rationale | Date |
|----------|-----------|------|
| Node.js over Bun | node-pty onData events don't fire under Bun's event loop | 2026-04-24 |
| MCP as HTTP proxy | Prevents dual PTY pool race condition when MCP and HTTP server run simultaneously | 2026-04-24 |
| 5-layer state detection | Original regex-only approach failed metacognitive validation | 2026-04-24 |
| Push over poll | Project thesis: "terminal notifies agent, not agent polls terminal" | 2026-04-24 |
| Inside-out build order | Output Intelligence (moat) before UI (commodity) | 2026-04-24 |
| xterm.js v6 over wterm | Mature ecosystem, WebGL renderer, proven addon library. wterm monitored for future. | 2026-04-24 |

---

## Change Log

- 2026-04-24 17:30 EDT — Initial SSOT created. All facts verified against codebase at commit 08e3550.
