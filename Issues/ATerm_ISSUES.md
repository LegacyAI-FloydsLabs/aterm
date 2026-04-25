# ATerm — Issues Ledger

**Project:** ATerm
**Last Updated:** 2026-04-24 17:30 EDT

---

## Open Issues

| ID | Created | Title | Status | Owner | Priority |
|----|---------|-------|--------|-------|----------|
| ISSUE-0001 | 2026-04-24 | Floyd TTY Bridge integration not implemented | New | Floyd | P2 |
| ISSUE-0002 | 2026-04-24 | Automation (cron/launchd) not implemented | New | Floyd | P2 |
| ISSUE-0003 | 2026-04-24 | MCP Streamable HTTP transport not implemented (stdio only) | New | Floyd | P3 |
| ISSUE-0004 | 2026-04-24 | Light theme defined in CSS vars but no toggle in UI | New | Floyd | P4 |
| ISSUE-0005 | 2026-04-24 | Mobile responsiveness not tested | New | Floyd | P4 |
| ISSUE-0006 | 2026-04-24 | Memory usage invariant not formally measured (100MB for 10 sessions) | New | Floyd | P3 |

## Resolved Issues

| ID | Created | Title | Status | Resolution |
|----|---------|-------|--------|------------|
| ISSUE-R001 | 2026-04-24 | MCP server creates dual PTY pool | Resolved | Rewritten as HTTP proxy (commit fcdb5f4) |
| ISSUE-R002 | 2026-04-24 | State detector fails all 5 test scenarios | Resolved | 5-layer architecture (commit c5fd130) |
| ISSUE-R003 | 2026-04-24 | Sidebar polls every 2 seconds | Resolved | Replaced with /ws/events push (commit fedeed6) |
| ISSUE-R004 | 2026-04-24 | WebSocket no auto-reconnect | Resolved | Exponential backoff implemented (commit fedeed6) |
| ISSUE-R005 | 2026-04-24 | Session name displayed as truncated UUID | Resolved | Full session object passed from sidebar (commit fedeed6) |

---

## Change Log

- 2026-04-24 17:30 EDT — Initial issues ledger created. 6 open issues, 5 resolved.
