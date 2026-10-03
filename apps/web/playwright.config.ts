import { defineConfig, devices } from "@playwright/test"

const PORT = 3100

// Smoke tests run against the app with the MSW mock backend (Phase 2). Once
// the real services exist, point baseURL at the gateway instead.
export default defineConfig({
  testDir: "./e2e",
  // The real-stack suite has its own config (playwright.real.config.ts), and
  // the screenshot script has playwright.shots.config.ts + its own directory.
  testMatch: /(analyst-flow|landing|motion)\.spec\.ts/,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Assert final states, not frames mid-animation. e2e/motion.spec.ts
    // deliberately opts back in so the animated path stays covered.
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // A production build: dev mode compiles routes on first visit, which makes
  // navigation timing flaky. Mocking is inlined at build time.
  webServer: {
    command: `pnpm exec next build && pnpm exec next start --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    // Backend-free smoke test: auth is mocked too.
    env: {
      NEXT_PUBLIC_API_MOCKING: "enabled",
      NEXT_PUBLIC_AUTH_MODE: "mock",
      NEXT_PUBLIC_DATA_MODE: "mock",
    },
  },
})
