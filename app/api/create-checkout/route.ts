import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

type Slot = {
  date: string;
  period?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  source?: "booking" | "block";
};

type Interval = {
  start: number;
  end: number;
};

function parseTimeToMinutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

function periodToInterval(period: string): Interval | null {
  if (period === "morning") return { start: 8 * 60, end: 12 * 60 };
  if (period === "afternoon") return { start: 12 * 60, end: 18 * 60 };
  if (period === "evening") return { start: 18 * 60, end: 22 * 60 };
  if (period === "day" || period === "exclusive") return { start: 0, end: 24 * 60 };
  return null;
}

function itemToInterval(item: Pick<Slot, "period" | "start_time" | "end_time">) {
  if (item.period) return periodToInterval(item.period);

  if (item.start_time && item.end_time) {
    return {
      start: parseTimeToMinutes(item.start_time),
      end: parseTimeToMinutes(item.end_time),
    };
  }

  return null;
}

function addDaysISO(dateStr: string, days: number) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addMonthsISO(dateStr: string, months: number) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

function getRecurringDates(
  startDate: string,
  recurrenceType: "none" | "weekly" | "biweekly",
  commitmentMonths: number
) {
  if (recurrenceType === "none") return [startDate];

  const safeMonths = Math.max(1, Math.min(12, commitmentMonths));
  const endDate = addMonthsISO(startDate, safeMonths);
  const stepDays = recurrenceType === "biweekly" ? 14 : 7;

  const dates: string[] = [];
  let current = startDate;

  while (current <= endDate) {
    dates.push(current);
    current = addDaysISO(current, stepDays);
  }

  return dates;
}

