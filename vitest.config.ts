import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@kiobridge/contracts": r("./packages/contracts/src/index.ts"),
      "@kiobridge/state-engine": r("./packages/state-engine/src/index.ts"),
      "@kiobridge/safety-engine": r("./packages/safety-engine/src/index.ts"),
      "@kiobridge/evaluator": r("./packages/evaluator/src/index.ts"),
      "@kiobridge/participant-sdk": r("./packages/participant-sdk/src/index.ts"),
      "@kiobridge/profile-contract": r("./packages/profile-contract/src/index.ts"),
      "@kiobridge/kiosk-driver-contract": r("./packages/kiosk-driver-contract/src/index.ts"),
      "@kiobridge/simulation-driver": r("./packages/simulation-driver/src/index.ts"),
      "@kiobridge/uprlite-driver-contract": r("./packages/uprlite-driver-contract/src/index.ts"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts", "packages/**/*.test.ts"],
    exclude: ["node_modules", "**/dist/**", "tests/e2e/**"],
    reporters: ["default"],
  },
});
