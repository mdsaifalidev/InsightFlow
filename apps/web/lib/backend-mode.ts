// Which backend serves each API area (ADR-013). "service" sends requests to the
// real service; "mock" keeps them on MSW. Both default to mock, so tests and
// the Playwright smoke run without a backend.
export const authMode =
  process.env.NEXT_PUBLIC_AUTH_MODE === "service" ? "service" : "mock"
export const dataMode =
  process.env.NEXT_PUBLIC_DATA_MODE === "service" ? "service" : "mock"

/** MSW only starts when mocking is on and some area still uses it. */
export const mswEnabled =
  process.env.NEXT_PUBLIC_API_MOCKING === "enabled" &&
  (authMode === "mock" || dataMode === "mock")
