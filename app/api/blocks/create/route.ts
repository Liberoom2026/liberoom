import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

type BlockItem = {
  date: string
  period?: string | null
  start_time?: string | null
  end_time?: string | null
}

function parseTimeToMinutes(time: string) {
  const [h, m] = time.split(":").map(Number)
  return h * 60 + m
}

function overlaps(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
) {
  return aStart < bEnd && bStart < aEnd
}

function periodToInterval(period: string) {
  if (period === "morning") return { start: 8 * 60, end: 12 * 60 }
  if (period === "afternoon") return { start: 12 * 60, end: 18 * 60 }
  if (period === "evening") return { start: 18 * 60, end: 22 * 60 }
  if (period === "day" || period === "exclusive") return { start: 0, end: 24 * 60 }
  return null
}

function itemToInterval(item: BlockItem) {
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
    const date = body.date
    const period = body.period ?? null
    const start_time = body.start_time ?? null
    const end_time = body.end_time ?? null

    if (!property_id || !date) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 })
    }

    const isTimeBlock = !!start_time && !!end_time
    const isPeriodBlock = !!period

    if (!isTimeBlock && !isPeriodBlock) {
      return NextResponse.json(
        { error: "Provide either period or start_time/end_time" },
        { status: 400 }
      )
    }

    if (isTimeBlock) {
      const startMin = parseTimeToMinutes(start_time!)
      const endMin = parseTimeToMinutes(end_time!)

      if (endMin <= startMin) {
        return NextResponse.json(
          { error: "end_time must be greater than start_time" },
          { status: 400 }
        )
      }
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

    const [{ data: existingBlocks, error: blocksError }, { data: existingBookings, error: bookingsError }] =
      await Promise.all([
        supabase
          .from("blocked_slots")
          .select("*")
          .eq("property_id", property_id)
          .eq("date", date),
        supabase
          .from("bookings")
          .select("*")
          .eq("property_id", property_id)
          .eq("date", date),
      ])

    if (blocksError) {
      return NextResponse.json({ error: blocksError.message }, { status: 500 })
    }

    if (bookingsError) {
      return NextResponse.json({ error: bookingsError.message }, { status: 500 })
    }

    const candidateInterval = isTimeBlock
      ? {
          start: parseTimeToMinutes(start_time!),
          end: parseTimeToMinutes(end_time!),
        }
      : periodToInterval(period!)

    if (!candidateInterval) {
      return NextResponse.json({ error: "Invalid block interval" }, { status: 400 })
    }

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

    const blockConflict = (existingBlocks || []).some(conflictsWith)
    const bookingConflict = (existingBookings || []).some(conflictsWith)

    if (blockConflict || bookingConflict) {
      return NextResponse.json(
        { error: "Conflicts with existing booking or block" },
        { status: 400 }
      )
    }

    const payload: any = {
      property_id,
      date,
      period: isPeriodBlock ? period : null,
      start_time: isTimeBlock ? start_time : null,
      end_time: isTimeBlock ? end_time : null,
    }

    const { data, error } = await supabase
      .from("blocked_slots")
      .insert([payload])
      .select()

    if (error) {
      console.error("ERRO AO INSERIR BLOCK:", error)
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