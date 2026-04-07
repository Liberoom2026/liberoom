import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
 process.env.NEXT_PUBLIC_SUPABASE_URL!,
 process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: Request) {

 const { searchParams } = new URL(req.url)
 const email = searchParams.get("email")

 if (!email) {
  return NextResponse.json({ error: "email required" }, { status: 400 })
 }

 // pegar espaços do dono
 const { data: properties } = await supabase
  .from("properties")
  .select("id, title, price_per_hour")
  .eq("owner_email", email)

 if (!properties || properties.length === 0) {
  return NextResponse.json([])
 }

 const propertyIds = properties.map(p => p.id)

 // pegar reservas desses espaços
 const { data: bookings } = await supabase
  .from("bookings")
  .select("*")
  .in("property_id", propertyIds)

 return NextResponse.json({
  properties,
  bookings
 })
}