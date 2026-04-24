/**
 * ATerm App — the self-aware terminal UI.
 *
 * Layout: Sidebar (session list) | Main (terminal view) | StatusBar
 */
import { useState, useCallback } from "react";
import { Sidebar } from "./components/Sidebar";
import { Terminal } from "./components/Terminal";
import { StatusBar } from "./components/StatusBar";

interface StateInfo {
  state: string;
  confidence: number;
  method: string;
  detail: string;
}

export function App() {
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [sessionName, setSessionName] = useState<string | null>(null);
  const [stateInfo, setStateInfo] = useState<StateInfo | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleSelectSession = useCallback((id: string) => {
    setActiveSession(id);
    // We'll get the name from the sidebar's session list
    // For now, use ID as display name until state event arrives
    setSessionName(id.slice(0, 8));
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

  const handleSessionsChange = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", width: "100vw" }}>
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <Sidebar
          key={refreshKey}
          activeSession={activeSession}
          onSelectSession={handleSelectSession}
          onSessionsChange={handleSessionsChange}
        />

        {/* Main terminal area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {activeSession ? (
            <Terminal
              key={activeSession}
              sessionId={activeSession}
              onStateChange={handleStateChange}
            />
          ) : (
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
                gap: 12,
                color: "var(--text)",
                opacity: 0.5,
              }}
            >
              <div style={{ fontSize: "2rem" }}>$_</div>
              <div style={{ fontSize: "0.9rem" }}>
                Select a session or create a new one
              </div>
              <div style={{ fontSize: "0.75rem", opacity: 0.5 }}>
                ATerm — the self-aware terminal
              </div>
            </div>
          )}
        </div>
      </div>

      <StatusBar
        sessionName={sessionName}
        sessionStatus={stateInfo?.state ?? null}
        stateConfidence={stateInfo?.confidence ?? null}
        stateMethod={stateInfo?.method ?? null}
      />
    </div>
  );
}
