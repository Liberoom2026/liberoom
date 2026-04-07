"use client"

import { useMemo, useState } from "react"

type ApiResponse =
  | { url: string }
  | { error: string; conflict_date?: string; conflict_type?: string }

function generateRecurringDates(
  startDate: string,
  recurrenceType: "none" | "weekly" | "monthly",
  recurrenceInterval: number,
  recurrenceCount: number
) {
  if (!startDate) return []

  const dates: string[] = []

  const addDaysISO = (dateStr: string, days: number) => {
    const [year, month, day] = dateStr.split("-").map(Number)
    const date = new Date(Date.UTC(year, month - 1, day))
    date.setUTCDate(date.getUTCDate() + days)
    return date.toISOString().slice(0, 10)
  }

  const addMonthsISO = (dateStr: string, months: number) => {
    const [year, month, day] = dateStr.split("-").map(Number)
    const date = new Date(Date.UTC(year, month - 1, day))
    date.setUTCMonth(date.getUTCMonth() + months)
    return date.toISOString().slice(0, 10)
  }

  const safeCount = Math.max(1, recurrenceCount)
  const safeInterval = Math.max(1, recurrenceInterval)

  if (recurrenceType === "none") {
    return [startDate]
  }

  for (let i = 0; i < safeCount; i++) {
    if (recurrenceType === "weekly") {
      dates.push(addDaysISO(startDate, i * 7 * safeInterval))
    } else if (recurrenceType === "monthly") {
      dates.push(addMonthsISO(startDate, i * safeInterval))
    }
  }

  return dates
}

