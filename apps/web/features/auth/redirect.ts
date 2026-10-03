const DEFAULT_PATH = "/app/datasets"

/** Only allow same-site app paths as post-login redirects (no open redirects). */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/app") || next.startsWith("//")) {
    return DEFAULT_PATH
  }
  return next
}
