/**
 * Output Marks Panel — numbered output marks in a slim glass column.
 *
 * "Mark 3" beats "the error around line 42" — agent and human reference
 * the exact same chunk by id.
 */
import { useState, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import { apiDo } from "../hooks/useApi";

interface Mark {
  id: number;
  ref: string;
  type: "command" | "output" | "error" | "prompt";
  text: string;
  lines: number;
}

interface Props {
  sessionId: string;
  visible: boolean;
}

const TYPE_COLOR: Record<string, string> = {
  command: "var(--cyan)",
  output: "var(--text-dim)",
  error: "var(--red)",
  prompt: "var(--green)",
};

const TYPE_GLYPH: Record<string, string> = {
  command: "$",
  output: "~",
  error: "!",
  prompt: "▶",
};

export function MarksPanel({ sessionId, visible }: Props) {
  const [marks, setMarks] = useState<Mark[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    if (!visible) return;
    const data = await apiDo({ action: "read", session: sessionId, include_marks: true });
    if (data.ok && data.marks) setMarks(data.marks);
  }, [sessionId, visible]);

  useEffect(() => {
    // refresh() reads from the agent backend and pulls marks into state —
    // this is the "subscribe to external system" pattern the rule expects.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [refresh]);

  if (!visible || marks.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8 }}
      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
      className="w-48 shrink-0 overflow-y-auto hairline-l glass-soft"
    >
      <div className="px-3 py-2 hairline-b text-[9.5px] uppercase tracking-[0.2em] text-[var(--cyan)] opacity-80">
        Marks · {marks.length}
      </div>

      {marks.map((m) => (
        <div
          key={m.id}
          onClick={() => setExpanded(expanded === m.id ? null : m.id)}
          className="px-2 py-1.5 cursor-pointer hairline-b"
          style={{
            background: expanded === m.id ? "rgba(255,255,255,0.025)" : undefined,
            borderLeft: `2px solid ${TYPE_COLOR[m.type] ?? "var(--line)"}`,
            transition: "background var(--t-fast) var(--easing)",
          }}
          title={m.text.slice(0, 200)}
        >
          <div className="flex items-center gap-1.5">
            <span
              className="text-[10px] font-bold w-5 text-center tabular-nums"
              style={{ color: TYPE_COLOR[m.type] }}
            >
              {m.id}
            </span>
            <span className="text-[10px]" style={{ color: TYPE_COLOR[m.type], opacity: 0.6 }}>
              {TYPE_GLYPH[m.type]}
            </span>
            <span className="text-[11px] flex-1 truncate text-[var(--text-dim)]">
              {m.text.split("\n")[0]?.slice(0, 40)}
            </span>
            <span className="text-[9px] text-[var(--dim)] tabular-nums">{m.lines}L</span>
          </div>
          {expanded === m.id && (
            <pre
              className="mt-1.5 text-[10.5px] leading-tight overflow-x-auto max-h-32 overflow-y-auto p-2 rounded-md"
              style={{
                color: "var(--text-dim)",
                background: "rgba(0,0,0,0.62)",
                fontFamily:
                  "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                border: "1px solid var(--line)",
              }}
            >
              {m.text.slice(0, 500)}
              {m.text.length > 500 && "\n…"}
            </pre>
          )}
        </div>
      ))}
    </motion.div>
  );
}
