/**
 * Command Palette — ⌘K. Searchable command surface.
 *
 * Uses Base UI Dialog for focus trap + a11y, custom black-glass shell on top.
 * State is centralized in useHarness so any caller can open/close it.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Dialog } from "@base-ui-components/react/dialog";
import { motion, AnimatePresence } from "motion/react";
import { apiDo } from "../hooks/useApi";
import type { SessionInfo } from "../hooks/useEvents";
import { useHarness, type Layout } from "../state/harness";

interface Cmd {
  id: string;
  label: string;
  category: string;
  shortcut?: string;
  action: () => void;
}

interface Props {
  sessions: SessionInfo[];
  activeSessionId: string | null;
  onSelectSession: (s: SessionInfo) => void;
}

export function CommandPalette({ sessions, activeSessionId, onSelectSession }: Props) {
  const open = useHarness((s) => s.paletteOpen);
  const setOpen = useHarness((s) => s.setPaletteOpen);
  const toggleSidebar = useHarness((s) => s.toggleSidebar);
  const setLayout = useHarness((s) => s.setLayout);
  const setSettingsOpen = useHarness((s) => s.setSettingsOpen);
  const pushTimeline = useHarness((s) => s.pushTimeline);

  const [query, setQuery] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: Cmd[] = useMemo(
    () => [
      ...sessions.map((s, i) => ({
        id: `session-${s.id}`,
        label: `Switch · ${s.label ?? s.name}`,
        category: "Sessions",
        shortcut: i < 9 ? `⌘${i + 1}` : undefined,
        action: () => onSelectSession(s),
      })),
      ...(activeSessionId
        ? [
            {
              id: "stop",
              label: "Stop current session",
              category: "Session",
              action: () => apiDo({ action: "stop", session: activeSessionId }),
            },
            {
              id: "restart",
              label: "Restart current session",
              category: "Session",
              action: async () => {
                await apiDo({ action: "stop", session: activeSessionId });
                setTimeout(() => apiDo({ action: "start", session: activeSessionId }), 500);
              },
            },
            {
              id: "cancel",
              label: "Send Ctrl+C",
              category: "Session",
              action: () => apiDo({ action: "cancel", session: activeSessionId }),
            },
            {
              id: "checkpoint",
              label: "Save checkpoint",
              category: "Session",
              action: () => apiDo({ action: "checkpoint", session: activeSessionId }),
            },
          ]
        : []),
      ...(["single", "auto", "2x1", "3x1", "2x2", "tabs"] as Layout[]).map((l) => ({
        id: `layout-${l}`,
        label: `Layout · ${l}`,
        category: "Layout",
        action: () => setLayout(l),
      })),
      {
        id: "sidebar",
        label: "Toggle sidebar",
        category: "UI",
        shortcut: "⌘B",
        action: toggleSidebar,
      },
      {
        id: "settings",
        label: "Open settings",
        category: "UI",
        action: () => setSettingsOpen(true),
      },
      {
        id: "new",
        label: "New session · bash",
        category: "Session",
        action: async () => {
          const name = `shell-${Date.now().toString(36)}`;
          const data = await apiDo({
            action: "create",
            session: name,
            command: "bash",
            auto_start: true,
          });
          if (data.ok && data.id) {
            onSelectSession({ id: data.id, name, status: "starting" });
            pushTimeline({
              kind: "session_created",
              label: `Created · ${name}`,
              detail: "bash",
              sessionId: data.id,
            });
          }
        },
      },
    ],
    [
      sessions,
      activeSessionId,
      onSelectSession,
      setLayout,
      toggleSidebar,
      setSettingsOpen,
      pushTimeline,
    ]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || c.category.toLowerCase().includes(q)
    );
  }, [commands, query]);

  const grouped = useMemo(() => {
    const m = new Map<string, Cmd[]>();
    for (const c of filtered) {
      const arr = m.get(c.category) ?? [];
      arr.push(c);
      m.set(c.category, arr);
    }
    return m;
  }, [filtered]);

  const execute = useCallback(
    (cmd: Cmd) => {
      cmd.action();
      setOpen(false);
      setQuery("");
      setIdx(0);
    },
    [setOpen]
  );

  // global hotkeys (palette, sidebar, session indices, cycle)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen(!useHarness.getState().paletteOpen);
        setQuery("");
        setIdx(0);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "b" && !e.shiftKey) {
        if (document.activeElement?.closest(".xterm")) return;
        e.preventDefault();
        toggleSidebar();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key >= "1" && e.key <= "9") {
        const i = parseInt(e.key) - 1;
        if (i < sessions.length) {
          e.preventDefault();
          onSelectSession(sessions[i]!);
        }
        return;
      }
      if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault();
        if (sessions.length === 0) return;
        const cur = sessions.findIndex((s) => s.id === activeSessionId);
        const next = (cur + 1) % sessions.length;
        onSelectSession(sessions[next]!);
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [sessions, activeSessionId, onSelectSession, setOpen, toggleSidebar]);

  // palette-internal kb nav
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setIdx((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const cmd = filtered[idx];
        if (cmd) execute(cmd);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, filtered, idx, execute]);

  // Reset the highlighted index whenever the search query changes — this is
  // the canonical "derive UI state from input" case the effect-warning misses.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setIdx(0), [query]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal keepMounted>
            <Dialog.Backdrop
              render={
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.22 }}
                  className="fixed inset-0 z-[100]"
                  style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(8px)" }}
                />
              }
            />
            <Dialog.Popup
              render={
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.98 }}
                  transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                  className="glass glass-active fixed left-1/2 top-[15vh] z-[110] w-[560px] max-w-[calc(100vw-32px)] max-h-[60vh] flex flex-col overflow-hidden rounded-xl -translate-x-1/2"
                  style={{ borderColor: "var(--line-cyan)" }}
                />
              }
            >
              <Dialog.Title className="sr-only">Command palette</Dialog.Title>
              <div className="relative hairline-b">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--cyan)]">
                  ✦
                </span>
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Type a command…"
                  className="w-full pl-10 pr-4 py-3.5 text-[14px] bg-transparent text-[var(--text)] placeholder:text-[var(--dim)]"
                />
                <kbd className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] text-[var(--dim)] tracking-[0.12em]">
                  ESC
                </kbd>
              </div>
              <div className="overflow-y-auto max-h-[44vh]">
                {filtered.length === 0 && (
                  <div className="px-4 py-6 text-center text-[12px] text-[var(--muted)]">
                    No matching commands
                  </div>
                )}
                {[...grouped.entries()].map(([category, cmds]) => (
                  <div key={category}>
                    <div className="px-4 py-1.5 text-[9.5px] uppercase tracking-[0.22em] text-[var(--cyan)] opacity-70 sticky top-0 glass-strong">
                      {category}
                    </div>
                    {cmds.map((cmd) => {
                      const global = filtered.indexOf(cmd);
                      const selected = global === idx;
                      return (
                        <button
                          key={cmd.id}
                          onClick={() => execute(cmd)}
                          onMouseEnter={() => setIdx(global)}
                          className={`w-full text-left px-4 py-2 text-[12.5px] flex justify-between items-center gap-3 ${
                            selected
                              ? "bg-[var(--cyan-dim)] text-[var(--text)]"
                              : "text-[var(--text-dim)] hover:text-[var(--text)]"
                          }`}
                          style={{
                            transition:
                              "background var(--t-fast) var(--easing), color var(--t-fast) var(--easing)",
                          }}
                        >
                          <span className="truncate">{cmd.label}</span>
                          {cmd.shortcut && (
                            <kbd
                              className="shrink-0 text-[10px] px-1.5 py-0.5 rounded"
                              style={{
                                background: "rgba(255,255,255,0.04)",
                                color: "var(--muted)",
                              }}
                            >
                              {cmd.shortcut}
                            </kbd>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </Dialog.Popup>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
