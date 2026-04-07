import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const id = body.id ? String(body.id) : null
    const property_id = body.property_id ? Number(body.property_id) : null
    const date = body.date ?? null
    const period = body.period ?? null
    const start_time = body.start_time ?? null
    const end_time = body.end_time ?? null

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

    let query = supabase.from("blocked_slots").delete()

    if (id) {
      query = query.eq("id", id)
    } else {
      if (!property_id || !date) {
        return NextResponse.json({ error: "Missing fields" }, { status: 400 })
      }

      query = query.eq("property_id", property_id).eq("date", date)

      if (period) {
        query = query.eq("period", period)
      }

      if (start_time && end_time) {
        query = query.eq("start_time", start_time).eq("end_time", end_time)
      }
    }

    const { data, error } = await query.select()

    if (error) {
      console.error("ERRO AO REMOVER BLOCK:", error)
      return NextResponse.json(
        {
          error: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    console.error("ERRO GERAL:", err)
    return NextResponse.json(
      { error: err?.message || "Internal error" },
      { status: 500 }
    )
  }
}