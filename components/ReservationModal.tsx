"use client"

import { useMemo, useState } from "react"

type Props = {
  isOpen: boolean
  onClose: () => void
  propertyId: number
  pricePerHour: number
  propertyTitle?: string
  defaultDate?: string;
defaultPeriod?: string;
}

type BookingMode = "time" | "period" | "day"
type BillingMode = "one_time" | "weekly_monthly"

function parseTime(time: string) {
  const [h, m] = time.split(":").map(Number)
  return h * 60 + m
}

function calcDuration(start: string, end: string) {
  return Math.max(1, Math.ceil((parseTime(end) - parseTime(start)) / 60))
}

function periodHours(period: string) {
  if (period === "morning") return 4
  if (period === "afternoon") return 6
  if (period === "evening") return 4
  if (period === "day") return 24
  return 1
}

export default function ReservationModal({
  isOpen,
  onClose,
  propertyId,
  pricePerHour,
  propertyTitle = "Espaço",
}: Props) {
  const [guestName, setGuestName] = useState("")
  const [guestEmail, setGuestEmail] = useState("")
  const [date, setDate] = useState("")

  const [bookingMode, setBookingMode] = useState<BookingMode>("time")
  const [billingMode, setBillingMode] = useState<BillingMode>("one_time")

  const [period, setPeriod] = useState("morning")
  const [startTime, setStartTime] = useState("08:00")
  const [endTime, setEndTime] = useState("09:00")

  const [weekday, setWeekday] = useState("1")
  const [months, setMonths] = useState(1)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const duration = useMemo(() => {
    if (bookingMode === "time") return calcDuration(startTime, endTime)
    if (bookingMode === "day") return 24
    return periodHours(period)
  }, [bookingMode, startTime, endTime, period])

  const singlePrice = pricePerHour * duration
  const monthlyEstimate = singlePrice * 4

  async function handleCheckout() {
    setError("")

    if (!guestName || !guestEmail || !date) {
      setError("Preencha todos os campos")
      return
    }

    const payload: any = {
      property_id: propertyId,
      guest_name: guestName,
      guest_email: guestEmail,
      date,
      duration_hours: duration,
      billing_mode: billingMode,
    }

    if (bookingMode === "time") {
      payload.start_time = startTime
      payload.end_time = endTime
    }

    if (bookingMode === "period") {
      payload.period = period
    }

    if (bookingMode === "day") {
      payload.period = "day"
    }

    if (billingMode === "weekly_monthly") {
      payload.recurrence_type = "weekly"
      payload.recurrence_interval = 1
      payload.recurrence_count = 4
      payload.weekday = weekday
      payload.monthly_commitment_months = months
    }

    setLoading(true)

    const res = await fetch("/api/create-checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error || "Erro")
      setLoading(false)
      return
    }

    window.location.href = data.url
  }

  if (!isOpen) return null

  return (
    <div style={overlay}>
      <div style={modal}>
        <h2>Reservar {propertyTitle}</h2>

        <input placeholder="Nome" value={guestName} onChange={(e) => setGuestName(e.target.value)} />
        <input placeholder="Email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />

        <h3>Tipo de reserva</h3>
        <select value={bookingMode} onChange={(e) => setBookingMode(e.target.value as any)}>
          <option value="time">Por horário</option>
          <option value="period">Por período</option>
          <option value="day">Diária</option>
        </select>

        {bookingMode === "time" && (
          <>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </>
        )}

        {bookingMode === "period" && (
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="morning">Manhã</option>
            <option value="afternoon">Tarde</option>
            <option value="evening">Noite</option>
          </select>
        )}

        <h3>Plano</h3>

        <label>
          <input
            type="radio"
            checked={billingMode === "one_time"}
            onChange={() => setBillingMode("one_time")}
          />
          Reserva única
        </label>

        <label>
          <input
            type="radio"
            checked={billingMode === "weekly_monthly"}
            onChange={() => setBillingMode("weekly_monthly")}
          />
          Plano semanal (cobrança mensal)
        </label>

        {billingMode === "weekly_monthly" && (
          <>
            <select value={weekday} onChange={(e) => setWeekday(e.target.value)}>
              <option value="1">Segunda</option>
              <option value="2">Terça</option>
              <option value="3">Quarta</option>
              <option value="4">Quinta</option>
              <option value="5">Sexta</option>
            </select>

            <input
              type="number"
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
              min={1}
            />

            <p style={{ color: "red" }}>
              Cancelamento antecipado cobra 1 mensalidade.
            </p>
          </>
        )}

        <hr />

        <p>Duração: {duration}h</p>
        <p>Valor unitário: R$ {singlePrice}</p>

        {billingMode === "weekly_monthly" && (
          <p>
            Estimativa mensal: <strong>R$ {monthlyEstimate}</strong>
          </p>
        )}

        {error && <p style={{ color: "red" }}>{error}</p>}

        <button onClick={handleCheckout} disabled={loading}>
          {loading ? "Processando..." : "Confirmar reserva"}
        </button>
      </div>
    </div>
  )
}

const overlay = {
  position: "fixed" as const,
  inset: 0,
  background: "rgba(0,0,0,0.5)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
}

const modal = {
  background: "white",
  padding: 20,
  borderRadius: 10,
  display: "flex",
  flexDirection: "column" as const,
  gap: 10,
}