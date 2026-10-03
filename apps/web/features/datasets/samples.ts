import type { SampleKey } from "@/lib/api/types"

/**
 * The bundled demo datasets. Plain data, not in the client component that
 * renders the menu, so server components (the landing page) can read it too.
 */
export const SAMPLES: { key: SampleKey; name: string; description: string }[] =
  [
    {
      key: "orders",
      name: "E-commerce orders",
      description:
        "A year of orders across regions, categories and sales channels.",
    },
    {
      key: "saas",
      name: "SaaS subscriptions",
      description:
        "Two years of monthly accounts with plans, seats, MRR and churn.",
    },
    {
      key: "weblogs",
      name: "Web traffic logs",
      description:
        "30 days of requests with paths, status codes and response times.",
    },
  ]
