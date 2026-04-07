import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import { isAdminAuthenticated } from "@/lib/auth"

export async function GET() {

  const isAuthenticated = await isAdminAuthenticated()

  if (!isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data, error } = await supabase
    .from("bookings")
    .select(`
      *,
      properties (
        id,
        title,
        owner_email,
        price_per_hour
      )
    `)
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}