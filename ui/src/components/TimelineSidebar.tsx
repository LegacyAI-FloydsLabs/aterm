/**
 * TimelineSidebar — right column. Quiet event log driven by HarnessStore.timeline.
 */
import { AnimatePresence, motion } from "motion/react";
import { useHarness, type TimelineEvent } from "../state/harness";

interface Props {
  drawerMode: boolean;
  visible: boolean;
  onClose: () => void;
  expanded: boolean;
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

const KIND_COLOR: Record<TimelineEvent["kind"], string> = {
  session_created: "var(--cyan)",
  session_started: "var(--green)",
  session_stopped: "var(--orange)",
  session_state: "var(--yellow)",
  session_deleted: "var(--red)",
  layout_changed: "var(--muted)",
  system: "var(--muted)",
};

export function TimelineSidebar({ drawerMode, visible, onClose, expanded }: Props) {
  const timeline = useHarness((s) => s.timeline);
  const clearTimeline = useHarness((s) => s.clearTimeline);

  const width = expanded ? "var(--timeline-width-wide)" : "var(--timeline-width)";

  const body = (
    <motion.aside
      key="timeline"
      initial={{ x: drawerMode ? 32 : 12, opacity: 0 }}
      animate={{ x: 0, opacity: 1, width }}
      exit={{ x: drawerMode ? 32 : 8, opacity: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={`glass hairline-l drawer-right flex flex-col overflow-hidden shrink-0 ${
        drawerMode ? "fixed top-0 bottom-0 right-0 z-50 h-full" : "h-full"
      }`}
      style={{ width }}
      role="complementary"
      aria-label="Timeline"
    >
      <div className="flex items-center justify-between px-4 pt-4 pb-3 hairline-b">
        <div className="flex items-center gap-2">
          <span className="diamond" aria-hidden="true" />
          <span className="text-[10.5px] tracking-[0.22em] uppercase text-[var(--muted)]">
            Timeline
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {timeline.length > 0 && (
            <button
              onClick={clearTimeline}
              className="w-6 h-6 grid place-items-center rounded text-[var(--muted)] hover:text-[var(--cyan)]"
              title="Clear timeline"
              aria-label="Clear timeline"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                <path
                  d="M2 3h6M3.5 3V2h3v1M3 3l.4 5.2c0 .4.4.8.8.8h1.6c.4 0 .8-.4.8-.8L7 3"
                  stroke="currentColor"
                  strokeWidth="1.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
          <button
            onClick={onClose}
            className="w-6 h-6 grid place-items-center rounded text-[var(--muted)] hover:text-[var(--cyan)]"
            aria-label="Close timeline"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
              <path
                d="M2 2l6 6M8 2l-6 6"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {timeline.length === 0 ? (
          <div className="h-full grid place-items-center text-center px-6">
            <div className="space-y-2">
              <div className="diamond mx-auto opacity-40" aria-hidden="true" />
              <div className="text-[11px] text-[var(--dim)]">
                Quiet.
                <br />
                <span className="text-[var(--muted)]">Events will appear here.</span>
              </div>
            </div>
          </div>
        ) : (
          <ol className="space-y-2.5">
            <AnimatePresence initial={false}>
              {timeline.map((ev) => (
                <motion.li
                  key={ev.id}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  className="relative pl-4"
                >
                  <span
                    className="absolute left-0 top-1.5 w-1.5 h-1.5 rounded-full"
                    style={{
                      background: KIND_COLOR[ev.kind] ?? "var(--cyan)",
                      boxShadow: `0 0 8px ${KIND_COLOR[ev.kind] ?? "var(--cyan)"}`,
                    }}
                    aria-hidden="true"
                  />
                  <div className="text-[10px] text-[var(--dim)] tracking-[0.06em] tabular-nums">
                    {fmtTime(ev.createdAt)}
                  </div>
                  <div className="text-[12px] text-[var(--text-dim)] leading-snug">
                    {ev.label}
                  </div>
                  {ev.detail && (
                    <div className="text-[10.5px] text-[var(--muted)] truncate">{ev.detail}</div>
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        )}
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
