import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_SERVICE_KEY;

    if (!stripeSecretKey || !webhookSecret || !supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        {
          error: "Missing env vars",
          details: {
            has_stripe_secret_key: !!stripeSecretKey,
            has_webhook_secret: !!webhookSecret,
            has_supabase_url: !!supabaseUrl,
            has_supabase_key: !!supabaseKey,
          },
        },
        { status: 500 }
      );
    }

    const stripe = new Stripe(stripeSecretKey);
    const supabase = createClient(supabaseUrl, supabaseKey);

    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 });
    }

    const rawBody = await req.text();

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err: any) {
      console.error("Webhook signature verification failed:", err?.message || err);
      return NextResponse.json(
        { error: `Webhook Error: ${err?.message || "signature verification failed"}` },
        { status: 400 }
      );
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as any;
      const bookingId = Number(session?.metadata?.booking_id);

      if (!bookingId || Number.isNaN(bookingId)) {
        return NextResponse.json(
          { error: "Missing booking_id in Stripe metadata" },
          { status: 400 }
        );
      }

      const updatePayload: Record<string, any> = {
        status: session.mode === "subscription" ? "confirmed" : "paid",
        stripe_checkout_session_id: session.id || null,
        stripe_payment_intent:
          typeof session.payment_intent === "string" ? session.payment_intent : null,
        stripe_payment_status: session.payment_status || null,
      };

      if (session?.metadata?.user_id) {
        updatePayload.user_id = session.metadata.user_id;
      }
      if (session?.metadata?.guest_name) {
        updatePayload.guest_name = session.metadata.guest_name;
      }
      if (session?.metadata?.guest_email) {
        updatePayload.guest_email = session.metadata.guest_email;
      }
      if (session?.metadata?.owner_id) {
        updatePayload.owner_id = session.metadata.owner_id;
      }
      if (session?.metadata?.owner_email) {
        updatePayload.owner_email = session.metadata.owner_email;
      }

      const { error: bookingError } = await supabase
        .from("bookings")
        .update(updatePayload)
        .eq("id", bookingId);

      if (bookingError) {
        throw bookingError;
      }

      if (session.mode === "subscription") {
        const subscriptionId =
          typeof session.subscription === "string" ? session.subscription : null;
        const customerId = typeof session.customer === "string" ? session.customer : null;

        if (subscriptionId) {
          const contractPayload = {
            booking_id: bookingId,
            property_id: Number(session?.metadata?.property_id) || null,
            status: "active",
            stripe_subscription_id: subscriptionId,
            stripe_customer_id: customerId,
            recurrence_unit: session?.metadata?.recurrence_unit || "weekly",
            recurrence_months: session?.metadata?.recurrence_months
              ? Number(session.metadata.recurrence_months)
              : null,
            recurrence_count: session?.metadata?.recurrence_count
              ? Number(session.metadata.recurrence_count)
              : null,
            start_at: session?.metadata?.start_at || null,
            end_at: session?.metadata?.end_at || null,
            user_id: session?.metadata?.user_id || null,
            guest_name: session?.metadata?.guest_name || null,
            guest_email: session?.metadata?.guest_email || null,
            owner_id: session?.metadata?.owner_id || null,
            owner_email: session?.metadata?.owner_email || null,
          };

          const { error: contractError } = await supabase
            .from("recurring_contracts")
            .insert(contractPayload);

          if (contractError) {
            console.error("Recurring contract creation failed:", contractError);
          }
        }
      }

      return NextResponse.json({
        received: true,
        booking_id: bookingId,
      });
    }

    if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object as any;
      const subscriptionId =
        typeof invoice.subscription === "string" ? invoice.subscription : null;

      if (subscriptionId) {
        const { error } = await supabase
          .from("recurring_contracts")
          .update({ status: "active" })
          .eq("stripe_subscription_id", subscriptionId);

        if (error) {
          throw error;
        }
      }

      return NextResponse.json({ received: true });
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("WEBHOOK ERROR:", err);
    return NextResponse.json(
      { error: err?.message || "Internal error" },
      { status: 500 }
    );
  }
}