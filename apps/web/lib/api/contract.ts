/**
 * Holds the hand-written contract types against the services' OpenAPI specs
 * (PRD §7: "CI fails on drift"). Type-only: nothing here runs, but a renamed,
 * removed or retyped field fails `pnpm typecheck` naming the type that moved.
 *
 * Regenerate the specs with `pnpm --filter @workspace/api-types generate`.
 *
 * Comparison is deliberately loose about null vs optional: Pydantic and zod
 * describe "may be absent" differently from the client's `T | null`, and the
 * app treats both as falsy. Names and value types are compared strictly.
 */

import type { components as AuthSchemas } from "@workspace/api-types/auth"
import type { components as DataSchemas } from "@workspace/api-types/data"

import type { ProblemDetails } from "@/lib/api-client"

import type {
  Anomaly,
  AuthResponse,
  Dataset,
  DatasetColumn,
  DatasetDetail,
  DatasetList,
  DashboardResponse,
  Fact,
  FilterValuesResponse,
  Insight,
  JobDoneEvent,
  JobProgressEvent,
  Kpi,
  MeResponse,
  QueryResponse,
  RefreshResponse,
  RegenerateInsightResponse,
  RowsResponse,
  SeriesPoint,
  UploadResponse,
  User,
  Widget,
  WidgetResult,
  WidgetSpec,
  Workspace,
} from "./types"

type ProblemField =
  "type" | "title" | "status" | "detail" | "instance" | "errors"

type Auth = AuthSchemas["schemas"]
type Data = DataSchemas["schemas"]

/** Normalizes both sides: every property optional and nullable, so only field
 * names and value types matter — "absent" and "null" describe the same thing in
 * zod, Pydantic and the client. (`-?` would strip `undefined` from one side.) */
type Loose<T> = T extends (infer U)[]
  ? Loose<U>[]
  : T extends Date | ((...args: never[]) => unknown)
    ? T
    : T extends object
      ? { [K in keyof T]?: Loose<NonNullable<T[K]>> | null }
      : T

/** Structural match: same field names, and each side assignable to the other.
 * `Loose` is applied at the call site: inside a generic it would stay unresolved
 * and every comparison would trivially "fail". */
type KeysMatch<A, B> = [
  Exclude<keyof A, keyof B> | Exclude<keyof B, keyof A>,
] extends [never]
  ? true
  : {
      drift: "different fields"
      onlyInClient: Exclude<keyof A, keyof B>
      onlyInService: Exclude<keyof B, keyof A>
    }

type Mutual<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : { drift: "service shape is narrower"; client: A; service: B }
  : { drift: "client shape is narrower"; client: A; service: B }

type Same<A, B> = KeysMatch<A, B> extends true ? Mutual<A, B> : KeysMatch<A, B>

/** Compiles only when the check passes; the constraint is the assertion. */
type Assert<T extends true> = T

// ---------- Auth service ----------

export type AuthChecks = [
  Assert<Same<Loose<User>, Loose<Auth["User"]>>>,
  Assert<Same<Loose<Workspace>, Loose<Auth["Workspace"]>>>,
  Assert<Same<Loose<AuthResponse>, Loose<Auth["AuthResponse"]>>>,
  Assert<Same<Loose<MeResponse>, Loose<Auth["MeResponse"]>>>,
  Assert<Same<Loose<RefreshResponse>, Loose<Auth["RefreshResponse"]>>>,
  // RFC 7807 allows extension members, so the client type is open; compare the declared ones.
  Assert<
    Same<Loose<Pick<ProblemDetails, ProblemField>>, Loose<Auth["Problem"]>>
  >,
]

// ---------- Data service ----------

export type DataChecks = [
  Assert<Same<Loose<Dataset>, Loose<Data["Dataset"]>>>,
  Assert<Same<Loose<DatasetColumn>, Loose<Data["DatasetColumn"]>>>,
  Assert<Same<Loose<DatasetDetail>, Loose<Data["DatasetDetail"]>>>,
  Assert<Same<Loose<DatasetList>, Loose<Data["DatasetList"]>>>,
  Assert<Same<Loose<UploadResponse>, Loose<Data["UploadResponse"]>>>,
  Assert<Same<Loose<DashboardResponse>, Loose<Data["DashboardResponse"]>>>,
  Assert<Same<Loose<Kpi>, Loose<Data["Kpi"]>>>,
  Assert<Same<Loose<Widget>, Loose<Data["Widget"]>>>,
  Assert<Same<Loose<WidgetSpec>, Loose<Data["WidgetSpec"]>>>,
  // A point holds one key per series, so both sides are open maps: compare the
  // fixed fields, and the field names of the shapes that carry them.
  Assert<KeysMatch<WidgetResult, Data["WidgetResult"]>>,
  Assert<
    Same<
      Loose<Omit<WidgetResult, "points">>,
      Loose<Omit<Data["WidgetResult"], "points">>
    >
  >,
  Assert<
    Same<
      Loose<Pick<SeriesPoint, "x" | "x2">>,
      Loose<Pick<Data["SeriesPoint"], "x" | "x2">>
    >
  >,
  Assert<KeysMatch<QueryResponse, Data["QueryResponse"]>>,
  Assert<
    Same<
      Loose<Omit<QueryResponse, "results">>,
      Loose<Omit<Data["QueryResponse"], "results">>
    >
  >,
  Assert<Same<Loose<RowsResponse>, Loose<Data["RowsResponse"]>>>,
  Assert<
    Same<Loose<FilterValuesResponse>, Loose<Data["FilterValuesResponse"]>>
  >,
  Assert<Same<Loose<Fact>, Loose<Data["Fact"]>>>,
  Assert<Same<Loose<Anomaly>, Loose<Data["Anomaly"]>>>,
  Assert<Same<Loose<Insight>, Loose<Data["Insight"]>>>,
  Assert<
    Same<
      Loose<RegenerateInsightResponse>,
      Loose<Data["RegenerateInsightResponse"]>
    >
  >,
  // SSE payloads: the stream isn't described by OpenAPI, but its events are.
  Assert<Same<Loose<JobProgressEvent>, Loose<Data["JobProgressEvent"]>>>,
  Assert<Same<Loose<JobDoneEvent>, Loose<Data["JobDoneEvent"]>>>,
  Assert<
    Same<Loose<Pick<ProblemDetails, ProblemField>>, Loose<Data["Problem"]>>
  >,
]
