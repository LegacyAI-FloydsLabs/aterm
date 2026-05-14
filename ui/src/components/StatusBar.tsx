/**
 * Status bar — connection + active session + state detection. Quiet footer.
 */
import { motion } from "motion/react";

interface Props {
  connected: boolean;
  sessionName: string | null;
  sessionStatus: string | null;
  stateConfidence: number | null;
  stateMethod: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  ready: "Ready",
  busy: "Busy",
  waiting_for_input: "Waiting",
  error: "Error",
  stopped: "Stopped",
  exited: "Exited",
  starting: "Starting",
};

export function StatusBar({
  connected,
  sessionName,
  sessionStatus,
  stateConfidence,
  stateMethod,
}: Props) {
  return (
    <motion.footer
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
      className="glass-strong hairline-t h-7 flex items-center px-3 gap-3 text-[10.5px] text-[var(--muted)] shrink-0 tracking-[0.04em]"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{
            background: connected ? "var(--green)" : "var(--red)",
            boxShadow: connected ? "0 0 8px var(--green)" : "0 0 8px var(--red)",
          }}
          aria-hidden="true"
        />
        <span>{connected ? "connected" : "disconnected"}</span>
      </div>

      <span className="text-[var(--dim)]">·</span>

      {sessionName ? (
        <>
          <span className="text-[var(--text-dim)]">{sessionName}</span>
          <span>{STATUS_LABEL[sessionStatus ?? ""] ?? sessionStatus ?? "—"}</span>
          {stateConfidence !== null && (
            <span className="text-[var(--dim)]">
              {Math.round(stateConfidence * 100)}% · {stateMethod}
            </span>
          )}
        </>
      ) : (
        <span className="text-[var(--dim)]">no session selected</span>
      )}

      <span className="flex-1" />
      <span className="text-[var(--dim)]">ATerm v0.1.0 · port 9600</span>
    </motion.footer>
  );
}
