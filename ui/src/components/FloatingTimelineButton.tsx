/**
 * FloatingTimelineButton — vivid blue Apple-style FAB in the bottom-right.
 * Toggles the right timeline column or, on small screens, the timeline drawer.
 */
import { motion, useReducedMotion } from "motion/react";
import { usePointerFlare } from "../hooks/usePointerFlare";

interface Props {
  expanded: boolean;
  onToggle: () => void;
}

export function FloatingTimelineButton({ expanded, onToggle }: Props) {
  const flare = usePointerFlare<HTMLButtonElement>(1.2);
  const reduced = useReducedMotion();
  return (
    <motion.button
      {...flare}
      onClick={onToggle}
      initial={reduced ? false : { opacity: 0, y: 24, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileHover={reduced ? undefined : { y: -3 }}
      whileTap={reduced ? undefined : { scale: 0.96 }}
      transition={{ duration: reduced ? 0.001 : 0.52, ease: [0.16, 1, 0.3, 1] }}
      className="flare fixed z-30 grid place-items-center rounded-full border"
      style={{
        right: "28px",
        bottom: "28px",
        width: "clamp(64px, 6vw, 116px)",
        height: "clamp(64px, 6vw, 116px)",
        background:
          "radial-gradient(circle at 30% 24%, #4fa9ff 0%, #0a84ff 42%, #005fd8 100%)",
        borderColor: "rgba(125, 220, 255, 0.32)",
        boxShadow:
          "0 0 0 1px rgba(125,220,255,0.18), 0 18px 60px rgba(0,90,210,0.45), 0 28px 80px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.18)",
        transition: "box-shadow var(--t-med) var(--easing)",
      }}
      aria-label={expanded ? "Collapse timeline" : "Expand timeline"}
      title={expanded ? "Collapse timeline" : "Expand timeline"}
    >
      <motion.svg
        width="28"
        height="28"
        viewBox="0 0 28 28"
        fill="none"
        animate={{ rotate: expanded ? 180 : 0 }}
        transition={{ duration: reduced ? 0.001 : 0.5, ease: [0.16, 1, 0.3, 1] }}
        aria-hidden="true"
      >
        <path
          d="M10 11l4 4 4-4"
          stroke="white"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </motion.svg>
    </motion.button>
  );
}
