import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/citycut/",
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        // MapLibre is about 1 MB and changes only on a dependency bump; its own chunk stays
        // cached across deploys instead of riding inside index-*.js.
        manualChunks: (id) => (id.includes("/node_modules/maplibre-gl/") ? "maplibre" : undefined),
      },
    },
  },
  optimizeDeps: {
    exclude: ["rhino3dm", "@jsquash/webp"],
  },
  test: {
    environment: "node",
    css: true,
  },
});
