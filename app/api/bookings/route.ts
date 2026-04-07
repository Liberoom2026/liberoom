import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

type Item = {
  period?: string | null
  start_time?: string | null
  end_time?: string | null
}

function parseTimeToMinutes(time: string) {
  const [h, m] = time.split(":").map(Number)
  return h * 60 + m
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd
}

function periodToInterval(period: string) {
  if (period === "morning") return { start: 8 * 60, end: 12 * 60 }
  if (period === "afternoon") return { start: 12 * 60, end: 18 * 60 }
  if (period === "evening") return { start: 18 * 60, end: 22 * 60 }
  if (period === "day" || period === "exclusive") return { start: 0, end: 24 * 60 }
  return null
}

function itemToInterval(item: Item) {
  if (item.period) {
    return periodToInterval(item.period)
  }

  if (item.start_time && item.end_time) {
    return {
      start: parseTimeToMinutes(item.start_time),
      end: parseTimeToMinutes(item.end_time),
    }
  }

  return null
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const property_id = Number(body.property_id)
    const guest_name = body.guest_name
    const guest_email = body.guest_email
    const date = body.date
    const period = body.period ?? null
    const start_time = body.start_time ?? null
    const end_time = body.end_time ?? null

    if (!property_id || !guest_name || !guest_email || !date) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 })
    }

    const isTimeBooking = !!start_time && !!end_time
    const candidateInterval = isTimeBooking
      ? {
          start: parseTimeToMinutes(start_time!),
          end: parseTimeToMinutes(end_time!),
        }
      : period
        ? periodToInterval(period)
        : null

    if (!candidateInterval) {
      return NextResponse.json({ error: "Invalid booking interval" }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: "Missing env vars" }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    const [{ data: existingBookings }, { data: existingBlocks }] = await Promise.all([
      supabase
        .from("bookings")
        .select("*")
        .eq("property_id", property_id)
        .eq("date", date),
      supabase
        .from("blocked_slots")
        .select("*")
        .eq("property_id", property_id)
        .eq("date", date),
    ])

    const conflictsWith = (item: any) => {
      const itemInterval = itemToInterval(item)
      if (!itemInterval) return false

      return overlaps(
        candidateInterval.start,
        candidateInterval.end,
        itemInterval.start,
        itemInterval.end
      )
    }

    const conflict =
      (existingBookings || []).some(conflictsWith) ||
      (existingBlocks || []).some(conflictsWith)

    if (conflict) {
      return NextResponse.json(
        { error: "Conflicts with existing booking or block" },
        { status: 400 }
      )
    }

    const { data, error } = await supabase.from("bookings").insert([
      {
        property_id,
        guest_name,
        guest_email,
        date,
        period,
        start_time: isTimeBooking ? start_time : null,
        end_time: isTimeBooking ? end_time : null,
        stripe_payment_intent: body.stripe_payment_intent || null,
      },
    ]).select()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    console.error("BOOKINGS ERROR:", err)
    return NextResponse.json(
      { error: err?.message || "Internal error" },
      { status: 500 }
    )
  }
}