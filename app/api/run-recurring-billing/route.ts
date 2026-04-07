import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET || '';
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || '';
const resendApiKey = process.env.RESEND_API_KEY || '';
const emailFrom = process.env.EMAIL_FROM || process.env.RESEND_FROM_EMAIL || process.env.FROM_EMAIL || '';
const cronSecret = process.env.RECURRING_BILLING_CRON_SECRET || process.env.CRON_SECRET || '';
const ownerFallbackEmail = process.env.BILLING_OWNER_FALLBACK_EMAIL || '';

type RecurringContract = {
  id: string;
  property_id: string | null;
  guest_name: string | null;
  guest_email: string | null;
  stripe_customer_id: string | null;
  stripe_payment_method: string | null;
  billing_mode: string | null;
  recurrence_type: string | null;
  recurrence_interval: number | null;
  recurrence_count: number | null;
  monthly_commitment_months: number | null;
  date: string | null;
  start_time: string | null;
  end_time: string | null;
  duration_hours: number | null;
  price_per_hour: number | string | null;
  monthly_total: number | string | null;
  next_billing_date: string | null;
  last_billed_at: string | null;
  canceled_at: string | null;
  status: string | null;
  billing_retry_count: number | null;
  billing_retry_next_attempt_at: string | null;
  billing_retry_cycle_start_at: string | null;
  billing_retry_last_error: string | null;
};

type BillingResult = {
  contractId: string;
  guestEmail: string | null;
  status: 'success' | 'retry_scheduled' | 'suspended' | 'failed';
  message: string;
};

const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;
const resend = resendApiKey ? new Resend(resendApiKey) : null;

function supabaseAdmin(): SupabaseClient {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Supabase credentials are missing.');
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function jsonOk(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

function utcTodayDateString(now = new Date()): string {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function utcNowIso(now = new Date()): string {
  return new Date(now).toISOString();
}

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(isoDate);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function addMonthsIso(isoDate: string, months: number): string {
  const d = new Date(isoDate);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);

  if (d.getUTCDate() < day) {
    d.setUTCDate(0);
  }

  return d.toISOString();
}

function normalizeAmountToCents(rawAmount: number | string | null | undefined): number {
  if (rawAmount === null || rawAmount === undefined) {
    throw new Error('monthly_total is missing');
  }

  const numeric = typeof rawAmount === 'number' ? rawAmount : Number(String(rawAmount).replace(',', '.'));
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error(`Invalid monthly_total: ${rawAmount}`);
  }

  return Math.round(numeric * 100);
}

function getRequestSecret(req: NextRequest): string | null {
  const authorization = req.headers.get('authorization');
  if (authorization?.startsWith('Bearer ')) {
    const token = authorization.slice('Bearer '.length).trim();
    if (token) return token;
  }

  const headerSecret = req.headers.get('x-cron-secret');
  if (headerSecret) return headerSecret.trim();

  const querySecret = req.nextUrl.searchParams.get('secret');
  if (querySecret) return querySecret.trim();

  return null;
}

function stripeErrorInfo(error: unknown): {
  retryable: boolean;
  message: string;
  code: string | null;
  declineCode: string | null;
} {
  if (error instanceof Stripe.errors.StripeError) {
    const code = typeof error.code === 'string' ? error.code : null;
    const declineCode = typeof error.decline_code === 'string' ? error.decline_code : null;
    const message = error.message || 'Stripe error';

    const hardStopCodes = new Set([
      'authentication_required',
      'card_declined',
      'expired_card',
      'incorrect_cvc',
      'incorrect_number',
      'invalid_cvc',
      'invalid_expiry_month',
      'invalid_expiry_year',
      'lost_card',
      'pickup_card',
      'stolen_card',
      'transaction_not_allowed',
      'do_not_honor',
    ]);

    const retryableCodes = new Set([
      'api_connection_error',
      'rate_limit',
      'processing_error',
      'api_error',
      'service_unavailable',
      'timeout',
    ]);

    if (code && hardStopCodes.has(code)) {
      return {
        retryable: false,
        message,
        code,
        declineCode,
      };
    }

    if (code && retryableCodes.has(code)) {
      return {
        retryable: true,
        message,
        code,
        declineCode,
      };
    }

    if (typeof error.raw === 'object' && error.raw && 'decline_code' in error.raw) {
      return {
        retryable: false,
        message,
        code,
        declineCode: declineCode || null,
      };
    }

    return {
      retryable: false,
      message,
      code,
      declineCode,
    };
  }

  if (error instanceof Error) {
    return {
      retryable: true,
      message: error.message,
      code: null,
      declineCode: null,
    };
  }

  return {
    retryable: true,
    message: 'Unknown billing error',
    code: null,
    declineCode: null,
  };
}

async function sendEmail(
  to: string | null,
  subject: string,
  html: string,
  fallbackToOwner = false,
): Promise<void> {
  if (!resend || !emailFrom) return;

  const recipients = [to, fallbackToOwner ? ownerFallbackEmail : null].filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  );

  if (recipients.length === 0) return;

  await resend.emails.send({
    from: emailFrom,
    to: recipients,
    subject,
    html,
  });
}

