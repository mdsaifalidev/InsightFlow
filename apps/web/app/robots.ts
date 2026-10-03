import type { MetadataRoute } from "next"

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"

// The app itself is behind a session and has nothing to index; it still
// serves HTML to a crawler, so say so explicitly.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app/", "/login", "/register"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
