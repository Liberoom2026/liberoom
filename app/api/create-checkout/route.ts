import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

// 🔥 CORS
function getCorsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function jsonResponse(
  data: any,
  status: number,
  origin: string | null
) {
  return NextResponse.json(data, {
    status,
    headers: getCorsHeaders(origin),
  });
}

function toNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function toPositiveInt(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

type ReservationType = "time" | "period" | "day" | "full_property";
type PeriodType = "morning" | "afternoon" | "evening";
type BillingMode = "one_time" | "recurring";

type PropertyRow = {
  id: string;
  title: string | null;
  price_per_hour: number | null;
  price_per_day: number | null;
  price_per_month: number | null;
  price_morning: number | null;
  price_afternoon: number | null;
  price_evening: number | null;
  min_months_full_rental: number | null;
};

function calcAmountCents(params: {
  property: PropertyRow;
  reservation_type: ReservationType;
  period?: PeriodType;
  duration_hours?: number;
  days_count?: number;
  months_count?: number;
}): number {
  const { property, reservation_type, period } = params;

  const pricePerHour = toNumber(property.price_per_hour);
  const pricePerDay = toNumber(property.price_per_day);
  const pricePerMonth = toNumber(property.price_per_month);

  const morningPrice = toNumber(property.price_morning);
  const afternoonPrice = toNumber(property.price_afternoon);
  const eveningPrice = toNumber(property.price_evening);

  const minMonths = Math.max(
    3,
    toNumber(property.min_months_full_rental) || 3
  );

  const legacyFallbackCents = 5000; // R$ 50,00 como fallback de compatibilidade

  let amountBRL = 0;

  switch (reservation_type) {
    case "time": {
      const hours = toPositiveInt(params.duration_hours);
      if (!hours) {
        throw new Error("duration_hours é obrigatório para reservation_type=time");
      }

      if (pricePerHour > 0) {
        amountBRL = pricePerHour * hours;
      } else {
        amountBRL = legacyFallbackCents / 100;
      }
      break;
    }

    case "period": {
      if (!period) {
        throw new Error("period é obrigatório para reservation_type=period");
      }

      const periodFixedPrice =
        period === "morning"
          ? morningPrice
          : period === "afternoon"
            ? afternoonPrice
            : eveningPrice;

      if (periodFixedPrice > 0) {
        amountBRL = periodFixedPrice;
      } else {
        const hours =
          toPositiveInt(params.duration_hours) ||
          (period === "morning" ? 4 : period === "afternoon" ? 4 : 4);

        if (pricePerHour > 0) {
          amountBRL = pricePerHour * hours;
        } else {
          amountBRL = legacyFallbackCents / 100;
        }
      }
      break;
    }

    case "day": {
      const days = toPositiveInt(params.days_count);
      if (!days) {
        throw new Error("days_count é obrigatório para reservation_type=day");
      }

      if (pricePerDay > 0) {
        amountBRL = pricePerDay * days;
      } else if (pricePerHour > 0) {
        amountBRL = pricePerHour * 8 * days;
      } else {
        amountBRL = (legacyFallbackCents / 100) * days;
      }
      break;
    }

    case "full_property": {
      const months = toPositiveInt(params.months_count);
      if (!months) {
        throw new Error(
          "months_count é obrigatório para reservation_type=full_property"
        );
      }

      if (months < minMonths) {
        throw new Error(`Imóvel completo exige no mínimo ${minMonths} meses`);
      }

      if (pricePerMonth > 0) {
        amountBRL = pricePerMonth * months;
      } else if (pricePerDay > 0) {
        amountBRL = pricePerDay * 30 * months;
      } else if (pricePerHour > 0) {
        amountBRL = pricePerHour * 8 * 30 * months;
      } else {
        amountBRL = (legacyFallbackCents / 100) * months;
      }
      break;
    }

    default:
      throw new Error("reservation_type inválido");
  }

  const amountCents = Math.round(amountBRL * 100);

  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new Error("Valor calculado inválido");
  }

  return amountCents;
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
    if (!supabaseUrl || !supabaseServiceRoleKey || !process.env.STRIPE_SECRET_KEY) {
      return jsonResponse(
        {
          error:
            "Variáveis de ambiente ausentes: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY ou STRIPE_SECRET_KEY",
        },
        500,
        origin
      );
    }

    const body = await req.json();

    const property_id = body?.property_id;
    const guest_name = body?.guest_name;
    const guest_email = body?.guest_email;
    const phone = body?.phone || "";
    const date = body?.date || "";
    const start_at = body?.start_at || "";
    const end_at = body?.end_at || "";

    const billing_mode: BillingMode = body?.billing_mode || "one_time";
    const reservation_type: ReservationType = body?.reservation_type || "time";
    const period: PeriodType | undefined = body?.period;
    const duration_hours = body?.duration_hours;
    const days_count = body?.days_count;
    const months_count = body?.months_count;

    if (!property_id || !guest_name || !guest_email) {
      return jsonResponse(
        { error: "Dados obrigatórios faltando" },
        400,
        origin
      );
    }

    const { data: property, error: propertyError } = await supabase
      .from("properties")
      .select(
        "id,title,price_per_hour,price_per_day,price_per_month,price_morning,price_afternoon,price_evening,min_months_full_rental"
      )
      .eq("id", property_id)
      .single<PropertyRow>();

    if (propertyError || !property) {
      console.error("Erro ao buscar propriedade:", propertyError);
      return jsonResponse(
        { error: "Imóvel não encontrado" },
        404,
        origin
      );
    }

    const amount = calcAmountCents({
      property,
      reservation_type,
      period,
      duration_hours,
      days_count,
      months_count,
    });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      customer_email: guest_email,
      line_items: [
        {
          price_data: {
            currency: "brl",
            product_data: {
              name:
                property.title ||
                `Reserva - imóvel ${property_id}`,
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
        guest_name: String(guest_name),
        guest_email: String(guest_email),
        phone: String(phone),
        date: String(date),
        start_at: String(start_at),
        end_at: String(end_at),
        reservation_type: String(reservation_type),
        period: period ? String(period) : "",
        duration_hours: duration_hours ? String(duration_hours) : "",
        days_count: days_count ? String(days_count) : "",
        months_count: months_count ? String(months_count) : "",
        billing_mode: String(billing_mode),
      },
    });

    return jsonResponse(
      {
        url: session.url,
        session_id: session.id,
        amount_cents: amount,
      },
      200,
      origin
    );
  } catch (error: any) {
    console.error("Erro checkout:", error);

    return jsonResponse(
      { error: error?.message || "Erro ao criar checkout" },
      500,
      origin
    );
  }
}