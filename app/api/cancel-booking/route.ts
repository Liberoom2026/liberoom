import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type BookingRow = {
  id: number;
  property_id: number;
  guest_name: string | null;
  guest_email: string | null;
  date: string;
  period: string | null;
  start_time: string | null;
  end_time: string | null;
  duration_hours: number | null;
};

type PropertyRow = {
  id: number;
  title: string | null;
  owner_email: string | null;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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

function buildClientCancelEmail(params: {
  guestName: string;
  propertyTitle: string;
  date: string;
  period: string | null;
  startTime: string | null;
  endTime: string | null;
  durationHours: number | null;
  siteUrl?: string | null;
}) {
  const timeLabel = periodLabel(params.period, params.startTime, params.endTime);

  const subject = "Reserva cancelada no Liberoom";

  const text = [
    `Olá, ${params.guestName}.`,
    "",
    "Sua reserva foi cancelada com sucesso.",
    "",
    `Espaço: ${params.propertyTitle}`,
    `Data: ${formatDateBR(params.date)}`,
    `Horário: ${timeLabel}`,
    params.durationHours ? `Duração: ${params.durationHours}h` : "",
    params.siteUrl ? `Dashboard: ${params.siteUrl}/dashboard` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; background:#f6f6f5; padding:24px; color:#111827;">
      <div style="max-width:640px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:20px; padding:32px;">
        <p style="font-size:12px; text-transform:uppercase; letter-spacing:.18em; color:#6b7280; margin:0 0 12px;">Liberoom</p>
        <h1 style="font-size:28px; line-height:1.2; margin:0 0 16px; color:#111827;">Reserva cancelada</h1>
        <p style="font-size:16px; line-height:1.7; color:#374151; margin:0 0 24px;">
          Olá, ${escapeHtml(params.guestName)}. Sua reserva foi cancelada com sucesso.
        </p>

        <div style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:16px; padding:20px; margin-bottom:24px;">
          <table style="width:100%; border-collapse:collapse; font-size:14px; color:#111827;">
            <tr>
              <td style="padding:8px 0; color:#6b7280;">Espaço</td>
              <td style="padding:8px 0; font-weight:600; text-align:right;">${escapeHtml(params.propertyTitle)}</td>
            </tr>
            <tr>
              <td style="padding:8px 0; color:#6b7280;">Data</td>
              <td style="padding:8px 0; font-weight:600; text-align:right;">${escapeHtml(formatDateBR(params.date))}</td>
            </tr>
            <tr>
              <td style="padding:8px 0; color:#6b7280;">Horário</td>
              <td style="padding:8px 0; font-weight:600; text-align:right;">${escapeHtml(timeLabel)}</td>
            </tr>
            ${
              params.durationHours
                ? `
              <tr>
                <td style="padding:8px 0; color:#6b7280;">Duração</td>
                <td style="padding:8px 0; font-weight:600; text-align:right;">${params.durationHours}h</td>
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

function buildOwnerCancelEmail(params: {
  guestName: string;
  guestEmail: string;
  propertyTitle: string;
  date: string;
  period: string | null;
  startTime: string | null;
  endTime: string | null;
  durationHours: number | null;
  siteUrl?: string | null;
}) {
  const timeLabel = periodLabel(params.period, params.startTime, params.endTime);

  const subject = `Reserva cancelada: ${params.propertyTitle}`;

  const text = [
    "Olá.",
    "",
    "Uma reserva foi cancelada no Liberoom.",
    "",
    `Espaço: ${params.propertyTitle}`,
    `Cliente: ${params.guestName} (${params.guestEmail})`,
    `Data: ${formatDateBR(params.date)}`,
    `Horário: ${timeLabel}`,
    params.durationHours ? `Duração: ${params.durationHours}h` : "",
    params.siteUrl ? `Dashboard: ${params.siteUrl}/dashboard` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; background:#f6f6f5; padding:24px; color:#111827;">
      <div style="max-width:640px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:20px; padding:32px;">
        <p style="font-size:12px; text-transform:uppercase; letter-spacing:.18em; color:#6b7280; margin:0 0 12px;">Liberoom</p>
        <h1 style="font-size:28px; line-height:1.2; margin:0 0 16px; color:#111827;">Reserva cancelada</h1>
        <p style="font-size:16px; line-height:1.7; color:#374151; margin:0 0 24px;">
          Uma reserva foi cancelada no sistema.
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
            <tr>
              <td style="padding:8px 0; color:#6b7280;">Data</td>
              <td style="padding:8px 0; font-weight:600; text-align:right;">${escapeHtml(formatDateBR(params.date))}</td>
            </tr>
            <tr>
              <td style="padding:8px 0; color:#6b7280;">Horário</td>
              <td style="padding:8px 0; font-weight:600; text-align:right;">${escapeHtml(timeLabel)}</td>
            </tr>
            ${
              params.durationHours
                ? `
              <tr>
                <td style="padding:8px 0; color:#6b7280;">Duração</td>
                <td style="padding:8px 0; font-weight:600; text-align:right;">${params.durationHours}h</td>
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

    if (!id) {
      return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
    }

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, property_id, guest_name, guest_email, date, period, start_time, end_time, duration_hours")
      .eq("id", id)
      .single<BookingRow>();

    if (bookingError || !booking) {
      return NextResponse.json(
        { error: bookingError?.message || "Reserva não encontrada" },
        { status: 404 }
      );
    }

    const { data: property, error: propertyError } = await supabase
      .from("properties")
      .select("id, title, owner_email")
      .eq("id", booking.property_id)
      .single<PropertyRow>();

    if (propertyError || !property) {
      return NextResponse.json(
        { error: propertyError?.message || "Propriedade não encontrada" },
        { status: 404 }
      );
    }

    const { error: deleteError } = await supabase.from("bookings").delete().eq("id", id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || null;
    const guestName = booking.guest_name?.trim() || "Cliente";
    const guestEmail = booking.guest_email?.trim() || "";
    const ownerEmail = property.owner_email?.trim() || "";
    const propertyTitle = property.title?.trim() || "Reserva Liberoom";

    try {
      if (guestEmail) {
        const clientEmail = buildClientCancelEmail({
          guestName,
          propertyTitle,
          date: booking.date,
          period: booking.period,
          startTime: booking.start_time,
          endTime: booking.end_time,
          durationHours: booking.duration_hours,
          siteUrl,
        });

        await sendResendEmail({
          to: guestEmail,
          subject: clientEmail.subject,
          html: clientEmail.html,
          text: clientEmail.text,
          idempotencyKey: `cancel-booking-client-${id}-${guestEmail}`,
        });
      }

      if (ownerEmail && ownerEmail.toLowerCase() !== guestEmail.toLowerCase()) {
        const ownerEmailContent = buildOwnerCancelEmail({
          guestName,
          guestEmail,
          propertyTitle,
          date: booking.date,
          period: booking.period,
          startTime: booking.start_time,
          endTime: booking.end_time,
          durationHours: booking.duration_hours,
          siteUrl,
        });

        await sendResendEmail({
          to: ownerEmail,
          subject: ownerEmailContent.subject,
          html: ownerEmailContent.html,
          text: ownerEmailContent.text,
          idempotencyKey: `cancel-booking-owner-${id}-${ownerEmail}`,
        });
      }
    } catch (emailError) {
      console.error("CANCEL BOOKING EMAIL ERROR:", emailError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("CANCEL BOOKING ERROR:", error);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}