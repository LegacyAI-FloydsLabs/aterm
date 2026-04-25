import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 9601,
    proxy: {
      "/api": "http://localhost:9600",
      "/ws/events": {
        target: "http://localhost:9600",
        ws: true,
        changeOrigin: true,
      },
      "/ws/": {
        target: "http://localhost:9600",
        ws: true,
        changeOrigin: true,
      },
      "/health": "http://localhost:9600",
    },
  },
  build: {
    outDir: "../dist/ui",
    emptyOutDir: true,
  },
});
