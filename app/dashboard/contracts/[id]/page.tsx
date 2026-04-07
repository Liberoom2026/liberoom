"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Booking = {
  id: number;
  date: string;
  period?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  duration_hours?: number | null;
  property_id?: number | null;
  property_title?: string | null;
  guest_name?: string | null;
  guest_email?: string | null;
  contract_id?: number | null;
  recurrence_type?: string | null;
  recurrence_interval?: number | null;
  recurrence_count?: number | null;
  billing_mode?: string | null;
  status?: string | null;
  stripe_payment_intent?: string | null;
};

type RecurringContract = {
  id: number;
  property_id?: number | null;
  guest_name?: string | null;
  guest_email?: string | null;
  stripe_customer_id?: string | null;
  stripe_payment_intent?: string | null;
  stripe_payment_method?: string | null;
  billing_mode?: string | null;
  recurrence_type?: string | null;
  recurrence_interval?: number | null;
  recurrence_count?: number | null;
  monthly_commitment_months?: number | null;
  weekday?: string | null;
  date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  duration_hours?: number | null;
  price_per_hour?: number | null;
  monthly_total?: number | null;
  next_billing_date?: string | null;
  last_billed_at?: string | null;
  canceled_at?: string | null;
  cancellation_fee_paid?: boolean | null;
  status?: string | null;
  property_title?: string | null;
};

type ApiResponse =
  | Booking[]
  | {
      bookings?: Booking[];
      recurring_contracts?: RecurringContract[];
      error?: string;
    }
  | null;

const email = "gustavoaudi29@gmail.com";

