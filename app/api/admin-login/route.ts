import { NextResponse } from "next/server"

export async function POST(req: Request) {
  const { password } = await req.json()

  console.log("Senha digitada:", password)
  console.log("Senha do env:", process.env.ADMIN_PASSWORD)

  if (password !== "bIo%QE7#Cg") {
    return NextResponse.json(
      { error: "Senha incorreta" },
      { status: 401 }
    )
  }

  const response = NextResponse.json({ success: true })

  response.cookies.set("admin_auth", "true", {
    httpOnly: true,
    path: "/",
    maxAge: 60 * 60 * 24,
  })

  return response
}