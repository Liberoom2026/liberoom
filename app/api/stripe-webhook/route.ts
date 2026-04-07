import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

type Slot = {
  date?: string;
  period?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  source?: "booking" | "block";
};

type Interval = {
  start: number;
  end: number;
};

type BookingEmailPayload = {
  guestName: string;
  guestEmail: string;
  ownerEmail?: string | null;
  propertyTitle: string;
  date: string;
  period: string | null;
  startTime: string | null;
  endTime: string | null;
  billingMode: string;
  recurrenceType: "none" | "weekly" | "biweekly";
  monthlyCommitmentMonths: number;
  recurrenceCount: number;
  occurrenceDates: string[];
  durationHours: number;
  amountInCents: number;
  monthlyTotalInCents: number;
  nextBillingDate?: string | null;
  siteUrl?: string | null;
  bookingIdLabel?: string;
  contractIdLabel?: string;
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

function buildWebhookSecrets() {
  const direct = [
    process.env.STRIPE_WEBHOOK_SECRET,
    process.env.STRIPE_WEBHOOK_SECRET_LOCAL,
    process.env.STRIPE_WEBHOOK_SECRET_LIVE,
  ].filter(Boolean) as string[];

  const list = process.env.STRIPE_WEBHOOK_SECRETS
    ? process.env.STRIPE_WEBHOOK_SECRETS.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  return Array.from(new Set([...direct, ...list]));
}

function verifyEvent(
  stripe: Stripe,
  rawBody: string,
  signature: string,
  secrets: string[]
) {
  let lastError: unknown = null;

  for (const secret of secrets) {
    try {
      return stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error("Unable to verify webhook signature");
}

function getBaseDurationHours(
  period: string | null,
  start_time: string | null,
  end_time: string | null
) {
  if (start_time && end_time) {
    return Math.max(
      1,
      Math.ceil((parseTimeToMinutes(end_time) - parseTimeToMinutes(start_time)) / 60)
    );
  }

  if (period === "day" || period === "exclusive") return 24;
  if (period === "morning") return 4;
  if (period === "afternoon") return 6;
  if (period === "evening") return 4;

  return 1;
}

function formatDateBR(dateStr: string) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatMoneyBRLFromCents(valueInCents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valueInCents / 100);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function periodLabel(period: string | null, startTime: string | null, endTime: string | null) {
  if (startTime && endTime) return `${startTime} - ${endTime}`;
  if (period === "morning") return "Manhã";
  if (period === "afternoon") return "Tarde";
  if (period === "evening") return "Noite";
  if (period === "day") return "Diária";
  if (period === "exclusive") return "Exclusivo";
  return "Horário exato";
}

function recurrenceLabel(recurrenceType: "none" | "weekly" | "biweekly", interval?: number | null) {
  if (recurrenceType === "weekly") return interval ? `Semanal · a cada ${interval}x` : "Semanal";
  if (recurrenceType === "biweekly") return interval ? `Quinzenal · a cada ${interval}x` : "Quinzenal";
  return "Única";
}

async function sendResendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  idempotencyKey: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  const fromName = process.env.EMAIL_FROM_NAME || "Liberoom";

  if (!apiKey || !fromEmail) {
    console.warn("Resend not configured: missing RESEND_API_KEY or RESEND_FROM_EMAIL");
    return false;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": params.idempotencyKey,
    },
    body: JSON.stringify({
      from: `${fromName} <${fromEmail}>`,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text,
      reply_to: params.replyTo,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Resend error (${response.status}): ${errorText || "failed to send email"}`
    );
  }

  return true;
}

function buildClientEmail(payload: BookingEmailPayload) {
  const isRecurring = payload.billingMode === "weekly_monthly";
  const datesText = payload.occurrenceDates.map((d) => formatDateBR(d)).join(", ");

  const subject = isRecurring
    ? "Recorrência confirmada no Liberoom"
    : "Reserva confirmada no Liberoom";

  const text = isRecurring
    ? [
        `Olá, ${payload.guestName}.`,
        "",
        "Sua recorrência foi confirmada com sucesso.",
        "",
        `Espaço: ${payload.propertyTitle}`,
        `Data inicial: ${formatDateBR(payload.date)}`,
        `Horário: ${periodLabel(payload.period, payload.startTime, payload.endTime)}`,
        `Duração: ${payload.durationHours}h`,
        `Frequência: ${recurrenceLabel(payload.recurrenceType)}`,
        `Compromisso: ${payload.monthlyCommitmentMonths} meses`,
        `Quantidade de datas: ${payload.recurrenceCount}`,
        `Datas geradas: ${datesText}`,
        `Valor mensal: ${formatMoneyBRLFromCents(payload.monthlyTotalInCents)}`,
        payload.nextBillingDate ? `Próxima cobrança: ${formatDateBR(payload.nextBillingDate)}` : "",
        payload.siteUrl ? `Dashboard: ${payload.siteUrl}/dashboard` : "",
      ]
        .filter(Boolean)
        .join("\n")
    : [
        `Olá, ${payload.guestName}.`,
        "",
        "Sua reserva foi confirmada com sucesso.",
        "",
        `Espaço: ${payload.propertyTitle}`,
        `Data: ${formatDateBR(payload.date)}`,
        `Horário: ${periodLabel(payload.period, payload.startTime, payload.endTime)}`,
        `Duração: ${payload.durationHours}h`,
        `Valor pago: ${formatMoneyBRLFromCents(payload.amountInCents)}`,
        payload.siteUrl ? `Dashboard: ${payload.siteUrl}/dashboard` : "",
      ]
        .filter(Boolean)
        .join("\n");

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; background:#f6f6f5; padding:24px; color:#111827;">
      <div style="max-width:640px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:20px; padding:32px;">
        <p style="font-size:12px; text-transform:uppercase; letter-spacing:.18em; color:#6b7280; margin:0 0 12px;">Liberoom</p>
        <h1 style="font-size:28px; line-height:1.2; margin:0 0 16px; color:#111827;">
          ${escapeHtml(subject)}
        </h1>
        <p style="font-size:16px; line-height:1.7; color:#374151; margin:0 0 24px;">
          Olá, ${escapeHtml(payload.guestName)}. Sua ${
            isRecurring ? "recorrência" : "reserva"
          } foi confirmada com sucesso.
        </p>

        <div style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:16px; padding:20px; margin-bottom:24px;">
          <table style="width:100%; border-collapse:collapse; font-size:14px; color:#111827;">
            <tr>
              <td style="padding:8px 0; color:#6b7280;">Espaço</td>
              <td style="padding:8px 0; font-weight:600; text-align:right;">${escapeHtml(
                payload.propertyTitle
              )}</td>
            </tr>
            <tr>
              <td style="padding:8px 0; color:#6b7280;">Data</td>
              <td style="padding:8px 0; font-weight:600; text-align:right;">${escapeHtml(
                formatDateBR(payload.date)
              )}</td>
            </tr>
            <tr>
              <td style="padding:8px 0; color:#6b7280;">Horário</td>
              <td style="padding:8px 0; font-weight:600; text-align:right;">${escapeHtml(
                periodLabel(payload.period, payload.startTime, payload.endTime)
              )}</td>
            </tr>
            <tr>
              <td style="padding:8px 0; color:#6b7280;">Duração</td>
              <td style="padding:8px 0; font-weight:600; text-align:right;">${payload.durationHours}h</td>
            </tr>
            ${
              isRecurring
                ? `
              <tr>
                <td style="padding:8px 0; color:#6b7280;">Frequência</td>
                <td style="padding:8px 0; font-weight:600; text-align:right;">${escapeHtml(
                  recurrenceLabel(payload.recurrenceType)
                )}</td>
              </tr>
              <tr>
                <td style="padding:8px 0; color:#6b7280;">Compromisso</td>
                <td style="padding:8px 0; font-weight:600; text-align:right;">${payload.monthlyCommitmentMonths} meses</td>
              </tr>
              <tr>
                <td style="padding:8px 0; color:#6b7280;">Datas geradas</td>
                <td style="padding:8px 0; font-weight:600; text-align:right;">${payload.recurrenceCount}</td>
              </tr>
              <tr>
                <td style="padding:8px 0; color:#6b7280;">Valor mensal</td>
                <td style="padding:8px 0; font-weight:600; text-align:right;">${escapeHtml(
                  formatMoneyBRLFromCents(payload.monthlyTotalInCents)
                )}</td>
              </tr>
              ${
                payload.nextBillingDate
                  ? `
                <tr>
                  <td style="padding:8px 0; color:#6b7280;">Próxima cobrança</td>
                  <td style="padding:8px 0; font-weight:600; text-align:right;">${escapeHtml(
                    formatDateBR(payload.nextBillingDate)
                  )}</td>
                </tr>
              `
                  : ""
              }
            `
                : `
              <tr>
                <td style="padding:8px 0; color:#6b7280;">Valor pago</td>
                <td style="padding:8px 0; font-weight:600; text-align:right;">${escapeHtml(
                  formatMoneyBRLFromCents(payload.amountInCents)
                )}</td>
              </tr>
            `
            }
          </table>
        </div>

        ${
          isRecurring
            ? `<p style="font-size:14px; line-height:1.7; color:#374151; margin:0 0 16px;">
                Datas geradas: ${escapeHtml(datesText)}
              </p>`
            : ""
        }

        ${
          payload.siteUrl
            ? `<p style="font-size:14px; line-height:1.7; color:#374151; margin:0;">
                Acesse seu dashboard: <a href="${escapeHtml(
                  `${payload.siteUrl}/dashboard`
                )}" style="color:#111827; font-weight:600;">${escapeHtml(
                  `${payload.siteUrl}/dashboard`
                )}</a>
              </p>`
            : ""
        }
      </div>
    </div>
  `;

  return {
    subject,
    text,
    html,
    replyTo: payload.ownerEmail || undefined,
  };
}