function parseDateOnly(dateStr: string) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(dateStr?: string | null) {
  if (!dateStr) return "-";

  const date = parseDateOnly(dateStr);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatCurrency(value?: number | null) {
  if (value == null) return "-";

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function isActiveContract(c: RecurringContract) {
  return !c.canceled_at && c.status !== "canceled";
}

export default function ContractDetailsPage({
  params,
}: {
  params: { id: string };
}) {
  const contractId = Number(params.id);

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [contracts, setContracts] = useState<RecurringContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);

  async function load() {
    try {
      setError(null);
      setRefreshing(true);

      const res = await fetch(`/api/my-bookings?email=${encodeURIComponent(email)}`, {
        cache: "no-store",
      });

      const data: ApiResponse = await res.json();

      if (Array.isArray(data)) {
        setBookings(data);
        setContracts([]);
      } else if (data && Array.isArray(data.bookings)) {
        setBookings(data.bookings);
        setContracts(Array.isArray(data.recurring_contracts) ? data.recurring_contracts : []);
      } else {
        setBookings([]);
        setContracts([]);
        if (data && typeof data === "object" && "error" in data && data.error) {
          setError(data.error);
        }
      }
    } catch (err: any) {
      setError(err?.message || "Falha ao carregar o contrato.");
      setBookings([]);
      setContracts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const contract = useMemo(
    () => contracts.find((item) => item.id === contractId) || null,
    [contracts, contractId]
  );

  const relatedBookings = useMemo(
    () => bookings.filter((b) => b.contract_id === contractId),
    [bookings, contractId]
  );

  const upcomingRelatedBookings = useMemo(
    () =>
      relatedBookings.filter((b) => {
        const [year, month, day] = b.date.split("-").map(Number);
        const current = new Date();
        current.setHours(0, 0, 0, 0);
        const bookingDate = new Date(year, month - 1, day);
        return bookingDate >= current;
      }),
    [relatedBookings]
  );

  async function cancelRecurringContract() {
    const confirmCancel = window.confirm(
      "Tem certeza que deseja cancelar esta recorrência?"
    );
    if (!confirmCancel) return;

    try {
      setCanceling(true);

      const res = await fetch("/api/cancel-recurring-contract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: contractId, email }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Não foi possível cancelar a recorrência.");
      }

      await load();
    } catch (err: any) {
      setError(err?.message || "Falha ao cancelar a recorrência.");
    } finally {
      setCanceling(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-neutral-50 px-4 py-10 text-neutral-900 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-4xl rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm">
          <div className="animate-pulse space-y-4">
            <div className="h-4 w-32 rounded bg-neutral-200" />
            <div className="h-8 w-2/3 rounded bg-neutral-200" />
            <div className="h-5 w-1/2 rounded bg-neutral-200" />
            <div className="h-32 rounded-2xl bg-neutral-100" />
          </div>
        </div>
      </main>
    );
  }

  if (!contract) {
    return (
      <main className="min-h-screen bg-neutral-50 px-4 py-10 text-neutral-900 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-2xl flex-col items-center rounded-3xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-neutral-100 text-2xl">
            ?
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Contrato não encontrado</h1>
          <p className="mt-3 text-base leading-7 text-neutral-600">
            Não localizamos um contrato recorrente com esse identificador.
          </p>

          {error ? (
            <div className="mt-6 w-full rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-left text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
            >
              Voltar ao dashboard
            </Link>
            <button
              onClick={load}
              className="inline-flex items-center justify-center rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      </main>
    );
  }

  const active = isActiveContract(contract);

  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-10 text-neutral-900 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <Link
                href="/dashboard"
                className="text-sm font-medium text-neutral-500 transition hover:text-neutral-900"
              >
                ← Voltar ao dashboard
              </Link>

              <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
                {contract.property_title || `Contrato #${contract.id}`}
              </h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-neutral-600">
                Aqui estão os detalhes da recorrência, o status atual e os lançamentos ligados a
                esse contrato.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                onClick={load}
                className="inline-flex items-center justify-center rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-70"
                disabled={refreshing}
              >
                {refreshing ? "Atualizando..." : "Atualizar"}
              </button>

              {active ? (
                <button
                  onClick={cancelRecurringContract}
                  disabled={canceling}
                  className="inline-flex items-center justify-center rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {canceling ? "Cancelando..." : "Cancelar recorrência"}
                </button>
              ) : null}
            </div>
          </div>

          {error ? (
            <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-7">
              <div className="grid gap-4 sm:grid-cols-2">
                <InfoCard label="Status" value={active ? "Ativo" : "Cancelado"} />
                <InfoCard label="Cliente" value={contract.guest_name || email} />
                <InfoCard label="E-mail" value={contract.guest_email || email} />
                <InfoCard
                  label="Cobrança"
                  value={contract.billing_mode || "não informado"}
                />
                <InfoCard
                  label="Recorrência"
                  value={
                    contract.recurrence_type
                      ? `${contract.recurrence_type}${
                          contract.recurrence_interval
                            ? ` · intervalo ${contract.recurrence_interval}`
                            : ""
                        }`
                      : "não informado"
                  }
                />
                <InfoCard
                  label="Compromisso"
                  value={
                    contract.monthly_commitment_months
                      ? `${contract.monthly_commitment_months} meses`
                      : "não informado"
                  }
                />
                <InfoCard label="Próxima cobrança" value={formatDate(contract.next_billing_date)} />
                <InfoCard label="Última cobrança" value={formatDate(contract.last_billed_at)} />
                <InfoCard
                  label="Data inicial"
                  value={formatDate(contract.date)}
                />
                <InfoCard
                  label="Horário"
                  value={
                    contract.start_time && contract.end_time
                      ? `${contract.start_time} - ${contract.end_time}`
                      : "não informado"
                  }
                />
                <InfoCard
                  label="Total mensal"
                  value={formatCurrency(contract.monthly_total ? contract.monthly_total / 100 : null)}
                />
                <InfoCard
                  label="Preço/hora"
                  value={formatCurrency(contract.price_per_hour)}
                />
              </div>

              <div className="mt-6 rounded-2xl bg-neutral-50 p-5">
                <h2 className="text-lg font-semibold text-neutral-900">Resumo do contrato</h2>
                <p className="mt-2 text-sm leading-6 text-neutral-600">
                  {active
                    ? "Este contrato segue ativo e pode ser encerrado a qualquer momento."
                    : "Este contrato já foi encerrado e permanece apenas como histórico."}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold tracking-tight text-neutral-900">
                Identificadores
              </h2>

              <div className="mt-4 space-y-3 text-sm">
                <MiniRow label="ID do contrato" value={String(contract.id)} />
                <MiniRow
                  label="Stripe customer"
                  value={contract.stripe_customer_id || "-"}
                />
                <MiniRow
                  label="Stripe payment intent"
                  value={contract.stripe_payment_intent || "-"}
                />
                <MiniRow
                  label="Método de pagamento"
                  value={contract.stripe_payment_method || "-"}
                />
              </div>
            </div>

            <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold tracking-tight text-neutral-900">
                Próximas reservas ligadas
              </h2>

              <p className="mt-1 text-sm text-neutral-600">
                Reservas já geradas para esta recorrência.
              </p>

              <div className="mt-4 space-y-3">
                {upcomingRelatedBookings.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-600">
                    Nenhuma reserva associada encontrada.
                  </div>
                ) : (
                  upcomingRelatedBookings.map((booking) => (
                    <div
                      key={booking.id}
                      className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4"
                    >
                      <p className="text-sm font-medium text-neutral-900">
                        {formatDate(booking.date)}
                      </p>
                      <p className="mt-1 text-sm text-neutral-600">
                        {booking.start_time && booking.end_time
                          ? `${booking.start_time} - ${booking.end_time}`
                          : booking.period || "Horário exato"}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-7">
          <h2 className="text-xl font-semibold tracking-tight text-neutral-900">
            Lançamentos dessa recorrência
          </h2>
          <p className="mt-1 text-sm text-neutral-600">
            Reservas vinculadas ao contrato atual.
          </p>

          <div className="mt-5 space-y-4">
            {relatedBookings.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-6 text-center text-sm text-neutral-600">
                Nenhum lançamento encontrado.
              </div>
            ) : (
              relatedBookings.map((booking) => (
                <div
                  key={booking.id}
                  className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-neutral-700">
                          {formatDate(booking.date)}
                        </span>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-neutral-700">
                          {booking.start_time && booking.end_time
                            ? `${booking.start_time} - ${booking.end_time}`
                            : booking.period || "Horário exato"}
                        </span>
                      </div>
                      <p className="mt-3 text-sm text-neutral-600">
                        {booking.property_title || `Espaço #${booking.property_id ?? booking.id}`}
                      </p>
                    </div>

                    <span className="inline-flex rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-medium text-neutral-600">
                      Booking #{booking.id}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-500">{label}</p>
      <p className="mt-2 break-words text-sm font-medium text-neutral-900">{value}</p>
    </div>
  );
}

function MiniRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3">
      <span className="text-neutral-500">{label}</span>
      <span className="max-w-[60%] break-all text-right font-medium text-neutral-900">{value}</span>
    </div>
  );
}