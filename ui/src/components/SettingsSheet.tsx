/**
 * SettingsSheet — slide-in glass panel for visual + behavioral settings.
 *
 * Density (Zen / Calm / Full), model label, timeline overlay vs column.
 */
import { Dialog } from "@base-ui-components/react/dialog";
import { motion, AnimatePresence } from "motion/react";
import { useHarness, type Density } from "../state/harness";

const DENSITY_OPTIONS: { value: Density; label: string; help: string }[] = [
  { value: "zen", label: "Zen", help: "Just the mark. Nothing else." },
  { value: "calm", label: "Calm", help: "Mark + 'Ready when you are.'" },
  { value: "full", label: "Full", help: "Mark + line + model + hints" },
];

export function SettingsSheet() {
  const open = useHarness((s) => s.settingsOpen);
  const setOpen = useHarness((s) => s.setSettingsOpen);
  const density = useHarness((s) => s.density);
  const setDensity = useHarness((s) => s.setDensity);
  const activeModel = useHarness((s) => s.activeModel);
  const setModel = useHarness((s) => s.setModel);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal keepMounted>
            <Dialog.Backdrop
              render={
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.22 }}
                  className="fixed inset-0 z-[100]"
                  style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(8px)" }}
                />
              }
            />
            <Dialog.Popup
              render={
                <motion.div
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 24 }}
                  transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
                  className="glass glass-active fixed right-4 top-4 bottom-4 z-[110] w-[360px] max-w-[calc(100vw-32px)] flex flex-col overflow-hidden rounded-xl"
                  style={{ borderColor: "var(--line-cyan)" }}
                />
              }
            >
              <div className="hairline-b px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="diamond diamond-cyan" aria-hidden="true" />
                  <Dialog.Title className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
                    Settings
                  </Dialog.Title>
                </div>
                <Dialog.Close
                  className="w-7 h-7 grid place-items-center rounded-md text-[var(--muted)] hover:text-[var(--cyan)] hover:bg-white/[0.04]"
                  aria-label="Close settings"
                >
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                    <path d="M2 2l7 7M9 2l-7 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                </Dialog.Close>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-6">
                <Group title="Density">
                  <div className="grid grid-cols-3 gap-1.5">
                    {DENSITY_OPTIONS.map((opt) => {
                      const active = density === opt.value;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => setDensity(opt.value)}
                          className={`rounded-md px-2 py-2 text-[11px] border ${
                            active
                              ? "border-[var(--line-cyan)] text-[var(--cyan)] bg-[var(--cyan-dim)]"
                              : "border-[var(--line)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--line-strong)]"
                          }`}
                          style={{ transition: "color var(--t-fast) var(--easing), background var(--t-fast) var(--easing), border-color var(--t-fast) var(--easing)" }}
                          aria-pressed={active}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10.5px] text-[var(--dim)] mt-2 leading-relaxed">
                    {DENSITY_OPTIONS.find((o) => o.value === density)?.help}
                  </p>
                </Group>

                <Group title="Active model">
                  <input
                    value={activeModel}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full px-3 py-2 text-[12px] rounded-md border border-[var(--line)] bg-black/40 text-[var(--text)] focus:border-[var(--line-cyan)]"
                    style={{ transition: "border-color var(--t-fast) var(--easing)" }}
                    spellCheck={false}
                  />
                </Group>

                <Group title="Keyboard">
                  <ShortcutRow keys="⌘K" label="Command palette" />
                  <ShortcutRow keys="⌘B" label="Toggle sidebar" />
                  <ShortcutRow keys="⌘1–9" label="Switch session" />
                  <ShortcutRow keys="Ctrl+Tab" label="Cycle sessions" />
                </Group>
              </div>

              <div className="hairline-t px-5 py-3 text-[10px] text-[var(--dim)] tracking-[0.06em]">
                Absolute Void · ATerm v0.1.0
              </div>
            </Dialog.Popup>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="text-[9.5px] uppercase tracking-[0.22em] text-[var(--cyan)] opacity-70">
        {title}
      </div>
      {children}
    </section>
  );
}

function ShortcutRow({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex items-center justify-between text-[11.5px] text-[var(--text-dim)] py-1">
      <span>{label}</span>
      <kbd
        className="px-2 py-0.5 rounded text-[10px] tracking-[0.06em]"
        style={{ background: "rgba(255,255,255,0.04)", color: "var(--muted)" }}
      >
        {keys}
      </kbd>
    </div>
  );
}
