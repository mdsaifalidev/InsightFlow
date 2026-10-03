import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  transpilePackages: ["@workspace/ui"],
  // NEXT_PUBLIC_* are inlined at build time, so the mock and real-stack E2E
  // builds must not share an output directory.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // Keep the dev indicator clear of the sidebar's user menu (bottom-left).
  devIndicators: { position: "bottom-right" },
  experimental: {
    // With proxy.ts present, Next buffers request bodies (10MB by default),
    // even on rewritten routes. Uploads reach the data service this way only
    // in native `pnpm dev`; the gateway streams them directly. Keep it just
    // above the service's 100MB upload limit.
    proxyClientMaxBodySize: "110mb",
  },
  // Without the nginx gateway (native `pnpm dev`), send /api/auth and
  // /api/data to the services from the same origin, so cookies just work.
  async rewrites() {
    const services = [
      ["/api/auth", process.env.AUTH_SERVICE_URL],
      ["/api/data", process.env.DATA_SERVICE_URL],
    ]
    return services.flatMap(([prefix, url]) =>
      url
        ? [
            {
              source: `${prefix}/:path*`,
              destination: `${url}${prefix}/:path*`,
            },
          ]
        : []
    )
  },
}

export default nextConfig
