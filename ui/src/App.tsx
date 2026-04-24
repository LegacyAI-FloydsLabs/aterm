/**
 * ATerm App — the self-aware terminal UI.
 *
 * Phase 3 rewrite:
 *   - Session list driven by /ws/events push (no polling)
 *   - Full session object passed from sidebar (no truncated-UUID hack)
 *   - Status bar shows real session name and state detection
 */
import { useState, useCallback } from "react";
import { Sidebar } from "./components/Sidebar";
import { Terminal } from "./components/Terminal";
import { StatusBar } from "./components/StatusBar";
import { useEvents, type SessionInfo } from "./hooks/useEvents";

interface StateInfo {
  state: string;
  confidence: number;
  method: string;
  detail: string;
}

export function App() {
  const { sessions, connected } = useEvents();
  const [activeSession, setActiveSession] = useState<SessionInfo | null>(null);
  const [stateInfo, setStateInfo] = useState<StateInfo | null>(null);

  const handleSelectSession = useCallback((session: SessionInfo) => {
    setActiveSession(session);
    setStateInfo(null);
  }, []);

  const handleStateChange = useCallback((msg: any) => {
    setStateInfo({
      state: msg.state,
      confidence: msg.confidence,
      method: msg.method,
      detail: msg.detail,
    });
  }, []);

  // Keep active session status in sync with events
  const activeStatus = activeSession
    ? sessions.find((s) => s.id === activeSession.id)?.status ?? stateInfo?.state ?? activeSession.status
    : null;

  return (
    <div className="flex flex-col h-screen w-screen">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          sessions={sessions}
          activeSessionId={activeSession?.id ?? null}
          onSelectSession={handleSelectSession}
        />

        <div className="flex-1 flex flex-col overflow-hidden">
          {activeSession ? (
            <Terminal
              key={activeSession.id}
              sessionId={activeSession.id}
              onStateChange={handleStateChange}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center flex-col gap-3 text-[var(--text)] opacity-50">
              <div className="text-3xl">$_</div>
              <div className="text-sm">Select a session or create a new one</div>
              <div className="text-xs opacity-50">ATerm — the self-aware terminal</div>
            </div>
          )}
        </div>
      </div>

      <StatusBar
        connected={connected}
        sessionName={activeSession?.name ?? null}
        sessionStatus={activeStatus ?? null}
        stateConfidence={stateInfo?.confidence ?? null}
        stateMethod={stateInfo?.method ?? null}
      />
    </div>
  );
}
