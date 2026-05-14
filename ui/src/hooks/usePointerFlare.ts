import { useCallback, useRef } from "react";

interface FlareHandlers<T extends HTMLElement> {
  onPointerMove: (e: React.PointerEvent<T>) => void;
  onPointerEnter: (e: React.PointerEvent<T>) => void;
  onPointerLeave: (e: React.PointerEvent<T>) => void;
  ref: React.RefObject<T | null>;
}

/**
 * Cursor-tracked flare. Writes --mx, --my, --flare-opacity onto the element
 * so radial-gradient overlays can light glass edges where the pointer is.
 * Uses rAF coalescing so high-frequency pointermove events stay free.
 */
export function usePointerFlare<T extends HTMLElement = HTMLDivElement>(
  intensity = 1
): FlareHandlers<T> {
  const ref = useRef<T | null>(null);
  const frame = useRef<number | null>(null);
  const next = useRef<{ x: number; y: number } | null>(null);

  const flush = useCallback(() => {
    frame.current = null;
    const node = ref.current;
    const point = next.current;
    if (!node || !point) return;
    node.style.setProperty("--mx", `${point.x}px`);
    node.style.setProperty("--my", `${point.y}px`);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<T>) => {
      const node = e.currentTarget;
      const rect = node.getBoundingClientRect();
      next.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      if (frame.current == null) {
        frame.current = requestAnimationFrame(flush);
      }
    },
    [flush]
  );

  const onPointerEnter = useCallback(
    (e: React.PointerEvent<T>) => {
      ref.current = e.currentTarget;
      e.currentTarget.style.setProperty("--flare-opacity", String(intensity));
    },
    [intensity]
  );

  const onPointerLeave = useCallback(
    (e: React.PointerEvent<T>) => {
      e.currentTarget.style.setProperty("--flare-opacity", "0");
      if (frame.current != null) {
        cancelAnimationFrame(frame.current);
        frame.current = null;
      }
      next.current = null;
    },
    []
  );

  return { onPointerMove, onPointerEnter, onPointerLeave, ref };
}
