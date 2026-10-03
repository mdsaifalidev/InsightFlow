import { fileURLToPath } from "node:url"

import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@workspace/ui": fileURLToPath(
        new URL("../../packages/ui/src", import.meta.url)
      ),
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next", "e2e"],
    env: {
      // Node's fetch needs absolute URLs; MSW handlers match this origin.
      NEXT_PUBLIC_API_BASE_URL: "http://localhost:3000",
    },
  },
})
