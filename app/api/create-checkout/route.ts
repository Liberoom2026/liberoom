import { NextResponse } from "next/server"

export const runtime = "nodejs"

const BACKEND_URL =
  "https://checkout-backend-git-main-gustavos-projects-7b34e52c.vercel.app/api/create-checkout-session"

const ALLOWED_ORIGINS = new Set([
  "https://liberoom.com.br",
  "https://www.liberoom.com.br",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
])

function applyCors(headers: Headers, origin: string | null) {
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin)
  }
  headers.set("Vary", "Origin")
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS")
  headers.set("Access-Control-Allow-Headers", "Content-Type")
}

export async function OPTIONS(req: Request) {
  const headers = new Headers()
  applyCors(headers, req.headers.get("origin"))
  return new NextResponse(null, { status: 204, headers })
}

export async function POST(req: Request) {
  try {
    const origin = req.headers.get("origin")
    const body = await req.json()

    const backendResponse = await fetch(BACKEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })

    const data = await backendResponse.json().catch(() => ({}))

    const headers = new Headers({ "Content-Type": "application/json" })
    applyCors(headers, origin)

    return NextResponse.json(data, {
      status: backendResponse.status,
      headers,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Erro ao criar checkout" },
      { status: 500 }
    )
  }
}