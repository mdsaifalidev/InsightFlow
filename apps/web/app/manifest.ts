import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "InsightFlow — AI Business Analytics & Dashboards",
    short_name: "InsightFlow",
    description:
      "Turn spreadsheets into interactive dashboards and grounded AI executive summaries.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0c10",
    theme_color: "#2741a6",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  }
}
