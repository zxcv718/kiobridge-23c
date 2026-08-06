/**
 * 팀 23C 데모 UI — 키트 루트의 vite/react를 재사용한다 (별도 설치 불필요).
 * 실행: npx vite --config workspace/23C/ui/vite.config.ts
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: r("."),
  plugins: [react()],
  resolve: {
    alias: {
      "@kiobridge/participant-sdk": r("../../../packages/participant-sdk/src/index.ts"),
      "@kiobridge/profile-contract": r("../../../packages/profile-contract/src/index.ts"),
      "@kiobridge/contracts": r("../../../packages/contracts/src/index.ts"),
      "@kiobridge/evaluator": r("../../../packages/evaluator/src/index.ts"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    fs: { allow: [r("../../..")] }, // 코어(../src/core)와 패키지 소스 접근 허용
    proxy: { "/api": "http://localhost:4000" },
  },
  build: { outDir: r("./dist") },
});
