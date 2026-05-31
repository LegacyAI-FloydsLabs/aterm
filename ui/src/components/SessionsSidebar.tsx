/**
 * SessionsSidebar — left column. Real session list, glass treatment, cyan accent.
 * Replaces the older Sidebar but keeps the same WS-driven session model.
 */
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { ApiError, apiDo, hasAuthToken } from "../hooks/useApi";
import type { SessionInfo } from "../hooks/useEvents";
import { useHarness } from "../state/harness";
import { usePointerFlare } from "../hooks/usePointerFlare";

interface Props {
  sessions: SessionInfo[];
  activeSessionId: string | null;
  onSelectSession: (s: SessionInfo) => void;
  drawerMode: boolean;
  visible: boolean;
  onClose: () => void;
}

const STATUS_DOT: Record<string, string> = {
  ready: "var(--green)",
  busy: "var(--yellow)",
  waiting_for_input: "var(--orange)",
  error: "var(--red)",
  starting: "var(--cyan)",
  stopped: "var(--dim)",
  exited: "var(--dim)",
};

function fmtRelative(ts: number | undefined): string {
  if (!ts) return "—";
  const d = Date.now() - ts;
  if (d < 60_000) return "just now";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
  return `${Math.floor(d / 86_400_000)}d ago`;
}

