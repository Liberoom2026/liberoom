import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type RecurringContractRow = {
  id: number;
  property_id: number;
  guest_name: string | null;
  guest_email: string | null;
  billing_mode: string | null;
  recurrence_type: string | null;
  recurrence_interval: number | null;
  recurrence_count: number | null;
  monthly_commitment_months: number | null;
  weekday: string | null;
  date: string | null;
  period: string | null;
  start_time: string | null;
  end_time: string | null;
  duration_hours: number | null;
  price_per_hour: number | null;
  monthly_total: number | null;
  next_billing_date: string | null;
  last_billed_at: string | null;
  canceled_at: string | null;
  cancellation_fee_paid: boolean | null;
  status: string | null;
  stripe_customer_id: string | null;
  stripe_payment_intent: string | null;
  stripe_payment_method: string | null;
};

type PropertyRow = {
  id: number;
  title: string | null;
  owner_email: string | null;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

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

function recurrenceLabel(recurrenceType: string | null, interval: number | null) {
  if (recurrenceType === "biweekly") return interval ? `Quinzenal · a cada ${interval}x` : "Quinzenal";
  if (recurrenceType === "weekly") return interval ? `Semanal · a cada ${interval}x` : "Semanal";
  return recurrenceType || "Recorrência";
}

function formatMoneyBRL(value?: number | null) {
  if (value == null) return "-";

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

async function sendResendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
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

function buildClientCancelRecurringEmail(params: {
  guestName: string;
  propertyTitle: string;
  date: string | null;
  period: string | null;
  startTime: string | null;
  endTime: string | null;
  billingMode: string | null;
  recurrenceType: string | null;
  recurrenceInterval: number | null;
  monthlyCommitmentMonths: number | null;
  monthlyTotal: number | null;
  nextBillingDate: string | null;
  siteUrl?: string | null;
}) {
  const subject = "Recorrência cancelada no Liberoom";
  const timeLabel = periodLabel(params.period, params.startTime, params.endTime);

  const text = [
    `Olá, ${params.guestName}.`,
    "",
    "Sua recorrência foi cancelada com sucesso.",
    "",
    `Espaço: ${params.propertyTitle}`,
    params.date ? `Data inicial: ${formatDateBR(params.date)}` : "",
    `Horário: ${timeLabel}`,
    params.recurrenceType
      ? `Frequência: ${recurrenceLabel(params.recurrenceType, params.recurrenceInterval)}`
      : "",
    params.monthlyCommitmentMonths ? `Compromisso: ${params.monthlyCommitmentMonths} meses` : "",
    params.monthlyTotal ? `Valor mensal: ${formatMoneyBRL(params.monthlyTotal)}` : "",
    params.nextBillingDate ? `Próxima cobrança: ${formatDateBR(params.nextBillingDate)}` : "",
    params.siteUrl ? `Dashboard: ${params.siteUrl}/dashboard` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; background:#f6f6f5; padding:24px; color:#111827;">
      <div style="max-width:640px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:20px; padding:32px;">
        <p style="font-size:12px; text-transform:uppercase; letter-spacing:.18em; color:#6b7280; margin:0 0 12px;">Liberoom</p>
        <h1 style="font-size:28px; line-height:1.2; margin:0 0 16px; color:#111827;">Recorrência cancelada</h1>
        <p style="font-size:16px; line-height:1.7; color:#374151; margin:0 0 24px;">
          Olá, ${escapeHtml(params.guestName)}. Sua recorrência foi cancelada com sucesso.
        </p>

        <div style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:16px; padding:20px; margin-bottom:24px;">
          <table style="width:100%; border-collapse:collapse; font-size:14px; color:#111827;">
            <tr>
              <td style="padding:8px 0; color:#6b7280;">Espaço</td>
              <td style="padding:8px 0; font-weight:600; text-align:right;">${escapeHtml(params.propertyTitle)}</td>
            </tr>
            ${
              params.date
                ? `
              <tr>
                <td style="padding:8px 0; color:#6b7280;">Data inicial</td>
                <td style="padding:8px 0; font-weight:600; text-align:right;">${escapeHtml(formatDateBR(params.date))}</td>
              </tr>
            `
                : ""
            }
            <tr>
              <td style="padding:8px 0; color:#6b7280;">Horário</td>
              <td style="padding:8px 0; font-weight:600; text-align:right;">${escapeHtml(timeLabel)}</td>
            </tr>
            ${
              params.recurrenceType
                ? `
              <tr>
                <td style="padding:8px 0; color:#6b7280;">Frequência</td>
                <td style="padding:8px 0; font-weight:600; text-align:right;">${escapeHtml(
                  recurrenceLabel(params.recurrenceType, params.recurrenceInterval)
                )}</td>
              </tr>
            `
                : ""
            }
            ${
              params.monthlyCommitmentMonths
                ? `
              <tr>
                <td style="padding:8px 0; color:#6b7280;">Compromisso</td>
                <td style="padding:8px 0; font-weight:600; text-align:right;">${params.monthlyCommitmentMonths} meses</td>
              </tr>
            `
                : ""
            }
            ${
              params.monthlyTotal
                ? `
              <tr>
                <td style="padding:8px 0; color:#6b7280;">Valor mensal</td>
                <td style="padding:8px 0; font-weight:600; text-align:right;">${escapeHtml(
                  formatMoneyBRL(params.monthlyTotal)
                )}</td>
              </tr>
            `
                : ""
            }
            ${
              params.nextBillingDate
                ? `
              <tr>
                <td style="padding:8px 0; color:#6b7280;">Próxima cobrança</td>
                <td style="padding:8px 0; font-weight:600; text-align:right;">${escapeHtml(
                  formatDateBR(params.nextBillingDate)
                )}</td>
              </tr>
            `
                : ""
            }
          </table>
        </div>

        ${
          params.siteUrl
            ? `<p style="font-size:14px; line-height:1.7; color:#374151; margin:0;">
                Acesse seu dashboard: <a href="${escapeHtml(
                  `${params.siteUrl}/dashboard`
                )}" style="color:#111827; font-weight:600;">${escapeHtml(
                  `${params.siteUrl}/dashboard`
                )}</a>
              </p>`
            : ""
        }
      </div>
    </div>
  `;

  return { subject, text, html };
}

function buildOwnerCancelRecurringEmail(params: {
  guestName: string;
  guestEmail: string;
  propertyTitle: string;
  date: string | null;
  period: string | null;
  startTime: string | null;
  endTime: string | null;
  billingMode: string | null;
  recurrenceType: string | null;
  recurrenceInterval: number | null;
  monthlyCommitmentMonths: number | null;
  monthlyTotal: number | null;
  nextBillingDate: string | null;
  siteUrl?: string | null;
}) {
  const subject = `Recorrência cancelada: ${params.propertyTitle}`;
  const timeLabel = periodLabel(params.period, params.startTime, params.endTime);

  const text = [
    "Olá.",
    "",
    "Uma recorrência foi cancelada no Liberoom.",
    "",
    `Espaço: ${params.propertyTitle}`,
    `Cliente: ${params.guestName} (${params.guestEmail})`,
    params.date ? `Data inicial: ${formatDateBR(params.date)}` : "",
    `Horário: ${timeLabel}`,
    params.recurrenceType
      ? `Frequência: ${recurrenceLabel(params.recurrenceType, params.recurrenceInterval)}`
      : "",
    params.monthlyCommitmentMonths ? `Compromisso: ${params.monthlyCommitmentMonths} meses` : "",
    params.monthlyTotal ? `Valor mensal: ${formatMoneyBRL(params.monthlyTotal)}` : "",
    params.nextBillingDate ? `Próxima cobrança: ${formatDateBR(params.nextBillingDate)}` : "",
    params.siteUrl ? `Dashboard: ${params.siteUrl}/dashboard` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; background:#f6f6f5; padding:24px; color:#111827;">
      <div style="max-width:640px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:20px; padding:32px;">
        <p style="font-size:12px; text-transform:uppercase; letter-spacing:.18em; color:#6b7280; margin:0 0 12px;">Liberoom</p>
        <h1 style="font-size:28px; line-height:1.2; margin:0 0 16px; color:#111827;">Recorrência cancelada</h1>
        <p style="font-size:16px; line-height:1.7; color:#374151; margin:0 0 24px;">
          Uma recorrência foi cancelada no sistema.
        </p>

        <div style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:16px; padding:20px; margin-bottom:24px;">
          <table style="width:100%; border-collapse:collapse; font-size:14px; color:#111827;">
            <tr>
              <td style="padding:8px 0; color:#6b7280;">Espaço</td>
              <td style="padding:8px 0; font-weight:600; text-align:right;">${escapeHtml(params.propertyTitle)}</td>
            </tr>
            <tr>
              <td style="padding:8px 0; color:#6b7280;">Cliente</td>
              <td style="padding:8px 0; font-weight:600; text-align:right;">${escapeHtml(params.guestName)}</td>
            </tr>
            <tr>
              <td style="padding:8px 0; color:#6b7280;">E-mail do cliente</td>
              <td style="padding:8px 0; font-weight:600; text-align:right;">${escapeHtml(params.guestEmail)}</td>
            </tr>
            ${
              params.date
                ? `
              <tr>
                <td style="padding:8px 0; color:#6b7280;">Data inicial</td>
                <td style="padding:8px 0; font-weight:600; text-align:right;">${escapeHtml(formatDateBR(params.date))}</td>
              </tr>
            `
                : ""
            }
            <tr>
              <td style="padding:8px 0; color:#6b7280;">Horário</td>
              <td style="padding:8px 0; font-weight:600; text-align:right;">${escapeHtml(timeLabel)}</td>
            </tr>
            ${
              params.recurrenceType
                ? `
              <tr>
                <td style="padding:8px 0; color:#6b7280;">Frequência</td>
                <td style="padding:8px 0; font-weight:600; text-align:right;">${escapeHtml(
                  recurrenceLabel(params.recurrenceType, params.recurrenceInterval)
                )}</td>
              </tr>
            `
                : ""
            }
            ${
              params.monthlyCommitmentMonths
                ? `
              <tr>
                <td style="padding:8px 0; color:#6b7280;">Compromisso</td>
                <td style="padding:8px 0; font-weight:600; text-align:right;">${params.monthlyCommitmentMonths} meses</td>
              </tr>
            `
                : ""
            }
            ${
              params.monthlyTotal
                ? `
              <tr>
                <td style="padding:8px 0; color:#6b7280;">Valor mensal</td>
                <td style="padding:8px 0; font-weight:600; text-align:right;">${escapeHtml(
                  formatMoneyBRL(params.monthlyTotal)
                )}</td>
              </tr>
            `
                : ""
            }
            ${
              params.nextBillingDate
                ? `
              <tr>
                <td style="padding:8px 0; color:#6b7280;">Próxima cobrança</td>
                <td style="padding:8px 0; font-weight:600; text-align:right;">${escapeHtml(
                  formatDateBR(params.nextBillingDate)
                )}</td>
              </tr>
            `
                : ""
            }
          </table>
        </div>

        ${
          params.siteUrl
            ? `<p style="font-size:14px; line-height:1.7; color:#374151; margin:0;">
                Acesse o dashboard: <a href="${escapeHtml(
                  `${params.siteUrl}/dashboard`
                )}" style="color:#111827; font-weight:600;">${escapeHtml(
                  `${params.siteUrl}/dashboard`
                )}</a>
              </p>`
            : ""
        }
      </div>
    </div>
  `;

  return { subject, text, html };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const id = Number(body.id);
    const email = String(body.email || "").trim();

    if (!id || !email) {
      return NextResponse.json(
        { error: "id and email are required" },
        { status: 400 }
      );
    }

    const { data: contract, error: fetchError } = await supabase
      .from("recurring_contracts")
      .select("*")
      .eq("id", id)
      .eq("guest_email", email)
      .single<RecurringContractRow>();

    if (fetchError || !contract) {
      return NextResponse.json(
        { error: "Recurring contract not found" },
        { status: 404 }
      );
    }

    if (contract.canceled_at || contract.status === "canceled") {
      return NextResponse.json(
        { error: "Recurring contract already canceled" },
        { status: 400 }
      );
    }

    const { data: property, error: propertyError } = await supabase
      .from("properties")
      .select("id, title, owner_email")
      .eq("id", contract.property_id)
      .single<PropertyRow>();

    if (propertyError || !property) {
      return NextResponse.json(
        { error: propertyError?.message || "Property not found" },
        { status: 404 }
      );
    }

    const canceledAt = new Date().toISOString();

    const { data, error } = await supabase
      .from("recurring_contracts")
      .update({
        canceled_at: canceledAt,
        status: "canceled",
      })
      .eq("id", id)
      .eq("guest_email", email)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || null;
    const guestName = contract.guest_name?.trim() || "Cliente";
    const guestEmail = contract.guest_email?.trim() || "";
    const ownerEmail = property.owner_email?.trim() || "";
    const propertyTitle = property.title?.trim() || "Reserva Liberoom";

    try {
      if (guestEmail) {
        const clientEmail = buildClientCancelRecurringEmail({
          guestName,
          propertyTitle,
          date: contract.date,
          period: contract.period,
          startTime: contract.start_time,
          endTime: contract.end_time,
          billingMode: contract.billing_mode,
          recurrenceType: contract.recurrence_type,
          recurrenceInterval: contract.recurrence_interval,
          monthlyCommitmentMonths: contract.monthly_commitment_months,
          monthlyTotal: contract.monthly_total,
          nextBillingDate: contract.next_billing_date,
          siteUrl,
        });

        await sendResendEmail({
          to: guestEmail,
          subject: clientEmail.subject,
          html: clientEmail.html,
          text: clientEmail.text,
          idempotencyKey: `cancel-recurring-client-${id}-${guestEmail}`,
        });
      }

      if (ownerEmail && ownerEmail.toLowerCase() !== guestEmail.toLowerCase()) {
        const ownerEmailContent = buildOwnerCancelRecurringEmail({
          guestName,
          guestEmail,
          propertyTitle,
          date: contract.date,
          period: contract.period,
          startTime: contract.start_time,
          endTime: contract.end_time,
          billingMode: contract.billing_mode,
          recurrenceType: contract.recurrence_type,
          recurrenceInterval: contract.recurrence_interval,
          monthlyCommitmentMonths: contract.monthly_commitment_months,
          monthlyTotal: contract.monthly_total,
          nextBillingDate: contract.next_billing_date,
          siteUrl,
        });

        await sendResendEmail({
          to: ownerEmail,
          subject: ownerEmailContent.subject,
          html: ownerEmailContent.html,
          text: ownerEmailContent.text,
          idempotencyKey: `cancel-recurring-owner-${id}-${ownerEmail}`,
        });
      }
    } catch (emailError) {
      console.error("CANCEL RECURRING EMAIL ERROR:", emailError);
    }

    return NextResponse.json({
      ok: true,
      contract: data,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Internal error" },
      { status: 500 }
    );
  }
}