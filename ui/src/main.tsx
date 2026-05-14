import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App";

// react-scan: render-diagnostic overlay in dev only (Vite removes the import
// entirely from prod via the dead `if (false)` branch).
if (import.meta.env.DEV) {
  import("react-scan").then(({ scan }) => {
    try {
      scan({ enabled: true, log: false });
    } catch {
      /* ignore — diagnostic only */
    }
  });
}

// StrictMode removed: its double-invoke pattern (mount → unmount → remount)
// closes WebSocket connections before they establish, crashing the Vite WS proxy.
// WebSocket lifecycle is inherently side-effectful and cannot survive instant
// create-close-recreate cycles. StrictMode is a dev debugging tool, not a
// production requirement.
createRoot(document.getElementById("root")!).render(<App />);
