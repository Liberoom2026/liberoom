import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)

    const property_id = Number(searchParams.get("property_id"))
    const start = searchParams.get("start")
    const end = searchParams.get("end")

    if (!property_id || !start || !end) {
      return NextResponse.json({ error: "Missing params" }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        {
          error:
            "Missing Supabase env vars. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local",
        },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data, error } = await supabase
      .from("blocked_slots")
      .select("*")
      .eq("property_id", property_id)
      .gte("date", start)
      .lte("date", end)
      .order("date", { ascending: true })
      .order("start_time", { ascending: true, nullsFirst: false })

    if (error) {
      console.error("BLOCK LIST ERROR:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data || [])
  } catch (err: any) {
    console.error("ERRO GERAL:", err)
    return NextResponse.json(
      { error: err?.message || "Internal error" },
      { status: 500 }
    )
  }
}