/**
 * Global events WebSocket hook.
 *
 * Connects to /ws/events, receives session lifecycle events,
 * keeps a live session list, and mirrors deltas into the harness
 * timeline store so the right-rail event log stays in sync.
 *
 * Project thesis: "terminal notifies agent, not agent polls terminal."
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { wsUrl } from "./useApi";
import { useHarness } from "../state/harness";

export interface SessionInfo {
  id: string;
  name: string;
  label?: string | null;
  status: string;
  tags?: string[];
  pid?: number | null;
}

export function useEvents() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const attemptsRef = useRef(0);
  const bootRef = useRef(false);
  // Self-referencing connect: ref breaks the use-before-declared cycle that
  // setTimeout(connect) would create inside the callback body.
  const connectRef = useRef<() => void>(() => {});

  const connect = useCallback(() => {
    const url = wsUrl("events");
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      attemptsRef.current = 0;
      if (!bootRef.current) {
        bootRef.current = true;
        useHarness.getState().pushTimeline({
          kind: "system",
          label: "Connected · /ws/events",
        });
      }
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        const push = useHarness.getState().pushTimeline;
        switch (msg.type) {
          case "sessions_list":
            setSessions(msg.sessions);
            break;

          case "session_created":
            setSessions((prev) => {
              if (prev.find((s) => s.id === msg.session.id)) return prev;
              return [...prev, msg.session];
            });
            push({
              kind: "session_created",
              label: `Created · ${msg.session.label ?? msg.session.name}`,
              sessionId: msg.session.id,
            });
            break;

          case "session_deleted":
            setSessions((prev) => prev.filter((s) => s.id !== msg.sessionId));
            push({
              kind: "session_deleted",
              label: `Deleted · ${msg.sessionId.slice(0, 8)}`,
              sessionId: msg.sessionId,
            });
            break;

          case "session_state":
            setSessions((prev) =>
              prev.map((s) =>
                s.id === msg.session.id
                  ? { ...s, status: msg.session.status, pid: msg.session.pid }
                  : s
              )
            );
            push({
              kind: "session_state",
              label: `State · ${msg.session.status}`,
              detail: msg.session.label ?? msg.session.name ?? msg.session.id,
              sessionId: msg.session.id,
            });
            break;

          case "session_started":
            setSessions((prev) =>
              prev.map((s) =>
                s.id === msg.session.id
                  ? { ...s, status: msg.session.status ?? "starting", pid: msg.session.pid }
                  : s
              )
            );
            push({
              kind: "session_started",
              label: `Started · ${msg.session.label ?? msg.session.name ?? msg.session.id}`,
              detail: msg.session.pid ? `pid ${msg.session.pid}` : undefined,
              sessionId: msg.session.id,
            });
            break;

          case "session_stopped":
            setSessions((prev) =>
              prev.map((s) =>
                s.id === msg.session.id
                  ? { ...s, status: msg.session.status ?? "exited", pid: null }
                  : s
              )
            );
            push({
              kind: "session_stopped",
              label: `Stopped · ${msg.session.label ?? msg.session.name ?? msg.session.id}`,
              sessionId: msg.session.id,
            });
            break;
        }
      } catch {
        /* ignore malformed */
      }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      const delay = Math.min(1000 * Math.pow(2, attemptsRef.current), 30000);
      attemptsRef.current++;
      reconnectTimer.current = setTimeout(() => connectRef.current(), delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  // keep the ref pointing at the current connect so the reconnect setTimeout
  // reaches the latest closure if deps ever change.
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { sessions, connected };
}
