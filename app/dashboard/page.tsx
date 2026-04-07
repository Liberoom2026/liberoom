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

function periodLabel(period?: string | null) {
  if (!period) return "Horário exato";
  if (period === "morning") return "Manhã";
  if (period === "afternoon") return "Tarde";
  if (period === "evening") return "Noite";
  if (period === "day") return "Diária";
  if (period === "exclusive") return "Exclusivo";
  return period;
}

function bookingTimeLabel(b: Booking) {
  if (b.start_time && b.end_time) {
    return `${b.start_time} - ${b.end_time}`;
  }

  return periodLabel(b.period);
}

function contractTimeLabel(c: RecurringContract) {
  if (c.start_time && c.end_time) {
    return `${c.start_time} - ${c.end_time}`;
  }

  if (c.weekday) {
    return c.weekday;
  }

  if (c.date) {
    return formatDate(c.date);
  }

  return "Recorrência";
}

function isRecurringBooking(b: Booking) {
  return Boolean(b.contract_id) || (b.recurrence_type && b.recurrence_type !== "none");
}

function isActiveContract(c: RecurringContract) {
  return !c.canceled_at && c.status !== "canceled";
}

export default function Dashboard() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [recurringContracts, setRecurringContracts] = useState<RecurringContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelingBookingId, setCancelingBookingId] = useState<number | null>(null);
  const [cancelingContractId, setCancelingContractId] = useState<number | null>(null);

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
        setRecurringContracts([]);
      } else if (data && Array.isArray(data.bookings)) {
        setBookings(data.bookings);
        setRecurringContracts(Array.isArray(data.recurring_contracts) ? data.recurring_contracts : []);
      } else {
        setBookings([]);
        setRecurringContracts([]);
        if (data && typeof data === "object" && "error" in data && data.error) {
          setError(data.error);
        }
      }
    } catch (err: any) {
      setError(err?.message || "Falha ao carregar reservas.");
      setBookings([]);
      setRecurringContracts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function cancelBooking(id: number) {
    const confirmCancel = window.confirm("Tem certeza que deseja cancelar?");
    if (!confirmCancel) return;

    try {
      setCancelingBookingId(id);

      const res = await fetch("/api/cancel-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Não foi possível cancelar a reserva.");
      }

      await load();
    } catch (err: any) {
      setError(err?.message || "Falha ao cancelar a reserva.");
    } finally {
      setCancelingBookingId(null);
    }
  }

  async function cancelRecurringContract(id: number) {
    const confirmCancel = window.confirm(
      "Tem certeza que deseja cancelar esta recorrência?"
    );
    if (!confirmCancel) return;

    try {
      setCancelingContractId(id);

      const res = await fetch("/api/cancel-recurring-contract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, email }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Não foi possível cancelar a recorrência.");
      }

      await load();
    } catch (err: any) {
      setError(err?.message || "Falha ao cancelar a recorrência.");
    } finally {
      setCancelingContractId(null);
    }
  }

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const upcoming = useMemo(
    () => bookings.filter((b) => parseDateOnly(b.date) >= today),
    [bookings, today]
  );

  const past = useMemo(
    () => bookings.filter((b) => parseDateOnly(b.date) < today),
    [bookings, today]
  );

  const activeContracts = useMemo(
    () => recurringContracts.filter(isActiveContract),
    [recurringContracts]
  );

  const inactiveContracts = useMemo(
    () => recurringContracts.filter((c) => !isActiveContract(c)),
    [recurringContracts]
  );

  const recurringBookings = useMemo(() => bookings.filter(isRecurringBooking), [bookings]);

  const totalBookings = bookings.length;
  const upcomingCount = upcoming.length;
  const pastCount = past.length;
  const recurringCount = recurringBookings.length;
  const activeContractsCount = activeContracts.length;

  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-10 text-neutral-900 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-sm font-medium uppercase tracking-[0.22em] text-neutral-500">
                Dashboard do cliente
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                Meu espaço de reservas
              </h1>
              <p className="mt-3 text-base leading-7 text-neutral-600">
                Aqui você acompanha suas reservas, contratos recorrentes e histórico. A lógica já
                está integrada ao backend atual do Liberoom.
              </p>

              <div className="mt-5 inline-flex items-center rounded-full border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm text-neutral-700">
                {email}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={load}
                className="inline-flex items-center justify-center rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-70"
                disabled={refreshing}
              >
                {refreshing ? "Atualizando..." : "Atualizar"}
              </button>

              <a
                href="/"
                className="inline-flex items-center justify-center rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
              >
                Nova reserva
              </a>
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryCard title="Total" value={totalBookings} hint="Reservas carregadas" />
            <SummaryCard title="Próximas" value={upcomingCount} hint="A partir de hoje" />
            <SummaryCard title="Histórico" value={pastCount} hint="Reservas passadas" />
            <SummaryCard title="Recorrências" value={recurringCount} hint="Itens recorrentes" />
            <SummaryCard title="Contratos" value={activeContractsCount} hint="Ativos" />
          </div>

          {error ? (
            <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
        </section>

        <section className="grid gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <Panel title="Próximas reservas" subtitle="Reservas futuras e ações rápidas">
              {loading ? (
                <LoadingList />
              ) : upcoming.length === 0 ? (
                <EmptyState
                  title="Nenhuma reserva futura"
                  description="Quando houver novas reservas, elas aparecerão aqui."
                />
              ) : (
                <div className="space-y-4">
                  {upcoming.map((b) => {
                    const canCancel = parseDateOnly(b.date) >= today;
                    const recurringFlag = isRecurringBooking(b);

                    return (
                      <div
                        key={b.id}
                        className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"
                      >
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
                                {formatDate(b.date)}
                              </span>
                              <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
                                {bookingTimeLabel(b)}
                              </span>
                              {recurringFlag ? (
                                <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700">
                                  Recorrente
                                </span>
                              ) : null}
                            </div>

                            <div>
                              <h3 className="text-base font-semibold text-neutral-900">
                                {b.property_title || `Espaço #${b.property_id ?? b.id}`}
                              </h3>
                              <p className="mt-1 text-sm text-neutral-600">
                                {b.guest_name || "Cliente"} · {b.guest_email || email}
                              </p>
                            </div>

                            <div className="flex flex-wrap gap-2 text-xs text-neutral-500">
                              {b.duration_hours ? (
                                <span className="rounded-full border border-neutral-200 px-2.5 py-1">
                                  {b.duration_hours}h
                                </span>
                              ) : null}
                              {b.billing_mode ? (
                                <span className="rounded-full border border-neutral-200 px-2.5 py-1">
                                  {b.billing_mode}
                                </span>
                              ) : null}
                              {b.recurrence_type ? (
                                <span className="rounded-full border border-neutral-200 px-2.5 py-1">
                                  {b.recurrence_type}
                                  {b.recurrence_interval
                                    ? ` · a cada ${b.recurrence_interval}x`
                                    : ""}
                                </span>
                              ) : null}
                            </div>
                          </div>

                          <div className="flex flex-col gap-3 sm:items-end">
                            <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                              Próxima
                            </span>

                            {canCancel ? (
                              <button
                                onClick={() => cancelBooking(b.id)}
                                disabled={cancelingBookingId === b.id}
                                className="inline-flex items-center justify-center rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {cancelingBookingId === b.id ? "Cancelando..." : "Cancelar"}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>
          </div>

          <div className="space-y-6">
            <Panel title="Contratos recorrentes" subtitle="Cancelamento e acompanhamento">
              {loading ? (
                <LoadingCompact />
              ) : activeContracts.length === 0 ? (
                <EmptyState
                  title="Sem contratos ativos"
                  description="Quando houver contratos recorrentes, eles aparecerão aqui."
                />
              ) : (
                <div className="space-y-3">
                  {activeContracts.map((c) => (
                    <div
                      key={c.id}
                      className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-neutral-900">
                            {c.property_title || `Espaço #${c.property_id ?? c.id}`}
                          </p>
                          <p className="mt-1 text-sm text-neutral-600">
                            {contractTimeLabel(c)} · {formatDate(c.next_billing_date)}
                          </p>
                          <p className="mt-1 text-xs text-neutral-500">
                            {c.recurrence_type
                              ? `${c.recurrence_type}${
                                  c.recurrence_interval
                                    ? ` · intervalo ${c.recurrence_interval}`
                                    : ""
                                }`
                              : "Recorrência"}
                          </p>
                        </div>

                        <div className="flex flex-col gap-2">
                          <Link
                            href={`/dashboard/contracts/${c.id}`}
                            className="inline-flex items-center justify-center rounded-full border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-900 transition hover:bg-neutral-100"
                          >
                            Detalhes
                          </Link>

                          <button
                            onClick={() => cancelRecurringContract(c.id)}
                            disabled={cancelingContractId === c.id}
                            className="inline-flex items-center justify-center rounded-full border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-900 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {cancelingContractId === c.id ? "Cancelando..." : "Cancelar"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Resumo rápido" subtitle="Visão geral do que está no sistema">
              <div className="space-y-3 text-sm text-neutral-700">
                <InfoRow label="E-mail" value={email} />
                <InfoRow label="Reservas futuras" value={String(upcomingCount)} />
                <InfoRow label="Reservas passadas" value={String(pastCount)} />
                <InfoRow label="Contratos ativos" value={String(activeContractsCount)} />
              </div>
            </Panel>

            <Panel title="Contratos encerrados" subtitle="Histórico de recorrências canceladas">
              {loading ? (
                <LoadingCompact />
              ) : inactiveContracts.length === 0 ? (
                <EmptyState
                  title="Nenhum contrato encerrado"
                  description="Os contratos cancelados aparecerão aqui para consulta."
                />
              ) : (
                <div className="space-y-3">
                  {inactiveContracts.map((c) => (
                    <div
                      key={`inactive-${c.id}`}
                      className="rounded-2xl border border-neutral-200 bg-white p-4"
                    >
                      <p className="text-sm font-medium text-neutral-900">
                        {c.property_title || `Espaço #${c.property_id ?? c.id}`}
                      </p>
                      <p className="mt-1 text-sm text-neutral-600">
                        Cancelado em {formatDate(c.canceled_at)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </section>

        <section>
          <Panel title="Histórico" subtitle="Reservas já concluídas">
            {loading ? (
              <LoadingList />
            ) : past.length === 0 ? (
              <EmptyState
                title="Nenhuma reserva passada"
                description="Quando houver histórico, ele vai aparecer aqui."
              />
            ) : (
              <div className="space-y-4">
                {past.map((b) => (
                  <div
                    key={b.id}
                    className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm opacity-90"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
                            {formatDate(b.date)}
                          </span>
                          <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
                            {bookingTimeLabel(b)}
                          </span>
                          {isRecurringBooking(b) ? (
                            <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700">
                              Recorrente
                            </span>
                          ) : null}
                        </div>

                        <h3 className="mt-3 text-base font-semibold text-neutral-900">
                          {b.property_title || `Espaço #${b.property_id ?? b.id}`}
                        </h3>
                        <p className="mt-1 text-sm text-neutral-600">
                          {b.guest_name || "Cliente"} · {b.guest_email || email}
                        </p>
                      </div>

                      <span className="inline-flex rounded-full border border-neutral-200 px-3 py-1 text-xs font-medium text-neutral-600">
                        Concluída
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </section>
      </div>
    </main>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-7">
      <div className="mb-5">
        <h2 className="text-xl font-semibold tracking-tight text-neutral-900">{title}</h2>
        <p className="mt-1 text-sm text-neutral-600">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function SummaryCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5">
      <p className="text-sm font-medium text-neutral-500">{title}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-neutral-900">{value}</p>
      <p className="mt-1 text-sm text-neutral-600">{hint}</p>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-6 text-center">
      <p className="text-sm font-semibold text-neutral-900">{title}</p>
      <p className="mt-2 text-sm leading-6 text-neutral-600">{description}</p>
    </div>
  );
}

function LoadingList() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="animate-pulse rounded-2xl border border-neutral-200 bg-neutral-50 p-5"
        >
          <div className="h-4 w-24 rounded bg-neutral-200" />
          <div className="mt-3 h-5 w-3/5 rounded bg-neutral-200" />
          <div className="mt-2 h-4 w-2/5 rounded bg-neutral-200" />
        </div>
      ))}
    </div>
  );
}

function LoadingCompact() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 2 }).map((_, index) => (
        <div
          key={index}
          className="animate-pulse rounded-2xl border border-neutral-200 bg-neutral-50 p-4"
        >
          <div className="h-4 w-1/2 rounded bg-neutral-200" />
          <div className="mt-2 h-4 w-2/3 rounded bg-neutral-200" />
        </div>
      ))}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3">
      <span className="text-neutral-500">{label}</span>
      <span className="font-medium text-neutral-900">{value}</span>
    </div>
  );
}