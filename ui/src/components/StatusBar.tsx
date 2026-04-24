/**
 * Status bar — bottom bar showing connection state and active session info.
 */
interface Props {
  sessionName: string | null;
  sessionStatus: string | null;
  stateConfidence: number | null;
  stateMethod: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  ready: "Ready",
  busy: "Busy",
  waiting_for_input: "Waiting for input",
  error: "Error",
  stopped: "Stopped",
  exited: "Exited",
  starting: "Starting",
};

export function StatusBar({ sessionName, sessionStatus, stateConfidence, stateMethod }: Props) {
  return (
    <div
      style={{
        height: 24,
        background: "var(--bg-panel)",
        borderTop: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        padding: "0 12px",
        gap: 12,
        fontSize: "0.75rem",
        color: "var(--text)",
        flexShrink: 0,
      }}
    >
      {/* Server dot */}
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "var(--green)",
        }}
      />
      <span>Connected</span>

      <span style={{ opacity: 0.3 }}>|</span>

      {sessionName ? (
        <>
          <span style={{ color: "var(--text-bright)" }}>{sessionName}</span>
          <span style={{ opacity: 0.7 }}>
            {STATUS_LABELS[sessionStatus ?? ""] ?? sessionStatus ?? "unknown"}
          </span>
          {stateConfidence !== null && (
            <span style={{ opacity: 0.4 }}>
              {Math.round(stateConfidence * 100)}% via {stateMethod}
            </span>
          )}
        </>
      ) : (
        <span style={{ opacity: 0.5 }}>No session selected</span>
      )}

      <span style={{ flex: 1 }} />
      <span style={{ opacity: 0.4 }}>ATerm v0.1.0 — port 9600</span>
    </div>
  );
}