function getBaseDurationHours(period: string | null, start_time: string | null, end_time: string | null) {
  if (start_time && end_time) {
    return Math.max(1, Math.ceil((parseTimeToMinutes(end_time) - parseTimeToMinutes(start_time)) / 60));
  }

  if (period === "day" || period === "exclusive") return 24;
  if (period === "morning") return 4;
  if (period === "afternoon") return 6;
  if (period === "evening") return 4;

  return 1;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const property_id = Number(body.property_id);
    const guest_name = String(body.guest_name || "").trim();
    const guest_email = String(body.guest_email || "").trim();
    const date = String(body.date || "");
    const period = body.period ? String(body.period) : null;
    const start_time = body.start_time ? String(body.start_time) : null;
    const end_time = body.end_time ? String(body.end_time) : null;
    const billing_mode = body.billing_mode ? String(body.billing_mode) : "one_time";
    const recurrence_type = body.recurrence_type ? String(body.recurrence_type) : "none";
    const monthly_commitment_months = body.monthly_commitment_months
      ? Number(body.monthly_commitment_months)
      : 1;

    if (!property_id || !guest_name || !guest_email || !date) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    if (monthly_commitment_months < 1 || monthly_commitment_months > 12) {
      return NextResponse.json(
        { error: "monthly_commitment_months must be between 1 and 12" },
        { status: 400 }
      );
    }

    const isTimeBooking = !!start_time && !!end_time;
    const isPeriodBooking = !!period;

    if (!isTimeBooking && !isPeriodBooking) {
      return NextResponse.json(
        { error: "Provide either period or start_time/end_time" },
        { status: 400 }
      );
    }

    if (isTimeBooking) {
      const startMin = parseTimeToMinutes(start_time!);
      const endMin = parseTimeToMinutes(end_time!);

      if (endMin <= startMin) {
        return NextResponse.json(
          { error: "end_time must be greater than start_time" },
          { status: 400 }
        );
      }
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

    if (!supabaseUrl || !supabaseKey || !stripeKey || !siteUrl) {
      return NextResponse.json({ error: "Missing env vars" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const stripe = new Stripe(stripeKey);

    const recurringMonthly = billing_mode === "weekly_monthly";
    const recurringType = recurrence_type as "none" | "weekly" | "biweekly";

    if (recurringMonthly && recurringType !== "weekly" && recurringType !== "biweekly") {
      return NextResponse.json(
        { error: "Invalid recurrence_type for recurring booking" },
        { status: 400 }
      );
    }

    const occurrenceDates = getRecurringDates(date, recurringType, monthly_commitment_months);
    const monthlyCycleDates = recurringMonthly
      ? getRecurringDates(date, recurringType, 1)
      : [date];

    const candidateInterval = isTimeBooking
      ? {
          start: parseTimeToMinutes(start_time!),
          end: parseTimeToMinutes(end_time!),
        }
      : periodToInterval(period!);

    if (!candidateInterval) {
      return NextResponse.json({ error: "Invalid booking interval" }, { status: 400 });
    }

    const uniqueDates = [...new Set(occurrenceDates)];

    const [
      { data: existingBookings, error: bookingsError },
      { data: existingBlocks, error: blocksError },
    ] = await Promise.all([
      supabase
        .from("bookings")
        .select("*")
        .eq("property_id", property_id)
        .in("date", uniqueDates),
      supabase
        .from("blocked_slots")
        .select("*")
        .eq("property_id", property_id)
        .in("date", uniqueDates),
    ]);

    if (bookingsError) {
      return NextResponse.json({ error: bookingsError.message }, { status: 500 });
    }

    if (blocksError) {
      return NextResponse.json({ error: blocksError.message }, { status: 500 });
    }

    const allExistingSlots: Slot[] = [
      ...(existingBookings || []).map((item: any) => ({
        date: String(item.date),
        period: item.period ?? null,
        start_time: item.start_time ?? null,
        end_time: item.end_time ?? null,
        source: "booking" as const,
      })),
      ...(existingBlocks || []).map((item: any) => ({
        date: String(item.date),
        period: item.period ?? null,
        start_time: item.start_time ?? null,
        end_time: item.end_time ?? null,
        source: "block" as const,
      })),
    ];

    for (const occurrenceDate of occurrenceDates) {
      const conflicts = allExistingSlots.filter((item) => {
        if (item.date !== occurrenceDate) return false;

        const itemInterval = itemToInterval(item);
        if (!itemInterval) return false;

        return overlaps(
          candidateInterval.start,
          candidateInterval.end,
          itemInterval.start,
          itemInterval.end
        );
      });

      if (conflicts.length > 0) {
        return NextResponse.json(
          {
            error: "Conflicts with existing booking or block",
            conflict_date: occurrenceDate,
            conflict_type: conflicts[0].source,
          },
          { status: 400 }
        );
      }
    }

    const propertyRes = await supabase
      .from("properties")
      .select("price_per_hour, title")
      .eq("id", property_id)
      .single();

    if (propertyRes.error || !propertyRes.data) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    const pricePerHour = Number(propertyRes.data.price_per_hour || 0);
    const baseDurationHours = getBaseDurationHours(period, start_time, end_time);

    const monthlyTotal = Math.max(
      1,
      Math.round(pricePerHour * baseDurationHours * monthlyCycleDates.length * 100)
    );

    const amount = recurringMonthly
      ? monthlyTotal
      : Math.max(1, Math.round(pricePerHour * baseDurationHours * 100));

    let customerId: string | undefined;

    if (recurringMonthly) {
      const customer = await stripe.customers.create({
        email: guest_email,
        name: guest_name,
        metadata: {
          property_id: String(property_id),
          billing_mode,
          recurrence_type: recurringType,
          monthly_commitment_months: String(monthly_commitment_months),
        },
      });

      customerId = customer.id;
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      customer_email: customerId ? undefined : guest_email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "brl",
            unit_amount: amount,
            product_data: {
              name: propertyRes.data.title || "Reserva Liberoom",
            },
          },
        },
      ],
      payment_intent_data: recurringMonthly
        ? {
            setup_future_usage: "off_session",
          }
        : undefined,
      metadata: {
        property_id: String(property_id),
        guest_name,
        guest_email,
        date,
        period: period || "",
        start_time: start_time || "",
        end_time: end_time || "",
        duration_hours: String(baseDurationHours),
        billing_mode,
        recurrence_type: recurringType,
        monthly_commitment_months: String(monthly_commitment_months),
        recurrence_count: String(occurrenceDates.length),
        recurrence_interval: String(recurringType === "biweekly" ? 2 : recurringType === "weekly" ? 1 : 0),
        monthly_cycle_count: String(monthlyCycleDates.length),
      },
      success_url: `${siteUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/cancel`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("CREATE CHECKOUT ERROR:", err);
    return NextResponse.json(
      { error: err?.message || "Internal error" },
      { status: 500 }
    );
  }
}