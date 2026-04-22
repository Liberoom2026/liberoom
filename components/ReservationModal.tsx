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
type BlockRange = {
  id?: number | string
  property_id?: number
  start_at: string
  end_at: string
  status?: string
}

const BACKEND_URL = "https://checkout-backend-beta.vercel.app"

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

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number)
  return new Date(year, month - 1, day)
}

function formatDateBR(dateKey: string) {
  return new Intl.DateTimeFormat("pt-BR").format(parseDateKey(dateKey))
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

  const [blockedRanges, setBlockedRanges] = useState<BlockRange[]>([])
  const [loadingBlocks, setLoadingBlocks] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!isOpen) return

    setDate(defaultDate || "")
    setPeriod(defaultPeriod || "morning")
    setError("")

    if (defaultPeriod) {
      setBookingMode("period")
    }

    fetchBlocks()
  }, [isOpen, defaultDate, defaultPeriod, propertyId])

  async function fetchBlocks() {
    if (!propertyId) return

    setLoadingBlocks(true)

    try {
      const today = new Date()
      const future = new Date()
      future.setMonth(today.getMonth() + 2)

      const res = await fetch(
        `${BACKEND_URL}/api/get-booking-blocks?property_id=${propertyId}&start_date=${today.toISOString()}&end_date=${future.toISOString()}`
      )

      const data = await res.json()
      setBlockedRanges(Array.isArray(data.blocks) ? data.blocks : [])
    } catch {
      setBlockedRanges([])
    } finally {
      setLoadingBlocks(false)
    }
  }

  function isTimeBlocked(selectedDate: string, start: string, end: string) {
    if (!selectedDate) return false

    const startAt = new Date(`${selectedDate}T${start}:00`)
    const endAt = new Date(`${selectedDate}T${end}:00`)

    return blockedRanges.some((block) => {
      const blockStart = new Date(block.start_at)
      const blockEnd = new Date(block.end_at)

      return startAt < blockEnd && endAt > blockStart
    })
  }

  const duration = useMemo(() => {
    if (bookingMode === "time") return calcDuration(startTime, endTime)
    if (bookingMode === "period") return periodHours(period)
    if (bookingMode === "day" || bookingMode === "exclusive") return 24
    return 0
  }, [bookingMode, startTime, endTime, period])

  const estimatedTimePrice = bookingMode === "time" ? pricePerHour * duration : null

  const selectedDayBlocks = useMemo(() => {
    if (!date) return []

    return blockedRanges
      .filter((block) => {
        const blockStart = new Date(block.start_at)
        return blockStart.toISOString().slice(0, 10) === date
      })
      .sort((a, b) => +new Date(a.start_at) - +new Date(b.start_at))
  }, [blockedRanges, date])

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

      if (isTimeBlocked(date, startTime, endTime)) {
        setError("Este horário já está reservado")
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
      payload.period = ""
    }

    if (bookingMode === "period") {
      payload.period = period
    }

    if (bookingMode === "day") {
      payload.period = "day"
    }

    if (bookingMode === "exclusive") {
      payload.period = "day"
      payload.reservation_type = "exclusive"
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
    } catch {
      setError("Erro ao processar pagamento")
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div style={overlay}>
      <div style={modal}>
        <div style={headerRow}>
          <div>
            <h2 style={title}>Reservar {propertyTitle}</h2>
            <p style={subtitle}>
              {loadingBlocks ? "Carregando disponibilidade..." : "Escolha uma data e uma modalidade"}
            </p>
          </div>

          <button type="button" onClick={onClose} style={closeButton}>
            Fechar
          </button>
        </div>

        <div style={section}>
          <label style={label}>Nome</label>
          <input
            placeholder="Digite seu nome"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={section}>
          <label style={label}>Email</label>
          <input
            placeholder="Digite seu email"
            value={guestEmail}
            onChange={(e) => setGuestEmail(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={section}>
          <label style={label}>Data</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={dateInputStyle}
          />
          {date && <span style={helperText}>Selecionado: {formatDateBR(date)}</span>}
        </div>

        {selectedDayBlocks.length > 0 && (
          <div style={blocksBox}>
            <strong style={{ fontSize: 14 }}>Bloqueios nesse dia</strong>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {selectedDayBlocks.map((block, index) => (
                <div key={`${block.id || index}`} style={blockLine}>
                  {new Date(block.start_at).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  -{" "}
                  {new Date(block.end_at).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {block.status ? ` · ${block.status}` : ""}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={section}>
          <label style={label}>Tipo de reserva</label>
          <select
            value={bookingMode}
            onChange={(e) => setBookingMode(e.target.value as BookingMode)}
            style={selectStyle}
          >
            <option value="time">Por horário</option>
            <option value="period">Por período</option>
            <option value="day">Diária</option>
            <option value="exclusive">Exclusiva</option>
          </select>
        </div>

        {bookingMode === "time" && (
          <div style={gridTwo}>
            <div style={section}>
              <label style={label}>Hora inicial</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => {
                  const newStart = e.target.value
                  setError("")

                  if (isTimeBlocked(date, newStart, endTime)) {
                    setError("Horário indisponível")
                    return
                  }

                  setStartTime(newStart)
                }}
                style={inputStyle}
              />
            </div>

            <div style={section}>
              <label style={label}>Hora final</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => {
                  const newEnd = e.target.value
                  setError("")

                  if (isTimeBlocked(date, startTime, newEnd)) {
                    setError("Horário indisponível")
                    return
                  }

                  setEndTime(newEnd)
                }}
                style={inputStyle}
              />
            </div>
          </div>
        )}

        {bookingMode === "period" && (
          <div style={section}>
            <label style={label}>Período</label>
            <select value={period} onChange={(e) => setPeriod(e.target.value)} style={selectStyle}>
              <option value="">Selecione</option>
              <option value="morning">Manhã</option>
              <option value="afternoon">Tarde</option>
              <option value="evening">Noite</option>
            </select>
          </div>
        )}

        <div style={section}>
          <label style={label}>Plano</label>

          <div style={radioGroup}>
            <label style={radioItem}>
              <input
                type="radio"
                checked={planMode === "one_time"}
                onChange={() => setPlanMode("one_time")}
              />
              <span>Reserva única</span>
            </label>

            <label style={radioItem}>
              <input
                type="radio"
                checked={planMode === "weekly_monthly"}
                onChange={() => setPlanMode("weekly_monthly")}
              />
              <span>Plano semanal (cobrança mensal)</span>
            </label>
          </div>
        </div>

        {planMode === "weekly_monthly" && (
          <div style={planBox}>
            <div style={section}>
              <label style={label}>Dia da semana</label>
              <select value={weekday} onChange={(e) => setWeekday(e.target.value)} style={selectStyle}>
                <option value="1">Segunda</option>
                <option value="2">Terça</option>
                <option value="3">Quarta</option>
                <option value="4">Quinta</option>
                <option value="5">Sexta</option>
              </select>
            </div>

            <div style={section}>
              <label style={label}>Meses de compromisso</label>
              <input
                type="number"
                value={months}
                onChange={(e) => setMonths(Number(e.target.value))}
                min={1}
                style={inputStyle}
              />
            </div>

            <p style={warningText}>Cancelamento antecipado cobra 1 mensalidade.</p>
          </div>
        )}

        <div style={summaryBox}>
          <p style={summaryLine}>Duração: {duration}h</p>

          {bookingMode === "time" ? (
            <p style={summaryLine}>Valor estimado: R$ {estimatedTimePrice}</p>
          ) : (
            <p style={summaryLine}>Preço definido pelo proprietário</p>
          )}
        </div>

        {error && <p style={errorText}>{error}</p>}

        <button onClick={handleCheckout} disabled={loading} style={primaryButton}>
          {loading ? "Processando..." : "Confirmar reserva"}
        </button>
      </div>
    </div>
  )
}

const overlay = {
  position: "fixed" as const,
  inset: 0,
  background: "rgba(15, 23, 42, 0.55)",
  backdropFilter: "blur(4px)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 9999,
  padding: 16,
}

const modal = {
  background: "linear-gradient(180deg, #ffffff 0%, #fafafa 100%)",
  padding: 22,
  borderRadius: 18,
  display: "flex",
  flexDirection: "column" as const,
  gap: 14,
  width: "min(560px, 96vw)",
  maxHeight: "90vh",
  overflowY: "auto" as const,
  boxShadow: "0 24px 80px rgba(15, 23, 42, 0.25)",
  border: "1px solid rgba(148, 163, 184, 0.25)",
}

const headerRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
}

const title = {
  margin: 0,
  fontSize: 22,
  lineHeight: 1.2,
  color: "#0f172a",
}

const subtitle = {
  margin: "4px 0 0",
  fontSize: 13,
  color: "#64748b",
}

const closeButton = {
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  background: "#fff",
  cursor: "pointer",
  fontWeight: 600,
  color: "#0f172a",
}

const section = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 8,
}

const label = {
  fontSize: 13,
  fontWeight: 700,
  color: "#334155",
}

const inputStyle = {
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#0f172a",
  width: "100%",
  fontSize: 14,
  outline: "none",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)",
}

const dateInputStyle = {
  ...inputStyle,
  colorScheme: "light" as const,
}

const selectStyle = {
  ...inputStyle,
  cursor: "pointer",
}

const helperText = {
  fontSize: 12,
  color: "#64748b",
}

const gridTwo = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
}

const radioGroup = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 10,
  padding: 12,
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
}

const radioItem = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontSize: 14,
  color: "#0f172a",
}

