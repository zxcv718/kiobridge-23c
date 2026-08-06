import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@kiobridge/contracts": r("../../packages/contracts/src/index.ts"),
      "@kiobridge/state-engine": r("../../packages/state-engine/src/index.ts"),
      "@kiobridge/safety-engine": r("../../packages/safety-engine/src/index.ts"),
      "@kiobridge/evaluator": r("../../packages/evaluator/src/index.ts"),
    },
  },
  server: {
    // Bind IPv4 explicitly: Vite's default resolves to ::1 only on macOS, which
    // makes http://127.0.0.1:3000 unreachable for tooling (Playwright, curl -4).
    host: "127.0.0.1",
    port: 3000,
    strictPort: true,
    fs: { allow: [r("../..")] },
    proxy: {
      "/api": { target: "http://localhost:4000", changeOrigin: true },
    },
  },
});