function buildOwnerEmail(payload: BookingEmailPayload) {
  const isRecurring = payload.billingMode === "weekly_monthly";

  const subject = isRecurring
    ? `Nova recorrência confirmada: ${payload.propertyTitle}`
    : `Nova reserva confirmada: ${payload.propertyTitle}`;

  const text = isRecurring
    ? [
        `Olá.`,
        "",
        "Uma nova recorrência foi confirmada no Liberoom.",
        "",
        `Espaço: ${payload.propertyTitle}`,
        `Cliente: ${payload.guestName} (${payload.guestEmail})`,
        `Data inicial: ${formatDateBR(payload.date)}`,
        `Horário: ${periodLabel(payload.period, payload.startTime, payload.endTime)}`,
        `Duração: ${payload.durationHours}h`,
        `Frequência: ${recurrenceLabel(payload.recurrenceType)}`,
        `Compromisso: ${payload.monthlyCommitmentMonths} meses`,
        `Quantidade de datas: ${payload.recurrenceCount}`,
        `Datas geradas: ${payload.occurrenceDates.map((d) => formatDateBR(d)).join(", ")}`,
        `Valor mensal: ${formatMoneyBRLFromCents(payload.monthlyTotalInCents)}`,
        payload.nextBillingDate ? `Próxima cobrança: ${formatDateBR(payload.nextBillingDate)}` : "",
        payload.siteUrl ? `Dashboard: ${payload.siteUrl}/dashboard` : "",
      ]
        .filter(Boolean)
        .join("\n")
    : [
        `Olá.`,
        "",
        "Uma nova reserva foi confirmada no Liberoom.",
        "",
        `Espaço: ${payload.propertyTitle}`,
        `Cliente: ${payload.guestName} (${payload.guestEmail})`,
        `Data: ${formatDateBR(payload.date)}`,
        `Horário: ${periodLabel(payload.period, payload.startTime, payload.endTime)}`,
        `Duração: ${payload.durationHours}h`,
        `Valor: ${formatMoneyBRLFromCents(payload.amountInCents)}`,
        payload.siteUrl ? `Dashboard: ${payload.siteUrl}/dashboard` : "",
      ]
        .filter(Boolean)
        .join("\n");

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; background:#f6f6f5; padding:24px; color:#111827;">
      <div style="max-width:640px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:20px; padding:32px;">
        <p style="font-size:12px; text-transform:uppercase; letter-spacing:.18em; color:#6b7280; margin:0 0 12px;">Liberoom</p>
        <h1 style="font-size:28px; line-height:1.2; margin:0 0 16px; color:#111827;">
          ${escapeHtml(subject)}
        </h1>
        <p style="font-size:16px; line-height:1.7; color:#374151; margin:0 0 24px;">
          Uma nova ${isRecurring ? "recorrência" : "reserva"} foi confirmada.
        </p>

        <div style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:16px; padding:20px; margin-bottom:24px;">
          <table style="width:100%; border-collapse:collapse; font-size:14px; color:#111827;">
            <tr>
              <td style="padding:8px 0; color:#6b7280;">Espaço</td>
              <td style="padding:8px 0; font-weight:600; text-align:right;">${escapeHtml(
                payload.propertyTitle
              )}</td>
            </tr>
            <tr>
              <td style="padding:8px 0; color:#6b7280;">Cliente</td>
              <td style="padding:8px 0; font-weight:600; text-align:right;">${escapeHtml(
                payload.guestName
              )}</td>
            </tr>
            <tr>
              <td style="padding:8px 0; color:#6b7280;">E-mail do cliente</td>
              <td style="padding:8px 0; font-weight:600; text-align:right;">${escapeHtml(
                payload.guestEmail
              )}</td>
            </tr>
            <tr>
              <td style="padding:8px 0; color:#6b7280;">Data</td>
              <td style="padding:8px 0; font-weight:600; text-align:right;">${escapeHtml(
                formatDateBR(payload.date)
              )}</td>
            </tr>
            <tr>
              <td style="padding:8px 0; color:#6b7280;">Horário</td>
              <td style="padding:8px 0; font-weight:600; text-align:right;">${escapeHtml(
                periodLabel(payload.period, payload.startTime, payload.endTime)
              )}</td>
            </tr>
            <tr>
              <td style="padding:8px 0; color:#6b7280;">Duração</td>
              <td style="padding:8px 0; font-weight:600; text-align:right;">${payload.durationHours}h</td>
            </tr>
            ${
              isRecurring
                ? `
              <tr>
                <td style="padding:8px 0; color:#6b7280;">Frequência</td>
                <td style="padding:8px 0; font-weight:600; text-align:right;">${escapeHtml(
                  recurrenceLabel(payload.recurrenceType)
                )}</td>
              </tr>
              <tr>
                <td style="padding:8px 0; color:#6b7280;">Compromisso</td>
                <td style="padding:8px 0; font-weight:600; text-align:right;">${payload.monthlyCommitmentMonths} meses</td>
              </tr>
              <tr>
                <td style="padding:8px 0; color:#6b7280;">Datas geradas</td>
                <td style="padding:8px 0; font-weight:600; text-align:right;">${payload.recurrenceCount}</td>
              </tr>
              <tr>
                <td style="padding:8px 0; color:#6b7280;">Valor mensal</td>
                <td style="padding:8px 0; font-weight:600; text-align:right;">${escapeHtml(
                  formatMoneyBRLFromCents(payload.monthlyTotalInCents)
                )}</td>
              </tr>
              ${
                payload.nextBillingDate
                  ? `
                <tr>
                  <td style="padding:8px 0; color:#6b7280;">Próxima cobrança</td>
                  <td style="padding:8px 0; font-weight:600; text-align:right;">${escapeHtml(
                    formatDateBR(payload.nextBillingDate)
                  )}</td>
                </tr>
              `
                  : ""
              }
            `
                : `
              <tr>
                <td style="padding:8px 0; color:#6b7280;">Valor</td>
                <td style="padding:8px 0; font-weight:600; text-align:right;">${escapeHtml(
                  formatMoneyBRLFromCents(payload.amountInCents)
                )}</td>
              </tr>
            `
            }
          </table>
        </div>

        ${
          isRecurring
            ? `<p style="font-size:14px; line-height:1.7; color:#374151; margin:0;">
                Datas geradas: ${escapeHtml(
                  payload.occurrenceDates.map((d) => formatDateBR(d)).join(", ")
                )}
              </p>`
            : ""
        }

        ${
          payload.siteUrl
            ? `<p style="font-size:14px; line-height:1.7; color:#374151; margin:16px 0 0;">
                Acesse o dashboard: <a href="${escapeHtml(
                  `${payload.siteUrl}/dashboard`
                )}" style="color:#111827; font-weight:600;">${escapeHtml(
                  `${payload.siteUrl}/dashboard`
                )}</a>
              </p>`
            : ""
        }
      </div>
    </div>
  `;

  return {
    subject,
    text,
    html,
    replyTo: payload.guestEmail || undefined,
  };
}

async function sendReservationEmails(payload: BookingEmailPayload) {
  const siteUrl = payload.siteUrl || process.env.NEXT_PUBLIC_SITE_URL || null;
  const ownerEmail = payload.ownerEmail?.trim() || null;
  const guestEmail = payload.guestEmail.trim();

  const clientContent = buildClientEmail({ ...payload, siteUrl });
  const ownerContent = buildOwnerEmail({ ...payload, siteUrl });

  const jobs: Promise<unknown>[] = [
    sendResendEmail({
      to: guestEmail,
      subject: clientContent.subject,
      html: clientContent.html,
      text: clientContent.text,
      replyTo: clientContent.replyTo,
      idempotencyKey: `liberoom-client-${payload.contractIdLabel || "one-time"}-${guestEmail}-${payload.date}-${payload.startTime || payload.period || "slot"}`,
    }),
  ];

  if (ownerEmail && ownerEmail.toLowerCase() !== guestEmail.toLowerCase()) {
    jobs.push(
      sendResendEmail({
        to: ownerEmail,
        subject: ownerContent.subject,
        html: ownerContent.html,
        text: ownerContent.text,
        replyTo: ownerContent.replyTo,
        idempotencyKey: `liberoom-owner-${payload.contractIdLabel || "one-time"}-${ownerEmail}-${payload.date}-${payload.startTime || payload.period || "slot"}`,
      })
    );
  }

  const results = await Promise.allSettled(jobs);

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(
        index === 0 ? "CLIENT EMAIL ERROR:" : "OWNER EMAIL ERROR:",
        result.reason
      );
    }
  });
}

export async function POST(req: Request) {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const webhookSecrets = buildWebhookSecrets();

    if (!stripeKey || !supabaseUrl || !supabaseKey || webhookSecrets.length === 0) {
      console.error("Missing env vars for webhook");
      return NextResponse.json({ error: "Missing env vars" }, { status: 500 });
    }

    const stripe = new Stripe(stripeKey);
    const supabase = createClient(supabaseUrl, supabaseKey);

    const rawBody = await req.text();
    const signature = req.headers.get("stripe-signature");

    if (!signature) {
      console.error("Missing stripe-signature header");
      return NextResponse.json({ error: "Missing stripe signature" }, { status: 400 });
    }

    let event: Stripe.Event;
    try {
      event = verifyEvent(stripe, rawBody, signature, webhookSecrets);
    } catch (err: any) {
      console.error("Webhook signature error:", err?.message || err);
      return NextResponse.json(
        { error: `Webhook Error: ${err?.message || "signature verification failed"}` },
        { status: 400 }
      );
    }

    if (event.type !== "checkout.session.completed") {
      return NextResponse.json({ received: true }, { status: 200 });
    }

    const session = event.data.object as Stripe.Checkout.Session;
    const metadata = session.metadata || {};

    const property_id = Number(metadata.property_id);
    const guest_name = String(metadata.guest_name || "").trim();
    const guest_email = String(metadata.guest_email || "").trim();
    const date = String(metadata.date || "");
    const period = metadata.period ? String(metadata.period) : null;
    const start_time = metadata.start_time ? String(metadata.start_time) : null;
    const end_time = metadata.end_time ? String(metadata.end_time) : null;
    const billing_mode = String(metadata.billing_mode || "one_time");
    const recurrence_type = String(metadata.recurrence_type || "none") as
      | "none"
      | "weekly"
      | "biweekly";
    const monthly_commitment_months = metadata.monthly_commitment_months
      ? Number(metadata.monthly_commitment_months)
      : 1;

    const stripeCustomerId = typeof session.customer === "string" ? session.customer : null;
    const paymentIntentId =
      typeof session.payment_intent === "string" ? session.payment_intent : null;

    if (!property_id || !guest_name || !guest_email || !date) {
      console.error("Missing metadata on checkout.session.completed", {
        sessionId: session.id,
        metadata,
      });
      return NextResponse.json({ error: "Missing metadata" }, { status: 400 });
    }

    if (monthly_commitment_months < 1 || monthly_commitment_months > 12) {
      return NextResponse.json(
        { error: "monthly_commitment_months must be between 1 and 12" },
        { status: 400 }
      );
    }

    const isTimeBooking = !!start_time && !!end_time;
    const candidateInterval = isTimeBooking
      ? {
          start: parseTimeToMinutes(start_time!),
          end: parseTimeToMinutes(end_time!),
        }
      : period
        ? periodToInterval(period)
        : null;

    if (!candidateInterval) {
      console.error("Invalid booking interval", { sessionId: session.id, metadata });
      return NextResponse.json({ error: "Invalid booking interval" }, { status: 400 });
    }

    if (paymentIntentId) {
      const { data: existingByPayment } = await supabase
        .from("bookings")
        .select("id")
        .eq("stripe_payment_intent", paymentIntentId)
        .maybeSingle();

      if (existingByPayment) {
        return NextResponse.json(
          { received: true, already_processed: true },
          { status: 200 }
        );
      }
    }

    const occurrenceDates = getRecurringDates(
      date,
      recurrence_type,
      monthly_commitment_months
    );

    const monthlyCycleDates =
      billing_mode === "weekly_monthly"
        ? getRecurringDates(date, recurrence_type, 1)
        : [date];

    const [
      { data: existingBookings, error: bookingsError },
      { data: existingBlocks, error: blocksError },
    ] = await Promise.all([
      supabase
        .from("bookings")
        .select("date, period, start_time, end_time, stripe_payment_intent")
        .eq("property_id", property_id)
        .in("date", occurrenceDates),
      supabase
        .from("blocked_slots")
        .select("date, period, start_time, end_time")
        .eq("property_id", property_id)
        .in("date", occurrenceDates),
    ]);

    if (bookingsError) {
      console.error("WEBHOOK BOOKINGS QUERY ERROR:", bookingsError);
      return NextResponse.json({ error: bookingsError.message }, { status: 500 });
    }

    if (blocksError) {
      console.error("WEBHOOK BLOCKS QUERY ERROR:", blocksError);
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
        if (paymentIntentId) {
          try {
            await stripe.refunds.create({
              payment_intent: paymentIntentId,
            });
          } catch (refundError) {
            console.error("REFUND ERROR:", refundError);
          }
        }

        return NextResponse.json(
          {
            received: true,
            refunded: true,
            reason: "Conflict detected",
            conflict_date: occurrenceDate,
          },
          { status: 200 }
        );
      }
    }

    const { data: propertyData, error: propertyError } = await supabase
      .from("properties")
      .select("price_per_hour, title, owner_email")
      .eq("id", property_id)
      .single();

    if (propertyError || !propertyData) {
      console.error("PROPERTY ERROR:", propertyError);
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    const pricePerHour = Number(propertyData.price_per_hour || 0);
    const baseDurationHours = getBaseDurationHours(period, start_time, end_time);
    const oneTimeAmountInCents = Math.max(1, Math.round(pricePerHour * baseDurationHours * 100));
    const monthlyTotal = Math.max(
      1,
      Math.round(pricePerHour * baseDurationHours * monthlyCycleDates.length * 100)
    );

    if (billing_mode === "weekly_monthly") {
      const nextBillingDate = addMonthsISO(date, 1);

      const { data: contract, error: contractError } = await supabase
        .from("recurring_contracts")
        .insert([
          {
            property_id,
            guest_name,
            guest_email,
            stripe_customer_id: stripeCustomerId,
            stripe_payment_intent: paymentIntentId,
            stripe_payment_method: null,
            billing_mode,
            recurrence_type,
            recurrence_interval: recurrence_type === "biweekly" ? 2 : 1,
            recurrence_count: occurrenceDates.length,
            monthly_commitment_months,
            weekday: null,
            date,
            period,
            start_time: isTimeBooking ? start_time : null,
            end_time: isTimeBooking ? end_time : null,
            duration_hours: baseDurationHours,
            price_per_hour: pricePerHour,
            monthly_total: monthlyTotal,
            next_billing_date: nextBillingDate,
            status: "active",
          },
        ])
        .select()
        .single();

      if (contractError || !contract) {
        console.error("CONTRACT INSERT ERROR:", contractError);

        if (paymentIntentId) {
          try {
            await stripe.refunds.create({
              payment_intent: paymentIntentId,
            });
          } catch (refundError) {
            console.error("REFUND ERROR:", refundError);
          }
        }

        return NextResponse.json(
          { error: contractError?.message || "Failed to create contract" },
          { status: 500 }
        );
      }

      const bookingsPayload = occurrenceDates.map((occurrenceDate) => ({
        contract_id: contract.id,
        property_id,
        guest_name,
        guest_email,
        date: occurrenceDate,
        period,
        start_time: isTimeBooking ? start_time : null,
        end_time: isTimeBooking ? end_time : null,
        duration_hours: baseDurationHours,
        recurrence_type,
        recurrence_interval: recurrence_type === "biweekly" ? 2 : 1,
        recurrence_count: occurrenceDates.length,
        stripe_payment_intent: paymentIntentId,
      }));

      const { error: bookingsInsertError } = await supabase
        .from("bookings")
        .insert(bookingsPayload);

      if (bookingsInsertError) {
        console.error("BOOKINGS INSERT ERROR:", bookingsInsertError);

        if (paymentIntentId) {
          try {
            await stripe.refunds.create({
              payment_intent: paymentIntentId,
            });
          } catch (refundError) {
            console.error("REFUND ERROR:", refundError);
          }
        }

        return NextResponse.json({ error: bookingsInsertError.message }, { status: 500 });
      }

      try {
        await sendReservationEmails({
          guestName: guest_name,
          guestEmail: guest_email,
          ownerEmail: String(propertyData.owner_email || "").trim() || null,
          propertyTitle: String(propertyData.title || "Reserva Liberoom"),
          date,
          period,
          startTime: isTimeBooking ? start_time : null,
          endTime: isTimeBooking ? end_time : null,
          billingMode,
          recurrenceType,
          monthlyCommitmentMonths,
          recurrenceCount: occurrenceDates.length,
          occurrenceDates,
          durationHours: baseDurationHours,
          amountInCents: monthlyTotal,
          monthlyTotalInCents: monthlyTotal,
          nextBillingDate,
          siteUrl: process.env.NEXT_PUBLIC_SITE_URL || null,
          bookingIdLabel: `contract-${contract.id}`,
          contractIdLabel: String(contract.id),
        });
      } catch (emailError) {
        console.error("EMAIL ERROR:", emailError);
      }

      return NextResponse.json({ received: true, contract: true }, { status: 200 });
    }

    const { error: bookingError } = await supabase.from("bookings").insert([
      {
        contract_id: null,
        property_id,
        guest_name,
        guest_email,
        date,
        period,
        start_time: isTimeBooking ? start_time : null,
        end_time: isTimeBooking ? end_time : null,
        duration_hours: baseDurationHours,
        recurrence_type: "none",
        recurrence_interval: 1,
        recurrence_count: 1,
        stripe_payment_intent: paymentIntentId,
      },
    ]);

    if (bookingError) {
      console.error("BOOKING INSERT ERROR:", bookingError);

      if (paymentIntentId) {
        try {
          await stripe.refunds.create({
            payment_intent: paymentIntentId,
          });
        } catch (refundError) {
          console.error("REFUND ERROR:", refundError);
        }
      }

      return NextResponse.json({ error: bookingError.message }, { status: 500 });
    }

    try {
      await sendReservationEmails({
        guestName: guest_name,
        guestEmail: guest_email,
        ownerEmail: String(propertyData.owner_email || "").trim() || null,
        propertyTitle: String(propertyData.title || "Reserva Liberoom"),
        date,
        period,
        startTime: isTimeBooking ? start_time : null,
        endTime: isTimeBooking ? end_time : null,
        billingMode,
        recurrenceType: "none",
        monthlyCommitmentMonths: 1,
        recurrenceCount: 1,
        occurrenceDates: [date],
        durationHours: baseDurationHours,
        amountInCents: oneTimeAmountInCents,
        monthlyTotalInCents: oneTimeAmountInCents,
        nextBillingDate: null,
        siteUrl: process.env.NEXT_PUBLIC_SITE_URL || null,
        bookingIdLabel: "one-time",
        contractIdLabel: null,
      });
    } catch (emailError) {
      console.error("EMAIL ERROR:", emailError);
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err: any) {
    console.error("WEBHOOK ERROR:", err);
    return NextResponse.json(
      { error: err?.message || "Internal error" },
      { status: 500 }
    );
  }
}