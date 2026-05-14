import { create } from "zustand";
import type { SessionInfo } from "../hooks/useEvents";

export type TimelineKind =
  | "session_created"
  | "session_started"
  | "session_stopped"
  | "session_state"
  | "session_deleted"
  | "layout_changed"
  | "system";

export interface TimelineEvent {
  id: string;
  kind: TimelineKind;
  label: string;
  detail?: string;
  sessionId?: string;
  createdAt: number;
}

export type Layout = "single" | "tabs" | "auto" | "2x1" | "3x1" | "2x2";
export type Density = "zen" | "calm" | "full";

interface HarnessState {
  activeModel: string;
  activeSessionId: string | null;
  layout: Layout;
  density: Density;
  sidebarVisible: boolean;
  timelineExpanded: boolean;
  timelineOverlay: boolean;
  marksVisible: boolean;
  paletteOpen: boolean;
  settingsOpen: boolean;
  timeline: TimelineEvent[];

  setActiveSession: (id: string | null) => void;
  setLayout: (l: Layout) => void;
  setDensity: (d: Density) => void;
  toggleSidebar: () => void;
  toggleTimeline: () => void;
  toggleTimelineOverlay: () => void;
  toggleMarks: () => void;
  setPaletteOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setModel: (m: string) => void;
  pushTimeline: (event: Omit<TimelineEvent, "id" | "createdAt"> & { createdAt?: number }) => void;
  clearTimeline: () => void;
}

const TIMELINE_LIMIT = 200;

let _tid = 0;
function nextId(): string {
  _tid = (_tid + 1) & 0xffffffff;
  return `t-${Date.now().toString(36)}-${_tid.toString(36)}`;
}

export const useHarness = create<HarnessState>((set) => ({
  activeModel: "aterm/pty-1.0",
  activeSessionId: null,
  layout: "single",
  density: "calm",
  sidebarVisible: true,
  timelineExpanded: false,
  timelineOverlay: false,
  marksVisible: false,
  paletteOpen: false,
  settingsOpen: false,
  timeline: [],

  setActiveSession: (id) => set({ activeSessionId: id }),
  setLayout: (l) =>
    set((s) => ({
      layout: l,
      timeline: appendTimeline(s.timeline, {
        kind: "layout_changed",
        label: `Layout · ${l}`,
      }),
    })),
  setDensity: (d) => set({ density: d }),
  toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
  toggleTimeline: () => set((s) => ({ timelineExpanded: !s.timelineExpanded })),
  toggleTimelineOverlay: () => set((s) => ({ timelineOverlay: !s.timelineOverlay })),
  toggleMarks: () => set((s) => ({ marksVisible: !s.marksVisible })),
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setModel: (m) => set({ activeModel: m }),
  pushTimeline: (event) =>
    set((s) => ({
      timeline: appendTimeline(s.timeline, event),
    })),
  clearTimeline: () => set({ timeline: [] }),
}));

function appendTimeline(
  list: TimelineEvent[],
  event: Omit<TimelineEvent, "id" | "createdAt"> & { createdAt?: number }
): TimelineEvent[] {
  const next: TimelineEvent = {
    id: nextId(),
    createdAt: event.createdAt ?? Date.now(),
    kind: event.kind,
    label: event.label,
    detail: event.detail,
    sessionId: event.sessionId,
  };
  const out = [next, ...list];
  if (out.length > TIMELINE_LIMIT) out.length = TIMELINE_LIMIT;
  return out;
}

// Re-export for callers that previously imported from useEvents alone.
export type { SessionInfo };
