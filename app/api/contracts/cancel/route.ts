import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import Stripe from "stripe"

function addMonthsISO(dateStr: string, months: number) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString().split("T")[0]
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

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const contractId = String(body.contract_id || "").trim()

    if (!contractId) {
      return NextResponse.json({ error: "Missing contract_id" }, { status: 400 })
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

    const { data: contract, error } = await supabase
      .from("recurring_contracts")
      .select("*")
      .eq("id", contractId)
      .single()

    if (error || !contract) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 })
    }

    if (contract.status === "cancelled") {
      return NextResponse.json({ ok: true, status: "already_cancelled" })
    }

    const today = new Date().toISOString().split("T")[0]
    const minimumEndDate = addMonthsISO(
      contract.date,
      Number(contract.monthly_commitment_months || 1)
    )

    const penaltyDue = today < minimumEndDate
    const monthlyTotal = Math.max(1, Math.round(Number(contract.monthly_total || 0) * 100))

    if (penaltyDue) {
      const customerId = contract.stripe_customer_id
      if (!customerId) {
        return NextResponse.json(
          { error: "No Stripe customer saved for this contract" },
          { status: 400 }
        )
      }

      const paymentMethodId = await getPaymentMethodId(stripe, customerId)
      if (!paymentMethodId) {
        return NextResponse.json(
          { error: "No saved payment method for this contract" },
          { status: 400 }
        )
      }

      try {
        const feeIntent = await stripe.paymentIntents.create({
          amount: monthlyTotal,
          currency: "brl",
          customer: customerId,
          payment_method: paymentMethodId,
          off_session: true,
          confirm: true,
          description: `Multa de cancelamento Liberoom - contrato ${contract.id}`,
          metadata: {
            contract_id: String(contract.id),
            penalty: "true",
          },
        })

        await supabase
          .from("recurring_contracts")
          .update({
            status: "cancelled",
            canceled_at: new Date().toISOString(),
            cancellation_fee_paid: true,
            stripe_payment_intent: feeIntent.id,
          })
          .eq("id", contract.id)

        await supabase
          .from("bookings")
          .delete()
          .eq("contract_id", contract.id)
          .gte("date", today)

        return NextResponse.json({
          ok: true,
          cancelled: true,
          penalty_charged: true,
        })
      } catch (err: any) {
        return NextResponse.json(
          {
            error:
              err?.message ||
              "Failed to charge cancellation fee automatically",
          },
          { status: 402 }
        )
      }
    }

    await supabase
      .from("bookings")
      .delete()
      .eq("contract_id", contract.id)
      .gte("date", today)

    await supabase
      .from("recurring_contracts")
      .update({
        status: "cancelled",
        canceled_at: new Date().toISOString(),
        cancellation_fee_paid: false,
      })
      .eq("id", contract.id)

    return NextResponse.json({
      ok: true,
      cancelled: true,
      penalty_charged: false,
    })
  } catch (err: any) {
    console.error("CANCEL CONTRACT ERROR:", err)
    return NextResponse.json(
      { error: err?.message || "Internal error" },
      { status: 500 }
    )
  }
}