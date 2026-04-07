import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

function itemToInterval(item: Slot): Interval | null {
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

function getCandidateInterval(item: {
  period: string | null;
  start_time: string | null;
  end_time: string | null;
}) {
  if (item.start_time && item.end_time) {
    return {
      start: parseTimeToMinutes(item.start_time),
      end: parseTimeToMinutes(item.end_time),
    };
  }

  if (item.period) {
    return periodToInterval(item.period);
  }

  return null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const property_id = Number(body.property_id);
    const date = String(body.date || "");
    const period = body.period ? String(body.period) : null;
    const start_time = body.start_time ? String(body.start_time) : null;
    const end_time = body.end_time ? String(body.end_time) : null;
    const recurrence_type = body.recurrence_type ? String(body.recurrence_type) : "none";
    const monthly_commitment_months = body.monthly_commitment_months
      ? Number(body.monthly_commitment_months)
      : 1;

    if (!property_id || !date) {
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

    const candidateInterval = isTimeBooking
      ? {
          start: parseTimeToMinutes(start_time!),
          end: parseTimeToMinutes(end_time!),
        }
      : periodToInterval(period!);

    if (!candidateInterval) {
      return NextResponse.json({ error: "Invalid booking interval" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: "Missing env vars" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const occurrenceDates = getRecurringDates(
      date,
      recurrence_type as "none" | "weekly" | "biweekly",
      monthly_commitment_months
    );

    const uniqueDates = [...new Set(occurrenceDates)];

    const [
      { data: existingBookings, error: bookingsError },
      { data: existingBlocks, error: blocksError },
    ] = await Promise.all([
      supabase
        .from("bookings")
        .select("date, period, start_time, end_time")
        .eq("property_id", property_id)
        .in("date", uniqueDates),
      supabase
        .from("blocked_slots")
        .select("date, period, start_time, end_time")
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

    const occurrences = occurrenceDates.map((occurrenceDate) => {
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

      return {
        date: occurrenceDate,
        occupied: conflicts.length > 0,
        conflict_type: conflicts[0]?.source || null,
        conflicts: conflicts.map((c) => ({
          source: c.source || null,
          period: c.period || null,
          start_time: c.start_time || null,
          end_time: c.end_time || null,
        })),
      };
    });

    return NextResponse.json({ occurrences });
  } catch (err: any) {
    console.error("AVAILABILITY ERROR:", err);
    return NextResponse.json(
      { error: err?.message || "Internal error" },
      { status: 500 }
    );
  }
}