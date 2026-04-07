import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");

    if (!email) {
      return NextResponse.json({ error: "email required" }, { status: 400 });
    }

    const [bookingsRes, contractsRes] = await Promise.all([
      supabase
        .from("bookings")
        .select("*")
        .eq("guest_email", email)
        .order("date", { ascending: true }),
      supabase
        .from("recurring_contracts")
        .select("*")
        .eq("guest_email", email)
        .order("next_billing_date", { ascending: true, nullsFirst: false }),
    ]);

    if (bookingsRes.error) {
      return NextResponse.json({ error: bookingsRes.error.message }, { status: 500 });
    }

    if (contractsRes.error) {
      return NextResponse.json({ error: contractsRes.error.message }, { status: 500 });
    }

    return NextResponse.json({
      bookings: bookingsRes.data ?? [],
      recurring_contracts: contractsRes.data ?? [],
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Internal error" },
      { status: 500 }
    );
  }
}