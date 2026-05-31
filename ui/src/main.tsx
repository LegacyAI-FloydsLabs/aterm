import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App";

// react-scan is an opt-in render diagnostic. Keep it out of ordinary dogfood
// and dev sessions unless VITE_ENABLE_REACT_SCAN=true is set explicitly.
if (import.meta.env.DEV && import.meta.env.VITE_ENABLE_REACT_SCAN === "true") {
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
