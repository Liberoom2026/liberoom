import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// 🔥 CORS
function getCorsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

// 🔥 OPTIONS (pré-flight)
export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(origin),
  });
}

// 🔥 POST (checkout)
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");

  try {
    const body = await req.json();

    const {
      property_id,
      guest_name,
      guest_email,
      phone,
      date,
      duration_hours,
      billing_mode,
    } = body;

    if (!property_id || !guest_name || !guest_email) {
      return NextResponse.json(
        { error: "Dados obrigatórios faltando" },
        { status: 400, headers: getCorsHeaders(origin) }
      );
    }

    // 💰 valor fixo inicial (ajuste depois)
    const amount = 5000;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      customer_email: guest_email,
      line_items: [
        {
          price_data: {
            currency: "brl",
            product_data: {
              name: `Reserva - imóvel ${property_id}`,
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      success_url: "https://liberoom.vercel.app/success",
      cancel_url: "https://liberoom.vercel.app/cancel",
      metadata: {
        property_id: String(property_id),
        guest_name,
        guest_email,
        phone: phone || "",
        date: date || "",
        duration_hours: String(duration_hours || ""),
        billing_mode: billing_mode || "",
      },
    });

    return NextResponse.json(
      { url: session.url },
      {
        status: 200,
        headers: getCorsHeaders(origin),
      }
    );
  } catch (error: any) {
    console.error("Erro checkout:", error);

    return NextResponse.json(
      { error: error.message || "Erro ao criar checkout" },
      {
        status: 500,
        headers: getCorsHeaders(origin),
      }
    );
  }
}