const planBox = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 12,
  padding: 14,
  borderRadius: 14,
  border: "1px solid #e2e8f0",
  background: "#f8fafc",
}

const warningText = {
  margin: 0,
  color: "#b91c1c",
  fontSize: 13,
  fontWeight: 600,
}

const summaryBox = {
  padding: 14,
  borderRadius: 14,
  border: "1px solid #e2e8f0",
  background: "#fff",
  display: "flex",
  flexDirection: "column" as const,
  gap: 6,
}

const summaryLine = {
  margin: 0,
  color: "#0f172a",
  fontSize: 14,
}

const errorText = {
  margin: 0,
  color: "#b91c1c",
  fontWeight: 600,
  fontSize: 14,
}

const primaryButton = {
  padding: "12px 16px",
  borderRadius: 12,
  border: "none",
  background: "#0f172a",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 15,
  transition: "transform 0.15s ease, opacity 0.15s ease",
}

const blocksBox = {
  border: "1px solid #e2e8f0",
  background: "#f8fafc",
  borderRadius: 14,
  padding: 12,
  display: "flex",
  flexDirection: "column" as const,
  gap: 8,
}

const blockLine = {
  fontSize: 13,
  color: "#7f1d1d",
  background: "#fff",
  border: "1px solid #fecaca",
  borderRadius: 10,
  padding: "8px 10px",
}