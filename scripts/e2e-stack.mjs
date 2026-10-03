// Boots the backend services for the real-stack E2E suite and runs it.
// Web is NOT started here: Playwright builds and serves it (the app proxies
// /api/auth and /api/data to the published ports through Next rewrites).
//
//   node scripts/e2e-stack.mjs up     # services only, leave them running
//   node scripts/e2e-stack.mjs run    # up, run the suite, then down
//   node scripts/e2e-stack.mjs down
//
// CI passes --ci to use docker-compose.ci.yml, which runs the production
// images instead of the dev ones.

import { spawnSync } from "node:child_process"

const args = process.argv.slice(2)
const command = args.find((arg) => !arg.startsWith("-")) ?? "run"
const ci = args.includes("--ci")

const SERVICES = ["postgres", "redis", "rustfs", "rustfs-init", "auth-node", "data-py", "data-worker"]
// A separate project keeps the CI stack's containers and volumes away from the
// dev stack, so tearing it down never touches local data.
const composeFiles = ci
  ? ["-p", "insightflow-ci", "-f", "docker-compose.yml", "-f", "docker-compose.ci.yml"]
  : ["-f", "docker-compose.yml"]

function run(bin, argv, options = {}) {
  console.log(`> ${bin} ${argv.join(" ")}`)
  // pnpm is a .cmd on Windows, which needs a shell; docker.exe does not.
  const shell = process.platform === "win32" && bin === "pnpm"
  const result = spawnSync(bin, argv, { stdio: "inherit", shell, ...options })
  return result.status ?? 1
}

const compose = (...argv) => run("docker", ["compose", ...composeFiles, ...argv])

function up() {
  // --wait blocks until every healthcheck passes, so the suite never races the stack.
  // --force-recreate in CI: never reuse a container left behind by a failed run.
  const status = compose(
    "up",
    "-d",
    "--wait",
    ...(ci ? ["--build", "--force-recreate"] : []),
    ...SERVICES
  )
  if (status !== 0) {
    compose("logs", "--tail=80")
    process.exit(status)
  }
}

function down() {
  // docker-compose.ci.yml demands JWT keys, and interpolation runs even for
  // `down`: a placeholder keeps teardown working when the run already failed.
  if (ci) {
    process.env.JWT_PRIVATE_KEY ??= "teardown"
    process.env.JWT_PUBLIC_KEY ??= "teardown"
  }
  // Only the throwaway CI project gets its volumes removed.
  compose("down", ...(ci ? ["-v"] : []))
}

if (command === "up") {
  up()
} else if (command === "down") {
  down()
} else {
  up()
  const status = run("pnpm", ["--filter", "web", "test:e2e:real"])
  if (status !== 0) compose("logs", "--tail=120")
  if (!args.includes("--keep")) down()
  process.exit(status)
}
