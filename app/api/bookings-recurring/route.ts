import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { randomUUID } from "crypto"

const supabase = createClient(
 process.env.NEXT_PUBLIC_SUPABASE_URL!,
 process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function generateDates(startDate: string, weekday: number, months: number) {

 const dates: string[] = []

 const start = new Date(startDate)
 const end = new Date(start)
 end.setMonth(end.getMonth() + months)

 let current = new Date(start)

 while (current.getDay() !== weekday) {
  current.setDate(current.getDate() + 1)
 }

 while (current <= end) {

  dates.push(current.toISOString().split("T")[0])

  current.setDate(current.getDate() + 7)
 }

 return dates
}

export async function POST(req: Request) {

 try {

  const body = await req.json()

  const property_id = Number(body.property_id)
  const guest_name = body.guest_name
  const guest_email = body.guest_email
  const start_date = body.start_date
  const weekday = body.weekday
  const months = body.months
  const period = body.period

  const dates = generateDates(start_date, weekday, months)

  for (const date of dates) {

   const { data } = await supabase
    .from("bookings")
    .select("*")
    .eq("property_id", property_id)
    .eq("date", date)

   for (const booking of data || []) {

    if (
     booking.period === period ||
     booking.period === "day" ||
     booking.period === "exclusive" ||
     period === "day" ||
     period === "exclusive"
    ) {
     return NextResponse.json(
      { error: `Conflito em ${date}` },
      { status: 409 }
     )
    }
   }
  }

  const groupId = randomUUID()

  const bookings = dates.map(date => ({
   property_id,
   guest_name,
   guest_email,
   date,
   period,
   booking_group_id: groupId
  }))

  const { data, error } = await supabase
   .from("bookings")
   .insert(bookings)
   .select()

  if (error) {
   return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
   success: true,
   created: data.length
  })

 } catch {

  return NextResponse.json(
   { error: "Erro no servidor" },
   { status: 500 }
  )

 }
}