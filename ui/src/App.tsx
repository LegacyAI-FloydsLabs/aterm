/**
 * ATerm — HarnessShell.
 *
 * Three-column glass shell over an Absolute Void background:
 *   left  — SessionsSidebar (real PTY sessions, WS-driven)
 *   center — HarnessHeader + CenterStage (terminal grid / quiet void)
 *   right — TimelineSidebar (event log)
 *   fab   — FloatingTimelineButton (bottom-right Apple-blue)
 *
 * State is centralized in useHarness (Zustand). Layout, drawer behavior,
 * palette + settings open state, density, model, timeline events.
 */
import { useState, useCallback, useEffect, useSyncExternalStore } from "react";
import { useEvents, type SessionInfo } from "./hooks/useEvents";
import { useHarness } from "./state/harness";
import { LivingVoid } from "./components/LivingVoid";
import { HarnessHeader } from "./components/HarnessHeader";
import { SessionsSidebar } from "./components/SessionsSidebar";
import { CenterStage } from "./components/CenterStage";
import { TimelineSidebar } from "./components/TimelineSidebar";
import { FloatingTimelineButton } from "./components/FloatingTimelineButton";
import { CommandPalette } from "./components/CommandPalette";
import { SettingsSheet } from "./components/SettingsSheet";
import { StatusBar } from "./components/StatusBar";

interface StateInfo {
  state: string;
  confidence: number;
  method: string;
  detail: string;
}

function subscribeMatch(query: string) {
  return (notify: () => void) => {
    const mql = window.matchMedia(query);
    mql.addEventListener("change", notify);
    return () => mql.removeEventListener("change", notify);
  };
}

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    subscribeMatch(query),
    () => window.matchMedia(query).matches,
    () => false
  );
}

export function App() {
  const { sessions, connected } = useEvents();
  const [activeSession, setActiveSession] = useState<SessionInfo | null>(null);
  const [stateInfo, setStateInfo] = useState<StateInfo | null>(null);

  const sidebarVisible = useHarness((s) => s.sidebarVisible);
  const toggleSidebar = useHarness((s) => s.toggleSidebar);
  const timelineExpanded = useHarness((s) => s.timelineExpanded);
  const toggleTimeline = useHarness((s) => s.toggleTimeline);
  const timelineOverlay = useHarness((s) => s.timelineOverlay);
  const toggleTimelineOverlay = useHarness((s) => s.toggleTimelineOverlay);
  const setActiveSessionId = useHarness((s) => s.setActiveSession);
  const setPaletteOpen = useHarness((s) => s.setPaletteOpen);

  const isMobile = useMediaQuery("(max-width: 900px)");

  const handleSelectSession = useCallback(
    (s: SessionInfo) => {
      setActiveSession(s);
      setStateInfo(null);
      setActiveSessionId(s.id);
      if (isMobile) {
        // close the drawer after picking on mobile
        useHarness.setState({ sidebarVisible: false });
      }
    },
    [isMobile, setActiveSessionId]
  );

  const handleStateChange = useCallback((msg: StateInfo) => {
    setStateInfo({
      state: msg.state,
      confidence: msg.confidence,
      method: msg.method,
      detail: msg.detail,
    });
  }, []);

  // keep active session's status in sync with WS events
  const activeStatus = activeSession
    ? sessions.find((s) => s.id === activeSession.id)?.status ??
      stateInfo?.state ??
      activeSession.status
    : null;

  // clear local active state if the session was deleted — synchronizes
  // local React state with the WS-pushed session list (external system).
  useEffect(() => {
    if (activeSession && !sessions.find((s) => s.id === activeSession.id)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveSession(null);
      setActiveSessionId(null);
    }
  }, [sessions, activeSession, setActiveSessionId]);

  // sync sidebar visibility to viewport size (subscribe-to-external-source pattern)
  useEffect(() => {
    useHarness.setState({ sidebarVisible: !isMobile });
  }, [isMobile]);

  // FAB behavior: desktop expands width; mobile toggles overlay drawer
  const onToggleFab = useCallback(() => {
    if (isMobile) {
      toggleTimelineOverlay();
    } else {
      toggleTimeline();
    }
  }, [isMobile, toggleTimeline, toggleTimelineOverlay]);

  const timelineDrawerMode = isMobile;
  const timelineVisible = isMobile ? timelineOverlay : true;

  return (
    <div className="relative h-full w-full overflow-hidden">
      <LivingVoid />

      {/* shell */}
      <div className="relative z-10 flex h-full w-full">
        <SessionsSidebar
          sessions={sessions}
          activeSessionId={activeSession?.id ?? null}
          onSelectSession={handleSelectSession}
          drawerMode={isMobile}
          visible={sidebarVisible}
          onClose={() => useHarness.setState({ sidebarVisible: false })}
        />

        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <HarnessHeader
            onToggleSidebar={toggleSidebar}
            onTogglePalette={() => setPaletteOpen(true)}
          />
          <CenterStage
            sessions={sessions}
            activeSession={activeSession}
            onSelectSession={handleSelectSession}
            onStateChange={handleStateChange}
          />
          <StatusBar
            connected={connected}
            sessionName={activeSession?.name ?? null}
            sessionStatus={activeStatus ?? null}
            stateConfidence={stateInfo?.confidence ?? null}
            stateMethod={stateInfo?.method ?? null}
          />
        </div>

        <TimelineSidebar
          drawerMode={timelineDrawerMode}
          visible={timelineVisible}
          onClose={() =>
            isMobile
              ? useHarness.setState({ timelineOverlay: false })
              : useHarness.setState({ timelineExpanded: false })
          }
          expanded={timelineExpanded}
        />
      </div>

      <FloatingTimelineButton
        expanded={isMobile ? timelineOverlay : timelineExpanded}
        onToggle={onToggleFab}
      />

      <CommandPalette
        sessions={sessions}
        activeSessionId={activeSession?.id ?? null}
        onSelectSession={handleSelectSession}
      />
      <SettingsSheet />
    </div>
  );
}
