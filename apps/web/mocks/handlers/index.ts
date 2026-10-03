import { http, HttpResponse } from "msw"

// Registers the pipeline hooks that build dashboards and briefs during ingest.
import "../db/analytics"

import { authMode, dataMode } from "@/lib/backend-mode"

import { authHandlers } from "./auth"
import { dashboardHandlers } from "./dashboard"
import { datasetHandlers } from "./datasets"
import { insightHandlers } from "./insights"
import { jobHandlers } from "./jobs"
import { mockHandlers } from "./mock"
import { widgetHandlers } from "./widgets"

// Handlers mirror the API contract in docs/PRD.md §9, one module per resource.
// Paths start with "*/" so they match any origin: the page's own (browser),
// NEXT_PUBLIC_API_BASE_URL, and Node tests (which have no location to
// resolve relative paths against).
// Areas in "service" mode are left out, so MSW lets their requests through to
// the real services (ADR-013).
export { authMode, dataMode } from "@/lib/backend-mode"

const dataHandlers = [
  ...datasetHandlers,
  ...dashboardHandlers,
  ...widgetHandlers,
  ...insightHandlers,
  ...jobHandlers,
  ...mockHandlers,
  http.get("*/api/data/health", () =>
    HttpResponse.json({ status: "ok", source: "msw" })
  ),
]

export const handlers = [
  ...(authMode === "mock" ? authHandlers : []),
  ...(dataMode === "mock" ? dataHandlers : []),
]