async function notifyFailure(
  contract: RecurringContract,
  reason: string,
  retryCount: number,
  status: 'payment_failed' | 'suspended',
): Promise<void> {
  const safeName = contract.guest_name?.trim() || 'cliente';
  const safeReason = reason.trim();

  const clientHtml = `
    <p>Olá, ${safeName}.</p>
    <p>Houve uma falha na cobrança recorrente do seu contrato.</p>
    <p><strong>Motivo:</strong> ${escapeHtml(safeReason)}</p>
    <p><strong>Tentativa atual:</strong> ${retryCount}/3</p>
    <p>${status === 'suspended' ? 'Seu contrato foi suspenso temporariamente.' : 'Tentaremos novamente automaticamente em 1 dia.'}</p>
    <p>Por favor, atualize seu pagamento o quanto antes.</p>
  `;

  const ownerHtml = `
    <p>Olá.</p>
    <p>Uma cobrança recorrente falhou para o contrato de <strong>${escapeHtml(safeName)}</strong>.</p>
    <p><strong>Status:</strong> ${status === 'suspended' ? 'suspenso' : 'com retry agendado'}</p>
    <p><strong>Motivo:</strong> ${escapeHtml(safeReason)}</p>
    <p><strong>Tentativa atual:</strong> ${retryCount}/3</p>
  `;

  await sendEmail(contract.guest_email, 'Falha na cobrança', clientHtml, false);
  if (ownerFallbackEmail) {
    await sendEmail(ownerFallbackEmail, 'Pagamento falhou', ownerHtml, false);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function processSingleContract(
  supabase: SupabaseClient,
  contract: RecurringContract,
  mode: 'due' | 'retry',
): Promise<BillingResult> {
  if (!stripe) {
    throw new Error('Stripe is not configured.');
  }

  if (!contract.stripe_customer_id) {
    return {
      contractId: contract.id,
      guestEmail: contract.guest_email,
      status: 'failed',
      message: 'Missing stripe_customer_id',
    };
  }

  if (!contract.stripe_payment_method) {
    return {
      contractId: contract.id,
      guestEmail: contract.guest_email,
      status: 'failed',
      message: 'Missing stripe_payment_method',
    };
  }

  const amount = normalizeAmountToCents(contract.monthly_total);

  try {
    await stripe.paymentIntents.create({
      amount,
      currency: 'brl',
      customer: contract.stripe_customer_id,
      payment_method: contract.stripe_payment_method,
      off_session: true,
      confirm: true,
      metadata: {
        recurring_contract_id: contract.id,
        billing_mode: String(contract.billing_mode || ''),
        billing_reason: mode,
      },
    });

    const nextBillingBase = contract.next_billing_date || utcNowIso();
    const nextBillingDate = addMonthsIso(nextBillingBase, 1);

    const { error: updateError } = await supabase
      .from('recurring_contracts')
      .update({
        last_billed_at: utcNowIso(),
        next_billing_date: nextBillingDate,
        status: 'active',
        billing_retry_count: 0,
        billing_retry_next_attempt_at: null,
        billing_retry_cycle_start_at: null,
        billing_retry_last_error: null,
      })
      .eq('id', contract.id);

    if (updateError) {
      throw updateError;
    }

    const safeName = contract.guest_name?.trim() || 'cliente';
    const successHtml = `
      <p>Olá, ${escapeHtml(safeName)}.</p>
      <p>Sua cobrança recorrente foi aprovada com sucesso.</p>
      <p>Próxima cobrança em: <strong>${escapeHtml(nextBillingDate.slice(0, 10))}</strong></p>
    `;

    await sendEmail(contract.guest_email, 'Cobrança aprovada', successHtml, false);

    if (ownerFallbackEmail) {
      await sendEmail(
        ownerFallbackEmail,
        'Cobrança recorrente aprovada',
        `<p>A cobrança recorrente do contrato de <strong>${escapeHtml(safeName)}</strong> foi aprovada.</p>`,
        false,
      );
    }

    return {
      contractId: contract.id,
      guestEmail: contract.guest_email,
      status: 'success',
      message: 'Payment succeeded',
    };
  } catch (error) {
    const info = stripeErrorInfo(error);
    const currentRetryCount = Number(contract.billing_retry_count || 0);
    const nextRetryCount = currentRetryCount + 1;

    const hardStop = !info.retryable || nextRetryCount >= 3;
    const nextAttemptAt = hardStop ? null : addDaysIso(utcNowIso(), 1);

    const { error: updateError } = await supabase
      .from('recurring_contracts')
      .update({
        status: hardStop ? 'suspended' : 'payment_failed',
        billing_retry_count: nextRetryCount,
        billing_retry_next_attempt_at: nextAttemptAt,
        billing_retry_cycle_start_at: contract.billing_retry_cycle_start_at || utcNowIso(),
        billing_retry_last_error: info.message,
      })
      .eq('id', contract.id);

    if (updateError) {
      throw updateError;
    }

    await notifyFailure(
      contract,
      info.message,
      nextRetryCount,
      hardStop ? 'suspended' : 'payment_failed',
    );

    return {
      contractId: contract.id,
      guestEmail: contract.guest_email,
      status: hardStop ? 'suspended' : 'retry_scheduled',
      message: info.message,
    };
  }
}

async function runRecurringBilling(req: NextRequest) {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return jsonOk({ ok: false, error: 'Supabase is not configured.' }, 500);
  }

  if (!stripeSecretKey) {
    return jsonOk({ ok: false, error: 'Stripe is not configured.' }, 500);
  }

  if (cronSecret) {
    const requestSecret = getRequestSecret(req);
    if (requestSecret !== cronSecret) {
      return jsonOk({ ok: false, error: 'Unauthorized.' }, 401);
    }
  }

  const supabase = supabaseAdmin();
  const nowIso = utcNowIso();
  const today = utcTodayDateString();

  const results: BillingResult[] = [];

  const { data: dueActiveContracts, error: activeError } = await supabase
    .from('recurring_contracts')
    .select('*')
    .eq('status', 'active')
    .lte('next_billing_date', today)
    .is('canceled_at', null);

  if (activeError) {
    throw activeError;
  }

  const { data: retryContracts, error: retryError } = await supabase
    .from('recurring_contracts')
    .select('*')
    .eq('status', 'payment_failed')
    .lte('billing_retry_next_attempt_at', nowIso)
    .is('canceled_at', null);

  if (retryError) {
    throw retryError;
  }

  const contracts = [
    ...((dueActiveContracts || []) as RecurringContract[]).map((contract) => ({
      contract,
      mode: 'due' as const,
    })),
    ...((retryContracts || []) as RecurringContract[]).map((contract) => ({
      contract,
      mode: 'retry' as const,
    })),
  ];

  for (const item of contracts) {
    try {
      const result = await processSingleContract(supabase, item.contract, item.mode);
      results.push(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[run-recurring-billing] contract ${item.contract.id} failed:`, error);

      results.push({
        contractId: item.contract.id,
        guestEmail: item.contract.guest_email,
        status: 'failed',
        message,
      });
    }
  }

  return jsonOk({
    ok: true,
    processed: contracts.length,
    success: results.filter((r) => r.status === 'success').length,
    retry_scheduled: results.filter((r) => r.status === 'retry_scheduled').length,
    suspended: results.filter((r) => r.status === 'suspended').length,
    failed: results.filter((r) => r.status === 'failed').length,
    results,
  });
}

export async function GET(req: NextRequest) {
  try {
    return await runRecurringBilling(req);
  } catch (error) {
    console.error('[run-recurring-billing][GET]', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonOk({ ok: false, error: message }, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    return await runRecurringBilling(req);
  } catch (error) {
    console.error('[run-recurring-billing][POST]', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonOk({ ok: false, error: message }, 500);
  }
}