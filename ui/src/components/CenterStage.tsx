/**
 * CenterStage — the void. Either the empty welcome state or the terminal grid.
 *
 * Quiet by default. The terminal is the centerpiece — surrounded by black,
 * with a thin glass frame and a sparse toolbar above it.
 */
import { AnimatePresence, motion } from "motion/react";
import { tv } from "tailwind-variants";
import { useMemo } from "react";
import { Terminal } from "./Terminal";
import { MarksPanel } from "./MarksPanel";
import type { SessionInfo } from "../hooks/useEvents";
import { useHarness, type Layout } from "../state/harness";
import { usePointerFlare } from "../hooks/usePointerFlare";

interface TerminalStateMsg {
  state: string;
  confidence: number;
  method: string;
  detail: string;
}

interface Props {
  sessions: SessionInfo[];
  activeSession: SessionInfo | null;
  onSelectSession: (s: SessionInfo) => void;
  onStateChange: (msg: TerminalStateMsg) => void;
}

const grid = tv({
  base: "flex-1 overflow-auto grid gap-3 p-3 content-start",
  variants: {
    layout: {
      single: "grid-cols-1",
      tabs: "grid-cols-1",
      auto: "grid-cols-[repeat(auto-fill,minmax(480px,1fr))]",
      "2x1": "grid-cols-2",
      "3x1": "grid-cols-3",
      "2x2": "grid-cols-2",
    } satisfies Record<Layout, string>,
  },
});

const LAYOUT_OPTIONS: { value: Layout; label: string }[] = [
  { value: "single", label: "Single" },
  { value: "auto", label: "Auto" },
  { value: "2x1", label: "2 col" },
  { value: "3x1", label: "3 col" },
  { value: "2x2", label: "2×2" },
  { value: "tabs", label: "Tabs" },
];

export function CenterStage({ sessions, activeSession, onSelectSession, onStateChange }: Props) {
  const layout = useHarness((s) => s.layout);
  const setLayout = useHarness((s) => s.setLayout);
  const marksVisible = useHarness((s) => s.marksVisible);
  const toggleMarks = useHarness((s) => s.toggleMarks);
  const activeModel = useHarness((s) => s.activeModel);
  const density = useHarness((s) => s.density);

  const visibleSessions = useMemo(() => {
    if (layout === "single" || layout === "tabs") {
      return activeSession ? [activeSession] : [];
    }
    return sessions.filter((s) => s.status !== "stopped" && s.status !== "exited");
  }, [layout, activeSession, sessions]);

  return (
    <main className="flex-1 flex flex-col min-w-0 min-h-0 relative">
      {/* sparse toolbar */}
      <div className="glass-soft hairline-b flex items-center gap-2 px-3 py-2 shrink-0">
        <div className="flex items-center gap-1 rounded-md border border-[var(--line)] p-0.5">
          {LAYOUT_OPTIONS.map((opt) => {
            const active = layout === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setLayout(opt.value)}
                className={`px-2 py-1 text-[10.5px] tracking-[0.06em] rounded ${
                  active
                    ? "bg-[var(--cyan-dim)] text-[var(--cyan)]"
                    : "text-[var(--muted)] hover:text-[var(--text)]"
                }`}
                style={{ transition: "color var(--t-fast) var(--easing), background var(--t-fast) var(--easing)" }}
                aria-pressed={active}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1" />

        <button
          onClick={toggleMarks}
          className={`px-2.5 py-1 rounded-md text-[11px] border ${
            marksVisible
              ? "border-[var(--line-cyan)] text-[var(--cyan)] bg-[var(--cyan-dim)]"
              : "border-[var(--line)] text-[var(--muted)] hover:text-[var(--text)]"
          }`}
          style={{ transition: "color var(--t-fast) var(--easing), background var(--t-fast) var(--easing), border-color var(--t-fast) var(--easing)" }}
          aria-pressed={marksVisible}
        >
          Marks
        </button>
      </div>

      {layout === "tabs" && sessions.length > 0 && (
        <TabsBar sessions={sessions} activeSession={activeSession} onSelectSession={onSelectSession} />
      )}

      <AnimatePresence mode="wait">
        {visibleSessions.length > 0 ? (
          <motion.div
            key="grid"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className={grid({ layout })}
          >
            {visibleSessions.map((s) => (
              <TerminalCard
                key={s.id}
                session={s}
                active={activeSession?.id === s.id}
                marksVisible={marksVisible && activeSession?.id === s.id}
                onSelect={() => onSelectSession(s)}
                onStateChange={activeSession?.id === s.id ? onStateChange : undefined}
                layout={layout}
              />
            ))}
          </motion.div>
        ) : (
          <EmptyState density={density} activeModel={activeModel} />
        )}
      </AnimatePresence>
    </main>
  );
}

function TerminalCard({
  session,
  active,
  marksVisible,
  onSelect,
  onStateChange,
  layout,
}: {
  session: SessionInfo;
  active: boolean;
  marksVisible: boolean;
  onSelect: () => void;
  onStateChange?: (msg: TerminalStateMsg) => void;
  layout: Layout;
}) {
  const flare = usePointerFlare<HTMLDivElement>(0.7);
  const minHeight =
    layout === "single" || layout === "tabs"
      ? "calc(100vh - 180px)"
      : layout === "2x2"
        ? "calc(50vh - 100px)"
        : "320px";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
      className={`flare glass rounded-xl overflow-hidden flex flex-col ${active ? "glass-active" : ""}`}
      style={{ minHeight, borderColor: active ? "var(--line-cyan)" : undefined }}
      onClick={onSelect}
      {...flare}
    >
      <div className="hairline-b flex items-center gap-2 px-3 py-1.5 shrink-0">
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{
            background:
              session.status === "ready"
                ? "var(--green)"
                : session.status === "busy"
                  ? "var(--yellow)"
                  : session.status === "waiting_for_input"
                    ? "var(--orange)"
                    : session.status === "error"
                      ? "var(--red)"
                      : session.status === "starting"
                        ? "var(--cyan)"
                        : "var(--dim)",
            boxShadow:
              session.status === "ready"
                ? "0 0 8px var(--green)"
                : session.status === "busy"
                  ? "0 0 8px var(--yellow)"
                  : "none",
          }}
          aria-hidden="true"
        />
        <span className="text-[11.5px] tracking-[0.04em] text-[var(--text-dim)] flex-1 truncate">
          {session.label ?? session.name}
        </span>
        <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--dim)]">
          {session.status}
        </span>
      </div>
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0" style={{ background: "#000000" }}>
          <Terminal sessionId={session.id} onStateChange={onStateChange} />
        </div>
        {marksVisible && <MarksPanel sessionId={session.id} visible={marksVisible} />}
      </div>
    </motion.div>
  );
}

