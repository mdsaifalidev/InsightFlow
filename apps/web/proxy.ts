import { NextResponse, type NextRequest } from "next/server"

// Server-side route protection (PRD F1). The auth service sets an httpOnly
// `if_session` cookie alongside the path-scoped refresh cookie; without it,
// /app/* redirects to sign-in before rendering. AuthGate still restores the
// in-memory access token on the client. In mock mode (MSW can't set httpOnly
// cookies) protection stays client-side.
const SESSION_COOKIE = "if_session"

export function proxy(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_AUTH_MODE !== "service")
    return NextResponse.next()
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next()

  const login = new URL("/login", request.url)
  login.searchParams.set(
    "next",
    `${request.nextUrl.pathname}${request.nextUrl.search}`
  )
  return NextResponse.redirect(login)
}

export const config = {
  matcher: "/app/:path*",
}
