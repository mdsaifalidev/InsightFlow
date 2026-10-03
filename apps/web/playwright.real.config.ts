import { defineConfig, devices } from "@playwright/test"

// The same app, wired to the real auth and data services (ADR-013) instead of
// MSW. Services run in Docker (`pnpm e2e:real` boots them); the app runs here
// and proxies /api/auth and /api/data through Next rewrites — the same path
// production uses on Vercel.
const PORT = 3101
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? "http://localhost:4000"
const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL ?? "http://localhost:8000"

export default defineConfig({
  testDir: "./e2e",
  testMatch: /real-stack\.spec\.ts/,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  // Real ingest runs the whole pipeline, so steps wait longer than on mocks.
  timeout: 180_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Assert final states, not frames mid-animation. e2e/motion.spec.ts
    // deliberately opts back in so the animated path stays covered.
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec next build && pnpm exec next start --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      NEXT_DIST_DIR: ".next-real",
      NEXT_PUBLIC_API_MOCKING: "disabled",
      NEXT_PUBLIC_AUTH_MODE: "service",
      NEXT_PUBLIC_DATA_MODE: "service",
      AUTH_SERVICE_URL,
      DATA_SERVICE_URL,
    },
  },
})