function TabsBar({
  sessions,
  activeSession,
  onSelectSession,
}: {
  sessions: SessionInfo[];
  activeSession: SessionInfo | null;
  onSelectSession: (s: SessionInfo) => void;
}) {
  return (
    <div className="glass-soft hairline-b flex overflow-x-auto shrink-0 px-2">
      {sessions
        .filter((s) => s.status !== "stopped")
        .map((s) => {
          const active = activeSession?.id === s.id;
          return (
            <button
              key={s.id}
              onClick={() => onSelectSession(s)}
              className={`relative px-3 py-2 text-[11.5px] whitespace-nowrap ${
                active ? "text-[var(--text)]" : "text-[var(--muted)] hover:text-[var(--text)]"
              }`}
              style={{ transition: "color var(--t-fast) var(--easing)" }}
            >
              {s.label ?? s.name}
              {active && (
                <motion.span
                  layoutId="tab-underline"
                  className="absolute left-2 right-2 bottom-0 h-px"
                  style={{ background: "var(--cyan)", boxShadow: "0 0 8px var(--cyan)" }}
                />
              )}
            </button>
          );
        })}
    </div>
  );
}

function EmptyState({ density, activeModel }: { density: "zen" | "calm" | "full"; activeModel: string }) {
  return (
    <motion.div
      key="empty"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="flex-1 grid place-items-center select-none"
    >
      <div className="flex flex-col items-center gap-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, rotate: 0 }}
          animate={{ opacity: 1, scale: 1, rotate: 360 }}
          transition={{
            opacity: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
            scale: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
            rotate: { duration: 80, repeat: Infinity, ease: "linear" },
          }}
          className="diamond-mark diamond-mark-active"
          aria-hidden="true"
        />
        {density !== "zen" && (
          <div className="text-center space-y-1.5">
            <div className="text-[14px] text-[var(--text)] tracking-[0.04em]">Ready when you are.</div>
            {density === "full" && (
              <div className="text-[11px] text-[var(--dim)] tracking-[0.08em] uppercase">
                {activeModel}
              </div>
            )}
            <div className="text-[10.5px] text-[var(--muted)] mt-3 tracking-[0.04em]">
              ⌘K · command palette &nbsp;·&nbsp; Ctrl+1–9 · switch sessions
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
