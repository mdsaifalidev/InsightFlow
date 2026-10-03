import { defineConfig, devices } from "@playwright/test"

// Product screenshots for the landing page. Not a test suite: it writes the
// images in public/screenshots. Run it with `pnpm --filter web shots` after
// any visual change to the dashboard, Brief, table or chart builder.
//
// Its own directory (not ./e2e) so the two test configs can never pick it up,
// and its own build dir so it can't collide with theirs.
const PORT = 3102

export default defineConfig({
  testDir: "./shots",
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  timeout: 180_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    // Belt and braces with next-themes' disableTransitionOnChange.
    reducedMotion: "reduce",
  },
  // next-themes defaults to "system", so the OS preference decides the theme
  // with no interaction to race.
  projects: [
    { name: "light", use: { colorScheme: "light" } },
    { name: "dark", use: { colorScheme: "dark" } },
  ],
  webServer: {
    command: `pnpm exec next build && pnpm exec next start --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      NEXT_DIST_DIR: ".next-shots",
      NEXT_PUBLIC_API_MOCKING: "enabled",
      NEXT_PUBLIC_AUTH_MODE: "mock",
      NEXT_PUBLIC_DATA_MODE: "mock",
    },
  },
})
