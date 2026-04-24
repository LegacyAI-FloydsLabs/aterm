/**
 * Terminal component — xterm.js v6 + WebSocket integration.
 *
 * Lifecycle:
 *   mount → create xterm → connect WS → receive scrollback → stream data
 *   unmount → close WS → dispose xterm → disconnect observer
 *
 * Guard: `disposed` ref prevents post-unmount writes to terminal.
 */
import { useEffect, useRef, useCallback } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { wsUrl } from "../hooks/useApi";

interface Props {
  sessionId: string;
  onStateChange?: (state: any) => void;
}

export function Terminal({ sessionId, onStateChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const disposedRef = useRef(false);

  const setupTerminal = useCallback(() => {
    const el = containerRef.current;
    if (!el || disposedRef.current) return;

    // Create xterm instance
    const term = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, monospace",
      theme: {
        background: "#1e1e1e",
        foreground: "#cccccc",
        cursor: "#6cb2f7",
        selectionBackground: "#264f78",
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(searchAddon);
    term.loadAddon(webLinksAddon);
    term.open(el);

    // Try WebGL renderer, fall back silently
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => webglAddon.dispose());
      term.loadAddon(webglAddon);
    } catch {
      // WebGL not available — canvas renderer is fine
    }

    fitAddon.fit();

    // Connect WebSocket
    const url = wsUrl(sessionId);
    const ws = new WebSocket(url);

    ws.onmessage = (e) => {
      if (disposedRef.current) return;
      try {
        const msg = JSON.parse(e.data);
        switch (msg.type) {
          case "scrollback":
          case "data":
            term.write(msg.payload);
            break;
          case "state":
            onStateChange?.(msg);
            break;
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      if (!disposedRef.current) {
        term.write("\r\n\x1b[33m[disconnected]\x1b[0m\r\n");
      }
    };

    // Terminal input → WebSocket
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input", payload: data }));
      }
    });

    // Resize → WebSocket + PTY
    const observer = new ResizeObserver(() => {
      if (disposedRef.current) return;
      fitAddon.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      }
    });
    observer.observe(el);

    // Cleanup
    return () => {
      disposedRef.current = true;
      observer.disconnect();
      ws.close();
      term.dispose();
    };
  }, [sessionId, onStateChange]);

  useEffect(() => {
    disposedRef.current = false;
    const cleanup = setupTerminal();
    return () => {
      cleanup?.();
    };
  }, [setupTerminal]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", background: "#1e1e1e" }}
    />
  );
}
