/**
 * Sidebar — session list + add session form.
 *
 * Each session shows: name, status dot, tags.
 * Click to select. Form to add new sessions.
 */
import { useState, useEffect, useCallback } from "react";
import { apiDo } from "../hooks/useApi";

interface Session {
  id: string;
  name: string;
  label: string | null;
  status: string;
  tags: string[];
  pid: number | null;
}

interface Props {
  activeSession: string | null;
  onSelectSession: (id: string) => void;
  onSessionsChange: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  ready: "var(--green)",
  busy: "var(--yellow)",
  waiting_for_input: "var(--orange)",
  error: "var(--red)",
  stopped: "var(--border)",
  exited: "var(--border)",
  starting: "var(--accent)",
};

export function Sidebar({ activeSession, onSelectSession, onSessionsChange }: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [command, setCommand] = useState("bash");
  const [directory, setDirectory] = useState("");

  const refreshSessions = useCallback(async () => {
    const data = await apiDo({ action: "list" });
    if (data.ok) setSessions(data.sessions);
  }, []);

  useEffect(() => {
    refreshSessions();
    const interval = setInterval(refreshSessions, 2000);
    return () => clearInterval(interval);
  }, [refreshSessions]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const data = await apiDo({
      action: "create",
      session: name.trim(),
      command: command.trim() || "bash",
      directory: directory.trim() || "/tmp",
      auto_start: true,
    });
    if (data.ok) {
      setName("");
      setCommand("bash");
      setDirectory("");
      setShowForm(false);
      refreshSessions();
      onSessionsChange();
      onSelectSession(data.id);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await apiDo({ action: "delete", session: id });
    refreshSessions();
    onSessionsChange();
  };

  return (
    <div
      style={{
        width: "var(--sidebar-width)",
        background: "var(--bg-panel)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ fontWeight: 600, color: "var(--text-bright)", fontSize: "0.9rem" }}>
          ATerm
        </span>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            background: showForm ? "var(--border)" : "var(--accent)",
            color: showForm ? "var(--text)" : "#000",
            border: "none",
            borderRadius: 4,
            padding: "4px 10px",
            cursor: "pointer",
            fontSize: "0.8rem",
            fontWeight: 600,
          }}
        >
          {showForm ? "Cancel" : "+ New"}
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <form
          onSubmit={handleAdd}
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <input
            placeholder="Session name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            style={{
              background: "var(--bg-input)",
              border: "1px solid var(--border)",
              color: "var(--text-bright)",
              padding: "6px 8px",
              borderRadius: 4,
              fontSize: "0.85rem",
              outline: "none",
            }}
          />
          <input
            placeholder="Command (default: bash)"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            style={{
              background: "var(--bg-input)",
              border: "1px solid var(--border)",
              color: "var(--text-bright)",
              padding: "6px 8px",
              borderRadius: 4,
              fontSize: "0.85rem",
              outline: "none",
            }}
          />
          <input
            placeholder="Directory (default: /tmp)"
            value={directory}
            onChange={(e) => setDirectory(e.target.value)}
            style={{
              background: "var(--bg-input)",
              border: "1px solid var(--border)",
              color: "var(--text-bright)",
              padding: "6px 8px",
              borderRadius: 4,
              fontSize: "0.85rem",
              outline: "none",
            }}
          />
          <button
            type="submit"
            style={{
              background: "var(--accent)",
              color: "#000",
              border: "none",
              borderRadius: 4,
              padding: "7px",
              cursor: "pointer",
              fontSize: "0.85rem",
              fontWeight: 600,
            }}
          >
            Add & Start
          </button>
        </form>
      )}

      {/* Session list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {sessions.length === 0 && (
          <div style={{ padding: "16px", textAlign: "center", opacity: 0.5, fontSize: "0.85rem" }}>
            No sessions. Click + New to create one.
          </div>
        )}
        {sessions.map((s) => (
          <div
            key={s.id}
            onClick={() => onSelectSession(s.id)}
            style={{
              padding: "8px 16px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: activeSession === s.id ? "var(--bg-input)" : "transparent",
              borderLeft: activeSession === s.id ? "2px solid var(--accent)" : "2px solid transparent",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => {
              if (activeSession !== s.id) e.currentTarget.style.background = "var(--bg-header)";
            }}
            onMouseLeave={(e) => {
              if (activeSession !== s.id) e.currentTarget.style.background = "transparent";
            }}
          >
            {/* Status dot */}
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: STATUS_COLORS[s.status] ?? "var(--border)",
                flexShrink: 0,
              }}
            />
            {/* Name */}
            <div style={{ flex: 1, overflow: "hidden" }}>
              <div
                style={{
                  fontSize: "0.85rem",
                  color: "var(--text-bright)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {s.label ?? s.name}
              </div>
              {s.tags.length > 0 && (
                <div style={{ fontSize: "0.7rem", opacity: 0.5 }}>
                  {s.tags.join(", ")}
                </div>
              )}
            </div>
            {/* Delete button */}
            <button
              onClick={(e) => handleDelete(s.id, e)}
              style={{
                background: "none",
                border: "none",
                color: "var(--text)",
                cursor: "pointer",
                opacity: 0.3,
                fontSize: "0.75rem",
                padding: "2px 4px",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.color = "var(--red)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.3"; e.currentTarget.style.color = "var(--text)"; }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "8px 16px",
          borderTop: "1px solid var(--border)",
          fontSize: "0.7rem",
          opacity: 0.5,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>ATerm v0.1.0</span>
        <span>{sessions.filter((s) => s.status === "ready" || s.status === "busy").length} active</span>
      </div>
    </div>
  );
}
