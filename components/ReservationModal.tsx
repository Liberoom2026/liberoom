"use client"

import { useEffect, useMemo, useState } from "react"

type Props = {
  isOpen: boolean
  onClose: () => void
  propertyId: number
  pricePerHour: number
  propertyTitle?: string
  defaultDate?: string
  defaultPeriod?: string
}

type BookingMode = "time" | "period" | "day" | "exclusive"
type PlanMode = "one_time" | "weekly_monthly"

const BACKEND_URL =
  "https://checkout-backend-git-main-gustavos-projects-7b34e52c.vercel.app"

function parseTime(time: string) {
  const [h, m] = time.split(":").map(Number)
  return h * 60 + m
}

function calcDuration(start: string, end: string) {
  const diff = parseTime(end) - parseTime(start)
  return Math.max(1, Math.ceil(diff / 60))
}

function periodHours(period: string) {
  if (period === "morning") return 4
  if (period === "afternoon") return 6
  if (period === "evening") return 4
  if (period === "day") return 24
  return 0
}

export default function ReservationModal({
  isOpen,
  onClose,
  propertyId,
  pricePerHour,
  propertyTitle = "Espaço",
  defaultDate = "",
  defaultPeriod = "morning",
}: Props) {
  const [guestName, setGuestName] = useState("")
  const [guestEmail, setGuestEmail] = useState("")
  const [date, setDate] = useState(defaultDate)

  const [bookingMode, setBookingMode] = useState<BookingMode>(
    defaultPeriod ? "period" : "time"
  )
  const [planMode, setPlanMode] = useState<PlanMode>("one_time")

  const [period, setPeriod] = useState(defaultPeriod)
  const [startTime, setStartTime] = useState("08:00")
  const [endTime, setEndTime] = useState("09:00")

  const [weekday, setWeekday] = useState("1")
  const [months, setMonths] = useState(1)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!isOpen) return

    setDate(defaultDate || "")
    setPeriod(defaultPeriod || "morning")
    if (defaultPeriod) {
      setBookingMode("period")
    }
  }, [isOpen, defaultDate, defaultPeriod])

  const duration = useMemo(() => {
    if (bookingMode === "time") return calcDuration(startTime, endTime)
    if (bookingMode === "period") return periodHours(period)
    if (bookingMode === "day" || bookingMode === "exclusive") return 24
    return 0
  }, [bookingMode, startTime, endTime, period])

  const estimatedTimePrice = bookingMode === "time" ? pricePerHour * duration : null

  async function handleCheckout() {
    setError("")

    if (!guestName || !guestEmail || !date) {
      setError("Preencha nome, email e data")
      return
    }

    if (bookingMode === "time") {
      if (!startTime || !endTime) {
        setError("Preencha o horário inicial e final")
        return
      }

      if (parseTime(endTime) <= parseTime(startTime)) {
        setError("A hora final precisa ser maior que a inicial")
        return
      }
    }

    if (bookingMode === "period" && !period) {
      setError("Escolha um período")
      return
    }

    const durationHours =
      bookingMode === "time"
        ? calcDuration(startTime, endTime)
        : bookingMode === "period"
          ? periodHours(period)
          : 24

    const payload: Record<string, unknown> = {
      property_id: propertyId,
      guest_name: guestName,
      guest_email: guestEmail,
      date,
      duration_hours: durationHours,
      billing_mode: bookingMode,
      reservation_type: bookingMode,
      currency: "brl",
      success_url: `${window.location.origin}/success`,
      cancel_url: `${window.location.origin}/cancel`,
    }

if (bookingMode === "time") {
  payload.start_time = startTime
  payload.end_time = endTime
  delete payload.period
  delete payload.reservation_type
}

if (bookingMode === "period") {
  payload.period = period
  delete payload.start_time
  delete payload.end_time
  delete payload.reservation_type
}

if (bookingMode === "day") {
  payload.period = "day"
  delete payload.start_time
  delete payload.end_time
  delete payload.reservation_type
}

if (bookingMode === "exclusive") {
  payload.period = "day"
  payload.reservation_type = "exclusive"
  delete payload.start_time
  delete payload.end_time
}

    if (planMode === "weekly_monthly") {
      payload.recurrence_type = "weekly"
      payload.recurrence_interval = 1
      payload.recurrence_count = 4
      payload.weekday = weekday
      payload.months_count = months
      payload.recurrence_months = months
      payload.monthly_commitment_months = months
    }

    setLoading(true)

    try {
      const res = await fetch(`${BACKEND_URL}/api/create-checkout-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Erro ao criar checkout")
        setLoading(false)
        return
      }

      window.location.href = data.url
    } catch (err) {
      setError("Erro ao processar pagamento")
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div style={overlay}>
      <div style={modal}>
        <div style={headerRow}>
          <h2 style={{ margin: 0 }}>Reservar {propertyTitle}</h2>
          <button type="button" onClick={onClose} style={closeButton}>
            Fechar
          </button>
        </div>

        <input
          placeholder="Nome"
          value={guestName}
          onChange={(e) => setGuestName(e.target.value)}
        />
        <input
          placeholder="Email"
          value={guestEmail}
          onChange={(e) => setGuestEmail(e.target.value)}
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />

        <h3>Tipo de reserva</h3>
        <select
          value={bookingMode}
          onChange={(e) => setBookingMode(e.target.value as BookingMode)}
        >
          <option value="time">Por horário</option>
          <option value="period">Por período</option>
          <option value="day">Diária</option>
          <option value="exclusive">Exclusiva</option>
        </select>

        {bookingMode === "time" && (
          <>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </>
        )}

        {bookingMode === "period" && (
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="">Selecione</option>
            <option value="morning">Manhã</option>
            <option value="afternoon">Tarde</option>
            <option value="evening">Noite</option>
          </select>
        )}

        <h3>Plano</h3>

        <label>
          <input
            type="radio"
            checked={planMode === "one_time"}
            onChange={() => setPlanMode("one_time")}
          />
          Reserva única
        </label>

        <label>
          <input
            type="radio"
            checked={planMode === "weekly_monthly"}
            onChange={() => setPlanMode("weekly_monthly")}
          />
          Plano semanal (cobrança mensal)
        </label>

        {planMode === "weekly_monthly" && (
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

        {bookingMode === "time" ? (
          <p>Valor estimado: R$ {estimatedTimePrice}</p>
        ) : (
          <p>Preço definido pelo proprietário para esta modalidade</p>
        )}

        {planMode === "weekly_monthly" && (
          <p>
            Estimativa mensal: <strong>4 ocorrências</strong>
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
  zIndex: 9999,
}

const modal = {
  background: "white",
  padding: 20,
  borderRadius: 10,
  display: "flex",
  flexDirection: "column" as const,
  gap: 10,
  width: "min(520px, 92vw)",
  maxHeight: "90vh",
  overflowY: "auto" as const,
}

const headerRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
}

const closeButton = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #ccc",
  background: "#f8f8f8",
  cursor: "pointer",
}