export function SessionsSidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  drawerMode,
  visible,
  onClose,
}: Props) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [command, setCommand] = useState("bash");
  const [directory, setDirectory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pushTimeline = useHarness((s) => s.pushTimeline);
  const newSessionFlare = usePointerFlare<HTMLButtonElement>();

  const authReady = hasAuthToken();

  const apiErrorMessage = (err: unknown): string => {
    if (err instanceof ApiError) return err.message;
    if (err instanceof Error) return err.message;
    return "ATerm request failed";
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return;
    if (!authReady) {
      setError("Missing ATerm auth token. Open the tokenized URL printed by the ATerm server.");
      return;
    }

    const trimmed = name.trim();
    try {
      const data = await apiDo({
        action: "create",
        session: trimmed,
        command: command.trim() || "bash",
        ...(directory.trim() ? { directory: directory.trim() } : {}),
        auto_start: true,
      });
      if (data.ok && data.id) {
        setName("");
        setCommand("bash");
        setDirectory("");
        setShowForm(false);
        pushTimeline({
          kind: "session_created",
          label: `Session · ${trimmed}`,
          detail: command.trim() || "bash",
          sessionId: data.id,
        });
        onSelectSession({ id: data.id, name: trimmed, status: "starting" });
      }
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setError(null);
    try {
      await apiDo({ action: "delete", session: id });
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  };

  const activeCount = sessions.filter(
    (s) => s.status === "ready" || s.status === "busy" || s.status === "starting"
  ).length;

  const body = (
    <motion.aside
      key="sidebar"
      initial={{ x: drawerMode ? -32 : -12, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: drawerMode ? -32 : -8, opacity: 0 }}
      transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
      className={`glass hairline-r drawer-left flex flex-col overflow-hidden shrink-0 ${
        drawerMode ? "fixed top-0 bottom-0 left-0 z-50 h-full" : "h-full"
      }`}
      style={{ width: "var(--sidebar-width)" }}
      role="complementary"
      aria-label="Sessions"
    >
      <div className="flex items-center justify-between px-4 pt-4 pb-3 hairline-b">
        <div className="flex items-center gap-2">
          <span className="diamond" aria-hidden="true" />
          <span className="text-[10.5px] tracking-[0.22em] uppercase text-[var(--muted)]">
            Sessions
          </span>
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 grid place-items-center rounded text-[var(--muted)] hover:text-[var(--cyan)] transition-colors"
          aria-label="Close sessions"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <button
        {...newSessionFlare}
        onClick={() => setShowForm((v) => !v)}
        className="flare mx-3 mt-3 rounded-lg border border-[var(--line)] hover:border-[var(--line-cyan)] py-2.5 px-3 flex items-center gap-2 text-[12px] text-[var(--text-dim)] hover:text-[var(--text)]"
        style={{ transition: "border-color var(--t-fast) var(--easing), color var(--t-fast) var(--easing)" }}
      >
        <span className="text-[var(--cyan)]">✦</span>
        {showForm ? "Cancel" : "New Session"}
      </button>

      <AnimatePresence initial={false}>
        {showForm && (
          <motion.form
            key="add"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            onSubmit={handleAdd}
            className="px-3 pt-2 flex flex-col gap-2 overflow-hidden"
          >
            <input
              autoFocus
              placeholder="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="px-2.5 py-2 text-[12px] rounded-md border border-[var(--line)] bg-black/40 text-[var(--text)] placeholder:text-[var(--dim)] focus:border-[var(--line-cyan)]"
              style={{ transition: "border-color var(--t-fast) var(--easing)" }}
            />
            <input
              placeholder="command (default: bash)"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              className="px-2.5 py-2 text-[12px] rounded-md border border-[var(--line)] bg-black/40 text-[var(--text)] placeholder:text-[var(--dim)] focus:border-[var(--line-cyan)]"
              style={{ transition: "border-color var(--t-fast) var(--easing)" }}
            />
            <input
              placeholder="directory (optional)"
              value={directory}
              onChange={(e) => setDirectory(e.target.value)}
              className="px-2.5 py-2 text-[12px] rounded-md border border-[var(--line)] bg-black/40 text-[var(--text)] placeholder:text-[var(--dim)] focus:border-[var(--line-cyan)]"
              style={{ transition: "border-color var(--t-fast) var(--easing)" }}
            />
            {(!authReady || error) && (
              <p className="rounded-md border border-[var(--red)]/50 bg-[var(--red)]/10 px-2.5 py-2 text-[11px] text-[var(--red)]" role="alert">
                {error ?? "Missing auth token. Open the tokenized ATerm URL printed by the server."}
              </p>
            )}
            <button
              type="submit"
              disabled={!authReady || !name.trim()}
              className="py-2 rounded-md text-[12px] tracking-[0.06em] border border-[var(--line-cyan)] bg-[var(--cyan-soft)] text-[var(--cyan)] hover:bg-[var(--cyan-dim)] disabled:cursor-not-allowed disabled:border-[var(--line)] disabled:bg-transparent disabled:text-[var(--dim)]"
              style={{ transition: "background var(--t-fast) var(--easing)" }}
            >
              Start
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      <div className="flex-1 overflow-y-auto px-2 pt-3 pb-2 flex flex-col gap-1">
        {sessions.length === 0 && (
          <div className="px-4 py-8 text-center text-[11px] text-[var(--dim)]">
            No sessions.
            <br />
            <span className="text-[var(--muted)]">Click ✦ to create one.</span>
          </div>
        )}
        {sessions.map((s) => {
          const active = activeSessionId === s.id;
          return (
            <SessionCard
              key={s.id}
              session={s}
              active={active}
              onClick={() => onSelectSession(s)}
              onDelete={(e) => handleDelete(s.id, e)}
            />
          );
        })}
      </div>

      <div className="hairline-t px-3 py-2.5 flex items-center justify-between text-[10px] text-[var(--dim)]">
        <span>ATerm v0.1.0</span>
        <span>
          <span className="text-[var(--green)]">●</span> {activeCount} live
        </span>
      </div>
    </motion.aside>
  );

  if (drawerMode) {
    return (
      <AnimatePresence>
        {visible && (
          <>
            <motion.div
              key="scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.28 }}
              className="fixed inset-0 z-40 bg-black/70"
              onClick={onClose}
              aria-hidden="true"
            />
            {body}
          </>
        )}
      </AnimatePresence>
    );
  }

  return <AnimatePresence>{visible && body}</AnimatePresence>;
}

function SessionCard({
  session,
  active,
  onClick,
  onDelete,
}: {
  session: SessionInfo;
  active: boolean;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const flare = usePointerFlare<HTMLDivElement>();
  return (
    <div
      {...flare}
      onClick={onClick}
      className={`flare group cursor-pointer rounded-lg px-2.5 py-2.5 border ${
        active ? "border-[var(--line-cyan)] bg-[var(--cyan-dim)]" : "border-transparent hover:border-[var(--line)]"
      }`}
      style={{ transition: "border-color var(--t-fast) var(--easing), background var(--t-fast) var(--easing)" }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      aria-pressed={active}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={active ? "diamond diamond-cyan" : "diamond"}
          aria-hidden="true"
          style={
            !active && session.status
              ? { background: STATUS_DOT[session.status] ?? "rgba(255,255,255,0.25)" }
              : undefined
          }
        />
        <div className="flex-1 min-w-0">
          <div
            className={`text-[12.5px] truncate ${
              active ? "text-[var(--text)]" : "text-[var(--text-dim)] group-hover:text-[var(--text)]"
            }`}
            style={{ transition: "color var(--t-fast) var(--easing)" }}
          >
            {session.label ?? session.name}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--dim)]">
              {session.status}
            </span>
            {session.tags && session.tags.length > 0 && (
              <span className="text-[10px] text-[var(--muted)] truncate">
                {session.tags.join("·")}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 w-5 h-5 grid place-items-center rounded text-[var(--muted)] hover:text-[var(--red)]"
          style={{ transition: "opacity var(--t-fast) var(--easing)" }}
          title="Delete session"
          aria-label={`Delete ${session.name}`}
        >
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden="true">
            <path d="M2 2l5 5M7 2l-5 5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// silence unused fmtRelative warning while keeping it exported for future use
void fmtRelative;
