import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import Stripe from "stripe"

type Slot = {
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

function itemToInterval(item: Slot) {
  if (item.period) return periodToInterval(item.period)

  if (item.start_time && item.end_time) {
    return {
      start: parseTimeToMinutes(item.start_time),
      end: parseTimeToMinutes(item.end_time),
    }
  }

  return null
}

function addDaysISO(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split("T")[0]
}

function addWeeksISO(dateStr: string, weeks: number) {
  return addDaysISO(dateStr, weeks * 7)
}

function buildWeeklyCycleDates(
  startDate: string,
  recurrenceIntervalWeeks: number,
  recurrenceCount: number
) {
  const dates: string[] = []

  for (let i = 0; i < recurrenceCount; i++) {
    dates.push(addWeeksISO(startDate, i * recurrenceIntervalWeeks))
  }

  return dates
}

async function getPaymentMethodId(stripe: Stripe, customerId: string) {
  const customer: any = await stripe.customers.retrieve(customerId)

  if (customer && !customer.deleted) {
    const defaultPm =
      typeof customer.invoice_settings?.default_payment_method === "string"
        ? customer.invoice_settings.default_payment_method
        : null

    if (defaultPm) return defaultPm
  }

  const methods = await stripe.paymentMethods.list({
    customer: customerId,
    type: "card",
    limit: 1,
  })

  return methods.data[0]?.id || null
}

async function hasConflictForSlot(
  supabase: any,
  propertyId: string,
  date: string,
  slot: any
) {
  const [bookingsRes, blocksRes] = await Promise.all([
    supabase
      .from("bookings")
      .select("*")
      .eq("property_id", propertyId)
      .eq("date", date),
    supabase
      .from("blocked_slots")
      .select("*")
      .eq("property_id", propertyId)
      .eq("date", date),
  ])

  if (bookingsRes.error) throw new Error(bookingsRes.error.message)
  if (blocksRes.error) throw new Error(blocksRes.error.message)

  const candidateInterval = itemToInterval(slot)
  if (!candidateInterval) return true

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

  return (bookingsRes.data || []).some(conflictsWith) || (blocksRes.data || []).some(conflictsWith)
}

function addMonthsISO(dateStr: string, months: number) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString().split("T")[0]
}

export async function POST(req: Request) {
  try {
    const searchUrl = new URL(req.url)
    const secret = searchUrl.searchParams.get("secret") || ""

    if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!stripeKey || !supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: "Missing env vars" }, { status: 500 })
    }

    const stripe = new Stripe(stripeKey)
    const supabase = createClient(supabaseUrl, supabaseKey)

    const today = new Date().toISOString().split("T")[0]

    const { data: contracts, error } = await supabase
      .from("recurring_contracts")
      .select("*")
      .eq("status", "active")
      .eq("billing_mode", "weekly_monthly")

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const results: any[] = []

    for (const contract of contracts || []) {
      const nextBillingDate = contract.next_billing_date || contract.date
      if (nextBillingDate > today) continue

      const recurrenceInterval = Number(contract.recurrence_interval || 1)
      const recurrenceCount = Number(contract.recurrence_count || 4)
      const propertyId = Number(contract.property_id)

      const slot: Slot = {
        period: contract.period,
        start_time: contract.start_time,
        end_time: contract.end_time,
      }

      const cycleDates = buildWeeklyCycleDates(
        nextBillingDate,
        recurrenceInterval,
        recurrenceCount
      )

      let conflictFound = false
      for (const d of cycleDates) {
        const conflict = await hasConflictForSlot(supabase, propertyId, d, slot)
        if (conflict) {
          conflictFound = true
          break
        }
      }

      if (conflictFound) {
        await supabase
          .from("recurring_contracts")
          .update({ status: "paused_conflict" })
          .eq("id", contract.id)

        results.push({
          contract_id: contract.id,
          status: "paused_conflict",
        })
        continue
      }

      const customerId = contract.stripe_customer_id
      if (!customerId) {
        await supabase
          .from("recurring_contracts")
          .update({ status: "payment_failed" })
          .eq("id", contract.id)

        results.push({
          contract_id: contract.id,
          status: "missing_customer",
        })
        continue
      }

      const paymentMethodId = await getPaymentMethodId(stripe, customerId)
      if (!paymentMethodId) {
        await supabase
          .from("recurring_contracts")
          .update({ status: "payment_failed" })
          .eq("id", contract.id)

        results.push({
          contract_id: contract.id,
          status: "missing_payment_method",
        })
        continue
      }

      const amount = Math.max(1, Math.round(Number(contract.monthly_total || 0) * 100))

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount,
          currency: "brl",
          customer: customerId,
          payment_method: paymentMethodId,
          off_session: true,
          confirm: true,
          description: `Cobrança mensal Liberoom - contrato ${contract.id}`,
          metadata: {
            contract_id: String(contract.id),
            property_id: String(contract.property_id),
          },
        })

        const bookingsPayload = cycleDates.map((d) => ({
          contract_id: contract.id,
          property_id: contract.property_id,
          guest_name: contract.guest_name,
          guest_email: contract.guest_email,
          date: d,
          period: contract.period,
          start_time: contract.start_time,
          end_time: contract.end_time,
          duration_hours: contract.duration_hours,
          recurrence_type: contract.recurrence_type,
          recurrence_interval: contract.recurrence_interval,
          recurrence_count: contract.recurrence_count,
          stripe_payment_intent: paymentIntent.id,
        }))

        const { error: insertError } = await supabase
          .from("bookings")
          .insert(bookingsPayload)

        if (insertError) {
          await stripe.refunds.create({
            payment_intent: paymentIntent.id,
          })

          await supabase
            .from("recurring_contracts")
            .update({ status: "booking_generation_failed" })
            .eq("id", contract.id)

          results.push({
            contract_id: contract.id,
            status: "booking_generation_failed",
          })
          continue
        }

        const nextCycleDate = addWeeksISO(nextBillingDate, recurrenceInterval * recurrenceCount)

        await supabase
          .from("recurring_contracts")
          .update({
            next_billing_date: nextCycleDate,
            last_billed_at: new Date().toISOString(),
            stripe_payment_method: paymentMethodId,
            status: "active",
          })
          .eq("id", contract.id)

        results.push({
          contract_id: contract.id,
          status: "charged",
          next_billing_date: nextCycleDate,
        })
      } catch (err: any) {
        await supabase
          .from("recurring_contracts")
          .update({ status: "payment_failed" })
          .eq("id", contract.id)

        results.push({
          contract_id: contract.id,
          status: "payment_failed",
          error: err?.message || "Payment failed",
        })
      }
    }

    return NextResponse.json({ ok: true, results })
  } catch (err: any) {
    console.error("RUN RECURRING ERROR:", err)
    return NextResponse.json(
      { error: err?.message || "Internal error" },
      { status: 500 }
    )
  }
}