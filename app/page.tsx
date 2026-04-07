"use client";

import { useMemo, useState, type ReactNode } from "react";

type AvailabilityItem = {
  date: string;
  occupied: boolean;
  conflict_type?: "booking" | "block" | null;
  conflicts: Array<{
    source: "booking" | "block" | null;
    period: string | null;
    start_time: string | null;
    end_time: string | null;
  }>;
};

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

function generateRecurringDates(
  startDate: string,
  recurrenceType: "none" | "weekly" | "biweekly",
  commitmentMonths: number
) {
  if (!startDate) return [];

  if (recurrenceType === "none") {
    return [startDate];
  }

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

function formatBR(dateStr: string) {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function periodLabel(period: string) {
  if (period === "morning") return "Manhã";
  if (period === "afternoon") return "Tarde";
  if (period === "evening") return "Noite";
  if (period === "day") return "Dia inteiro";
  if (period === "exclusive") return "Exclusivo";
  return period;
}

function frequencyLabel(value: "weekly" | "biweekly") {
  return value === "weekly" ? "Semanal" : "Quinzenal";
}

function recurrenceSummary(
  recurrenceType: "none" | "weekly" | "biweekly",
  commitmentMonths: number
) {
  if (recurrenceType === "none") return "Sem recorrência";
  const label = recurrenceType === "weekly" ? "Semanal" : "Quinzenal";
  return `${label} por ${commitmentMonths} mês${commitmentMonths === 1 ? "" : "es"}`;
}

function Field({
  label,
  children,
  helper,
}: {
  label: string;
  children: ReactNode;
  helper?: string;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {helper ? <span className="text-xs text-slate-500">{helper}</span> : null}
    </label>
  );
}

export default function Home() {
  const [date, setDate] = useState("");
  const [useTimeSlot, setUseTimeSlot] = useState(false);
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("12:00");
  const [period, setPeriod] = useState("morning");

  const [billingMode, setBillingMode] = useState("one_time");
  const [recurrenceType, setRecurrenceType] = useState<"weekly" | "biweekly">("weekly");
  const [monthlyCommitmentMonths, setMonthlyCommitmentMonths] = useState("1");

  const [availability, setAvailability] = useState<AvailabilityItem[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");

  const hasRecurring = billingMode === "weekly_monthly";
  const commitmentMonths = hasRecurring
    ? Math.max(1, Math.min(12, Number(monthlyCommitmentMonths) || 1))
    : 1;

  const previewDates = useMemo(() => {
    return generateRecurringDates(
      date,
      hasRecurring ? recurrenceType : "none",
      commitmentMonths
    );
  }, [date, hasRecurring, recurrenceType, commitmentMonths]);

  async function handleCheckAvailability() {
    if (!date) {
      setAvailabilityError("Escolha uma data primeiro.");
      return;
    }

    if (useTimeSlot && (!startTime || !endTime)) {
      setAvailabilityError("Escolha o horário inicial e final.");
      return;
    }

    setAvailabilityLoading(true);
    setAvailabilityError("");
    setAvailability([]);

    try {
      const response = await fetch("/api/availability", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          property_id: 6,
          date,
          period: useTimeSlot ? null : period,
          start_time: useTimeSlot ? startTime : null,
          end_time: useTimeSlot ? endTime : null,
          recurrence_type: hasRecurring ? recurrenceType : "none",
          monthly_commitment_months: commitmentMonths,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setAvailabilityError(data.error || "Erro ao verificar ocupação.");
        return;
      }

      setAvailability(data.occurrences || []);
    } catch {
      setAvailabilityError("Erro ao conectar com o servidor.");
    } finally {
      setAvailabilityLoading(false);
    }
  }

  async function handleCheckout() {
    try {
      const payload: Record<string, unknown> = {
        property_id: 6,
        guest_name: "Gustavo Audi",
        guest_email: "gustavoaudi29@gmail.com",
        date,
        billing_mode: billingMode,
        recurrence_type: hasRecurring ? recurrenceType : "none",
        monthly_commitment_months: commitmentMonths,
      };

      if (useTimeSlot) {
        payload.start_time = startTime;
        payload.end_time = endTime;
      } else {
        payload.period = period;
      }

      const response = await fetch("/api/create-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || "Erro ao reservar.");
        return;
      }

      if (data.url) {
        window.location.href = data.url;
      } else {
        alert("Erro ao redirecionar para pagamento.");
      }
    } catch {
      alert("Erro ao conectar com o servidor.");
    }
  }

  const availabilityByDate = new Map(availability.map((item) => [item.date, item]));

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[1.25fr_0.95fr]">
          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
            <div className="mb-8">
              <div className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold tracking-wide text-slate-700">
                Liberoom
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
                Reserva com recorrência
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                Escolha a data, selecione horário ou período e defina se a reserva se repete semanalmente ou quinzenalmente por até 12 meses.
              </p>
            </div>

            <div className="grid gap-5">
              <Field label="Data">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={inputClass}
                />
              </Field>

              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <input
                  type="checkbox"
                  checked={useTimeSlot}
                  onChange={(e) => setUseTimeSlot(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <span className="text-sm font-medium text-slate-700">
                  Usar horário exato em vez de período
                </span>
              </label>

              {useTimeSlot ? (
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Horário inicial">
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className={inputClass}
                    />
                  </Field>

                  <Field label="Horário final">
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                </div>
              ) : (
                <Field label="Período">
                  <select
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                    className={inputClass}
                  >
                    <option value="morning">Manhã</option>
                    <option value="afternoon">Tarde</option>
                    <option value="evening">Noite</option>
                    <option value="day">Dia inteiro</option>
                    <option value="exclusive">Exclusivo</option>
                  </select>
                </Field>
              )}

              <Field label="Modo de cobrança">
                <select
                  value={billingMode}
                  onChange={(e) => setBillingMode(e.target.value)}
                  className={inputClass}
                >
                  <option value="one_time">Reserva única</option>
                  <option value="weekly_monthly">Recorrência</option>
                </select>
              </Field>

              {hasRecurring && (
                <div className="grid gap-5 rounded-3xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
                  <Field
                    label="Frequência"
                    helper="Semanal = a cada 7 dias. Quinzenal = a cada 14 dias."
                  >
                    <select
                      value={recurrenceType}
                      onChange={(e) =>
                        setRecurrenceType(e.target.value as "weekly" | "biweekly")
                      }
                      className={inputClass}
                    >
                      <option value="weekly">Semanal</option>
                      <option value="biweekly">Quinzenal</option>
                    </select>
                  </Field>

                  <Field
                    label="Por quantos meses"
                    helper="Máximo de 12 meses."
                  >
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={monthlyCommitmentMonths}
                      onChange={(e) => setMonthlyCommitmentMonths(e.target.value)}
                      className={inputClass}
                    />
                  </Field>

                  <div className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-700 ring-1 ring-slate-200">
                    <span className="font-semibold text-slate-900">Resumo: </span>
                    {recurrenceSummary(recurrenceType, commitmentMonths)}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={handleCheckAvailability}
                  className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={availabilityLoading}
                >
                  {availabilityLoading ? "Verificando..." : "Ver datas ocupadas"}
                </button>

                <button
                  onClick={handleCheckout}
                  className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500"
                >
                  Reservar e pagar
                </button>
              </div>

              {availabilityError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                  {availabilityError}
                </div>
              ) : null}
            </div>
          </section>

          <aside className="grid gap-6">
            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
              <h2 className="text-lg font-semibold">Datas geradas</h2>
              <p className="mt-2 text-sm text-slate-600">
                Estas são as ocorrências que serão validadas antes do pagamento.
              </p>

              <div className="mt-5 space-y-3">
                {previewDates.length > 0 ? (
                  previewDates.map((d) => {
                    const item = availabilityByDate.get(d);
                    const occupied = item?.occupied ?? false;

                    return (
                      <div
                        key={d}
                        className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">
                              {formatBR(d)}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              {useTimeSlot ? `${startTime} - ${endTime}` : periodLabel(period)}
                            </div>
                          </div>

                          <span
                            className={[
                              "rounded-full px-3 py-1 text-xs font-semibold",
                              occupied
                                ? "bg-rose-100 text-rose-700"
                                : "bg-emerald-100 text-emerald-700",
                            ].join(" ")}
                          >
                            {availability.length > 0
                              ? occupied
                                ? "Ocupado"
                                : "Livre"
                              : "Ainda não verificado"}
                          </span>
                        </div>

                        {occupied && item?.conflicts?.length ? (
                          <div className="mt-3 text-xs text-rose-700">
                            Conflito com{" "}
                            {item.conflicts[0].source === "block"
                              ? "bloqueio manual"
                              : "reserva existente"}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                    Escolha uma data para ver a recorrência.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-3xl bg-slate-900 p-6 text-white shadow-sm sm:p-8">
              <h2 className="text-lg font-semibold">Resumo</h2>
              <div className="mt-4 grid gap-3 text-sm text-slate-200">
                <div className="flex items-center justify-between gap-4">
                  <span>Tipo</span>
                  <strong className="text-white">
                    {useTimeSlot ? "Horário exato" : "Período"}
                  </strong>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>Recorrência</span>
                  <strong className="text-white">
                    {hasRecurring
                      ? recurrenceSummary(recurrenceType, commitmentMonths)
                      : "Reserva única"}
                  </strong>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>Ocorrências</span>
                  <strong className="text-white">{previewDates.length}</strong>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

const inputClass =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100";