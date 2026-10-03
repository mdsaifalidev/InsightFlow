import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    globalSetup: ["./test/global-setup.ts"],
    include: ["test/**/*.test.ts"],
    // First run pulls postgres:17-alpine.
    hookTimeout: 240_000,
    testTimeout: 30_000,
    // Test files share one database; run them one at a time.
    fileParallelism: false,
  },
})
