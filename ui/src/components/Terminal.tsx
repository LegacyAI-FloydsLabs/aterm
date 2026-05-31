/**
 * Terminal component — xterm.js v6 + WebSocket with auto-reconnect.
 *
 * Absolute Void theme: true black background, JetBrains Mono, cyan cursor.
 * Auto-reconnect with exponential backoff survives server restart.
 */
import { useEffect, useRef, useCallback } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { wsUrl } from "../hooks/useApi";

interface TerminalStateMsg {
  state: string;
  confidence: number;
  method: string;
  detail: string;
  [key: string]: unknown;
}

interface Props {
  sessionId: string;
  onStateChange?: (state: TerminalStateMsg) => void;
}

const ATERM_THEME = {
  background: "#000000",
  foreground: "rgba(245, 248, 252, 0.92)",
  cursor: "#7ddcff",
  cursorAccent: "#000000",
  selectionBackground: "rgba(125, 220, 255, 0.22)",
  selectionForeground: "#ffffff",
  black: "#0a0a0a",
  red: "#ff6961",
  green: "#5ee2a0",
  yellow: "#f5d76e",
  blue: "#7ddcff",
  magenta: "#c08bff",
  cyan: "#7ddcff",
  white: "rgba(245, 248, 252, 0.92)",
  brightBlack: "rgba(170, 180, 190, 0.58)",
  brightRed: "#ff8a82",
  brightGreen: "#7df0b8",
  brightYellow: "#ffe390",
  brightBlue: "#a3e7ff",
  brightMagenta: "#dcb0ff",
  brightCyan: "#bff0ff",
  brightWhite: "#ffffff",
};

export function Terminal({ sessionId, onStateChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const disposedRef = useRef(false);
  const termRef = useRef<XTerm | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const attemptsRef = useRef(0);
  // ref breaks the use-before-declared cycle in the self-reconnect timer
  const connectRef = useRef<(t: XTerm) => void>(() => {});

  const connectWs = useCallback(
    (term: XTerm) => {
      if (disposedRef.current) return;

      const url = wsUrl(sessionId);
      if (!url) {
        term.write("\r\n\x1b[38;5;203m[missing ATerm auth token — open the server's tokenized URL]\x1b[0m\r\n");
        return;
      }

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        attemptsRef.current = 0;
      };

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
          /* ignore malformed */
        }
      };

      ws.onclose = () => {
        if (disposedRef.current) return;
        wsRef.current = null;
        const delay = Math.min(1000 * Math.pow(2, attemptsRef.current), 30000);
        attemptsRef.current++;
        term.write(`\r\n\x1b[38;5;81m[reconnecting in ${Math.round(delay / 1000)}s…]\x1b[0m`);
        reconnectTimer.current = setTimeout(() => {
          if (!disposedRef.current) {
            term.write(`\r\n\x1b[38;5;81m[reconnecting…]\x1b[0m\r\n`);
            connectRef.current(term);
          }
        }, delay);
      };

      ws.onerror = () => {
        ws.close();
      };

      term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "input", payload: data }));
        }
      });
    },
    [sessionId, onStateChange]
  );

  // keep ref pointed at the latest closure so the reconnect timer reaches it
  useEffect(() => {
    connectRef.current = connectWs;
  }, [connectWs]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    disposedRef.current = false;
    attemptsRef.current = 0;

    const term = new XTerm({
      cursorBlink: true,
      cursorStyle: "block",
      fontSize: 13,
      lineHeight: 1.25,
      letterSpacing: 0.2,
      fontFamily:
        "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontWeight: "400",
      fontWeightBold: "600",
      theme: ATERM_THEME,
      allowProposedApi: true,
      scrollback: 10000,
      drawBoldTextInBrightColors: true,
      smoothScrollDuration: 120,
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(searchAddon);
    term.loadAddon(webLinksAddon);
    term.open(el);

    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => webglAddon.dispose());
      term.loadAddon(webglAddon);
    } catch {
      /* WebGL not available */
    }

    fitAddon.fit();
    termRef.current = term;

    const observer = new ResizeObserver(() => {
      if (disposedRef.current) return;
      try {
        fitAddon.fit();
      } catch {
        /* ignore transient fit error during layout flip */
      }
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      }
    });
    observer.observe(el);

    connectWs(term);

    return () => {
      disposedRef.current = true;
      clearTimeout(reconnectTimer.current);
      observer.disconnect();
      wsRef.current?.close();
      term.dispose();
      termRef.current = null;
    };
  }, [sessionId, connectWs]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ background: "#000000" }}
      role="region"
      aria-label="Terminal output"
    />
  );
}
