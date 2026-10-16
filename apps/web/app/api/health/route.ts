import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export function GET() {
  return NextResponse.json({ status: "ok" })
}

export function HEAD() {
  return new Response(null, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  })
}
