import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// En desarrollo, Vite (puerto 5173) reenvía /api al servidor de Python.
// Cambia el destino con MINICHAIN_API (por defecto http://127.0.0.1:8000).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const target = env.MINICHAIN_API || "http://127.0.0.1:8000";
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: { "/api": { target, changeOrigin: true, ws: true } },
    },
    build: { outDir: "dist", chunkSizeWarningLimit: 800 },
  };
});
