/** 팀 23C 접근성 실측 전용 설정 — 키트 루트의 playwright.config.ts 는 건드리지 않는다. */
import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

export default defineConfig({
  testDir: fileURLToPath(new URL(".", import.meta.url)),
  testMatch: /.*\.spec\.ts/,
  reporter: [["list"]],
  timeout: 30_000,
  use: { baseURL: "http://localhost:5173", headless: true },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
