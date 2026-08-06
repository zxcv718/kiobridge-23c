import { defineConfig, devices } from "@playwright/test";

/**
 * E2E runs against the local dev stack (web:3000, simulation-api:4000).
 * Playwright boots it via `webServer` below; in CI it never reuses a stray
 * server, so a leftover process cannot mask a broken build.
 *
 * Everything is SIMULATION_ONLY — no real device is ever contacted.
 */
const CI = !!process.env.CI;
const WEB_URL = process.env.E2E_WEB_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: WEB_URL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: `${WEB_URL}/`,
    // Reusing a dev server locally keeps the loop fast; CI always starts clean.
    reuseExistingServer: !CI,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