export default function TestBookingPage() {
  const [propertyId, setPropertyId] = useState("6")
  const [guestName, setGuestName] = useState("Teste Liberoom")
  const [guestEmail, setGuestEmail] = useState("teste@liberoom.com")
  const [date, setDate] = useState("")
  const [period, setPeriod] = useState("morning")
  const [useTimeSlot, setUseTimeSlot] = useState(false)
  const [startTime, setStartTime] = useState("10:00")
  const [endTime, setEndTime] = useState("12:00")
  const [billingMode, setBillingMode] = useState("one_time")
  const [recurrenceType, setRecurrenceType] = useState<"none" | "weekly" | "monthly">("none")
  const [recurrenceInterval, setRecurrenceInterval] = useState("1")
  const [recurrenceCount, setRecurrenceCount] = useState("1")
  const [monthlyCommitmentMonths, setMonthlyCommitmentMonths] = useState("1")
  const [weekday, setWeekday] = useState("")
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string>("")
  const [error, setError] = useState<string>("")

  const previewDates = useMemo(() => {
    return generateRecurringDates(
      date,
      recurrenceType,
      Number(recurrenceInterval),
      Number(recurrenceCount)
    )
  }, [date, recurrenceType, recurrenceInterval, recurrenceCount])

  async function handleSubmit() {
    setLoading(true)
    setMessage("")
    setError("")

    try {
      const payload: Record<string, unknown> = {
        property_id: Number(propertyId),
        guest_name: guestName,
        guest_email: guestEmail,
        date,
        billing_mode: billingMode,
        recurrence_type: recurrenceType,
        recurrence_interval: Number(recurrenceInterval),
        recurrence_count: Number(recurrenceCount),
        monthly_commitment_months: Number(monthlyCommitmentMonths),
        weekday: weekday || null,
      }

      if (useTimeSlot) {
        payload.start_time = startTime
        payload.end_time = endTime
      } else {
        payload.period = period
      }

      const res = await fetch("/api/create-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })

      const data: ApiResponse = await res.json()

      if (!res.ok) {
        const apiError = data as { error?: string; conflict_date?: string; conflict_type?: string }
        const msg = apiError.conflict_date
          ? `${apiError.error || "Erro"} na data ${apiError.conflict_date}`
          : apiError.error || "Erro ao criar checkout"
        setError(msg)
        return
      }

      const okData = data as { url: string }
      if (okData.url) {
        window.location.href = okData.url
        return
      }

      setError("Checkout criado, mas a URL não veio na resposta.")
    } catch (err: any) {
      setError(err?.message || "Erro inesperado")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={{ maxWidth: 760, margin: "40px auto", padding: 20, fontFamily: "Arial, sans-serif" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Teste de reserva</h1>
      <p style={{ marginBottom: 24, color: "#444" }}>
        Use esta tela para testar bloqueio por data, horário e recorrência antes de abrir a Stripe.
      </p>

      <div style={{ display: "grid", gap: 16 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Property ID</span>
          <input
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            inputMode="numeric"
            style={inputStyle}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Nome do cliente</span>
          <input value={guestName} onChange={(e) => setGuestName(e.target.value)} style={inputStyle} />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Email do cliente</span>
          <input value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} style={inputStyle} />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Data inicial</span>
          <input value={date} onChange={(e) => setDate(e.target.value)} type="date" style={inputStyle} />
        </label>

        <div style={{ display: "grid", gap: 10 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={useTimeSlot}
              onChange={(e) => setUseTimeSlot(e.target.checked)}
            />
            Usar horário exato em vez de período
          </label>

          {!useTimeSlot ? (
            <label style={{ display: "grid", gap: 6 }}>
              <span>Período</span>
              <select value={period} onChange={(e) => setPeriod(e.target.value)} style={inputStyle}>
                <option value="morning">morning</option>
                <option value="afternoon">afternoon</option>
                <option value="evening">evening</option>
                <option value="day">day</option>
                <option value="exclusive">exclusive</option>
              </select>
            </label>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span>Start time</span>
                <input value={startTime} onChange={(e) => setStartTime(e.target.value)} type="time" style={inputStyle} />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span>End time</span>
                <input value={endTime} onChange={(e) => setEndTime(e.target.value)} type="time" style={inputStyle} />
              </label>
            </div>
          )}
        </div>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Billing mode</span>
          <select value={billingMode} onChange={(e) => setBillingMode(e.target.value)} style={inputStyle}>
            <option value="one_time">one_time</option>
            <option value="weekly_monthly">weekly_monthly</option>
          </select>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Recurrence type</span>
          <select
            value={recurrenceType}
            onChange={(e) => setRecurrenceType(e.target.value as "none" | "weekly" | "monthly")}
            style={inputStyle}
          >
            <option value="none">none</option>
            <option value="weekly">weekly</option>
            <option value="monthly">monthly</option>
          </select>
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span>Recurrence interval</span>
            <input
              value={recurrenceInterval}
              onChange={(e) => setRecurrenceInterval(e.target.value)}
              type="number"
              min={1}
              style={inputStyle}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span>Recurrence count</span>
            <input
              value={recurrenceCount}
              onChange={(e) => setRecurrenceCount(e.target.value)}
              type="number"
              min={1}
              style={inputStyle}
            />
          </label>
        </div>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Monthly commitment months</span>
          <input
            value={monthlyCommitmentMonths}
            onChange={(e) => setMonthlyCommitmentMonths(e.target.value)}
            type="number"
            min={1}
            style={inputStyle}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Weekday (opcional)</span>
          <input value={weekday} onChange={(e) => setWeekday(e.target.value)} style={inputStyle} />
        </label>

        <button onClick={handleSubmit} disabled={loading || !date} style={buttonStyle}>
          {loading ? "Testando..." : "Testar pagamento"}
        </button>

        {error ? (
          <div style={errorStyle}>
            <strong>Erro:</strong> {error}
          </div>
        ) : null}

        {message ? (
          <div style={successStyle}>
            <strong>OK:</strong> {message}
          </div>
        ) : null}

        <div style={previewBoxStyle}>
          <strong>Datas que esta recorrência vai gerar:</strong>
          <ul style={{ marginTop: 8, marginBottom: 0 }}>
            {previewDates.length > 0 ? (
              previewDates.map((d) => <li key={d}>{d}</li>)
            ) : (
              <li>Escolha uma data inicial.</li>
            )}
          </ul>
        </div>
      </div>
    </main>
  )
}

const inputStyle: React.CSSProperties = {
  border: "1px solid #ccc",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 16,
  width: "100%",
  boxSizing: "border-box",
}

const buttonStyle: React.CSSProperties = {
  border: "none",
  borderRadius: 10,
  padding: "12px 16px",
  background: "#2563eb",
  color: "white",
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
}

const errorStyle: React.CSSProperties = {
  background: "#fee2e2",
  color: "#991b1b",
  padding: 12,
  borderRadius: 10,
  border: "1px solid #fecaca",
}

const successStyle: React.CSSProperties = {
  background: "#dcfce7",
  color: "#166534",
  padding: 12,
  borderRadius: 10,
  border: "1px solid #bbf7d0",
}

const previewBoxStyle: React.CSSProperties = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  padding: 12,
}