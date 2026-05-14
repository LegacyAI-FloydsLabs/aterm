import { motion } from "motion/react";
import { useHarness } from "../state/harness";
import { usePointerFlare } from "../hooks/usePointerFlare";

interface Props {
  onToggleSidebar: () => void;
  onTogglePalette: () => void;
}

export function HarnessHeader({ onToggleSidebar, onTogglePalette }: Props) {
  const activeModel = useHarness((s) => s.activeModel);
  const setSettingsOpen = useHarness((s) => s.setSettingsOpen);
  const settingsFlare = usePointerFlare<HTMLButtonElement>();
  const paletteFlare = usePointerFlare<HTMLButtonElement>();
  const sidebarFlare = usePointerFlare<HTMLButtonElement>();

  return (
    <motion.header
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="glass hairline-b relative flex items-center gap-3 px-4 select-none"
      style={{ height: "var(--header-height)" }}
      role="banner"
    >
      <button
        {...sidebarFlare}
        onClick={onToggleSidebar}
        className="flare rounded-md w-8 h-8 grid place-items-center text-[var(--muted)] hover:text-[var(--cyan)]"
        style={{ transition: "color var(--t-fast) var(--easing)" }}
        title="Toggle sidebar (Ctrl+B)"
        aria-label="Toggle sidebar"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M2 3h10M2 7h10M2 11h7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </button>

      <div className="flex items-center gap-2.5">
        <span className="diamond diamond-cyan" aria-hidden="true" />
        <span className="text-[13px] tracking-[0.04em] text-[var(--text)]">ATerm</span>
        <span className="text-[11px] tracking-[0.06em] uppercase text-[var(--dim)]">
          self-aware terminal
        </span>
      </div>

      <div className="flex-1" />

      <div className="hidden md:flex items-center gap-2 text-[11px] text-[var(--muted)]">
        <span className="uppercase tracking-[0.16em] text-[var(--dim)]">model</span>
        <span className="text-[var(--text-dim)]">{activeModel}</span>
      </div>

      <button
        {...paletteFlare}
        onClick={onTogglePalette}
        className="flare rounded-md px-2.5 h-8 flex items-center gap-2 text-[11px] text-[var(--muted)] border border-[var(--line)] hover:border-[var(--line-cyan)] hover:text-[var(--text)]"
        title="Command palette (⌘K)"
        aria-label="Open command palette"
      >
        <span className="text-[10px] tracking-[0.18em] uppercase text-[var(--dim)]">cmd</span>
        <kbd className="px-1.5 py-0.5 text-[10px] rounded bg-white/[0.04] text-[var(--text-dim)]">⌘K</kbd>
      </button>

      <button
        {...settingsFlare}
        onClick={() => setSettingsOpen(true)}
        className="flare rounded-md w-8 h-8 grid place-items-center text-[var(--muted)] hover:text-[var(--cyan)]"
        title="Settings"
        aria-label="Open settings"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.1" />
          <path
            d="M7 1.2v1.6M7 11.2v1.6M12.8 7h-1.6M2.8 7H1.2M11.1 2.9l-1.1 1.1M4 10l-1.1 1.1M11.1 11.1L10 10M4 4 2.9 2.9"
            stroke="currentColor"
            strokeWidth="1.1"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </motion.header>
  );
}
