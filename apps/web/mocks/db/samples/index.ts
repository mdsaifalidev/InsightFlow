import type { SampleKey } from "@/lib/api/types"

import type { ParsedTable } from "../types"
import { generateOrders } from "./orders"
import { generateSaas } from "./saas"
import { generateWeblogs } from "./weblogs"

export type SampleDefinition = {
  key: SampleKey
  name: string
  filename: string
  description: string
  /** Approximate CSV size, shown in the library like a real upload. */
  sizeBytes: number
  generate: () => ParsedTable
}

export const samples: Record<SampleKey, SampleDefinition> = {
  orders: {
    key: "orders",
    name: "E-commerce orders",
    filename: "orders_2025.csv",
    description:
      "A year of orders across regions, categories and sales channels.",
    sizeBytes: 1_180_000,
    generate: generateOrders,
  },
  saas: {
    key: "saas",
    name: "SaaS subscriptions",
    filename: "subscriptions_monthly.csv",
    description:
      "Two years of monthly account snapshots with plans, seats, MRR and churn.",
    sizeBytes: 640_000,
    generate: generateSaas,
  },
  weblogs: {
    key: "weblogs",
    name: "Web traffic logs",
    filename: "access_logs_sep.csv",
    description:
      "30 days of requests with paths, status codes and response times.",
    sizeBytes: 1_560_000,
    generate: generateWeblogs,
  },
}

export const sampleList = Object.values(samples)
