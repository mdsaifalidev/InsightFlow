import { defineConfig } from "tsup"

export default defineConfig({
  entry: { server: "src/server.ts", migrate: "scripts/migrate.ts" },
  format: "esm",
  target: "node24",
  platform: "node",
  outDir: "dist",
  clean: true,
  sourcemap: true,
})
