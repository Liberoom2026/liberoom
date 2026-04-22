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

function pad(n: number) {
  return String(n).padStart(2, "0")
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number)
  return new Date(year, month - 1, day)
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1)
}

function getMonthLabel(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(date)
}

function buildMonthGrid(monthDate: Date) {
  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startWeekday = (firstDay.getDay() + 6) % 7
  const totalDays = lastDay.getDate()

  const cells: Array<Date | null> = []

  for (let i = 0; i < startWeekday; i++) {
    cells.push(null)
  }

  for (let day = 1; day <= totalDays; day++) {
    cells.push(new Date(year, month, day))
  }

  while (cells.length % 7 !== 0) {
    cells.push(null)
  }

  return cells
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
  const [currentMonth, setCurrentMonth] = useState<Date>(
    startOfMonth(defaultDate ? parseDateKey(defaultDate) : new Date())
  )

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

    const baseDate = defaultDate ? parseDateKey(defaultDate) : new Date()
    setCurrentMonth(startOfMonth(baseDate))
    fetchBlocks()
  }, [isOpen, defaultDate, defaultPeriod, propertyId])

  async function fetchBlocks() {
    if (!propertyId) return

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

  function getDayStatus(day: Date) {
    const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0)
    const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999)

    let hasAnyOverlap = false
    let hasFullDayBlock = false

    for (const block of blockedRanges) {
      const blockStart = new Date(block.start_at)
      const blockEnd = new Date(block.end_at)

      const overlaps = blockStart <= dayEnd && blockEnd >= dayStart
      if (overlaps) {
        hasAnyOverlap = true

        if (blockStart <= dayStart && blockEnd >= dayEnd) {
          hasFullDayBlock = true
          break
        }
      }
    }

    if (hasFullDayBlock) return "occupied"
    if (hasAnyOverlap) return "partial"
    return "free"
  }

  const selectedDayBlocks = useMemo(() => {
    if (!date) return []

    return blockedRanges
      .filter((block) => {
        const blockStart = new Date(block.start_at)
        return toDateKey(blockStart) === date
      })
      .sort((a, b) => +new Date(a.start_at) - +new Date(b.start_at))
  }, [blockedRanges, date])

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
    } catch (err) {
      setError("Erro ao processar pagamento")
      setLoading(false)
    }
  }

  if (!isOpen) return null

  const monthCells = buildMonthGrid(currentMonth)

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

        <div style={calendarCard}>
          <div style={calendarHeader}>
            <button
              type="button"
              style={navButton}
              onClick={() => setCurrentMonth((prev) => addMonths(prev, -1))}
            >
              ←
            </button>

            <strong style={{ textTransform: "capitalize" }}>
              {getMonthLabel(currentMonth)}
            </strong>

            <button
              type="button"
              style={navButton}
              onClick={() => setCurrentMonth((prev) => addMonths(prev, 1))}
            >
              →
            </button>
          </div>

          <div style={weekHeader}>
            {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((day) => (
              <div key={day} style={weekDayLabel}>
                {day}
              </div>
            ))}
          </div>

          <div style={calendarGrid}>
            {monthCells.map((cell, index) => {
              if (!cell) {
                return <div key={`empty-${index}`} style={emptyDayCell} />
              }

              const key = toDateKey(cell)
              const status = getDayStatus(cell)
              const isSelected = date === key
              const isDisabled = status === "occupied"

              return (
                <button
                  key={key}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => {
                    setDate(key)
                    setError("")
                  }}
                  style={{
                    ...dayCell,
                    ...(status === "free" ? dayFree : {}),
                    ...(status === "partial" ? dayPartial : {}),
                    ...(status === "occupied" ? dayOccupied : {}),
                    ...(isSelected ? daySelected : {}),
                    ...(isDisabled ? dayDisabled : {}),
                  }}
                >
                  {cell.getDate()}
                </button>
              )
            })}
          </div>

          <div style={legendRow}>
            <div style={legendItem}>
              <span style={{ ...legendDot, background: "#e5f7eb" }} />
              Livre
            </div>
            <div style={legendItem}>
              <span style={{ ...legendDot, background: "#fff3cd" }} />
              Parcial
            </div>
            <div style={legendItem}>
              <span style={{ ...legendDot, background: "#f8d7da" }} />
              Ocupado
            </div>
          </div>
        </div>

        <div>
          <strong>Data selecionada:</strong>{" "}
          {date ? new Intl.DateTimeFormat("pt-BR").format(parseDateKey(date)) : "nenhuma"}
        </div>

        {selectedDayBlocks.length > 0 && (
          <div style={blocksBox}>
            <strong>Bloqueios nesse dia</strong>
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
              onChange={(e) => {
                const newStart = e.target.value
                setError("")

                if (isTimeBlocked(date, newStart, endTime)) {
                  setError("Horário indisponível")
                  return
                }

                setStartTime(newStart)
              }}
            />
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
          <p>Preço definido pelo proprietário</p>
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

const calendarCard = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 12,
  background: "#fafafa",
  display: "flex",
  flexDirection: "column" as const,
  gap: 10,
}

const calendarHeader = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
}

const navButton = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  background: "white",
  cursor: "pointer",
  minWidth: 40,
}

const weekHeader = {
  display: "grid",
  gridTemplateColumns: "repeat(7, 1fr)",
  gap: 6,
}

const weekDayLabel = {
  textAlign: "center" as const,
  fontSize: 12,
  fontWeight: 600,
  color: "#6b7280",
}

const calendarGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(7, 1fr)",
  gap: 6,
}

const emptyDayCell = {
  minHeight: 40,
}

const dayCell = {
  minHeight: 40,
  borderRadius: 10,
  border: "1px solid #d1d5db",
  background: "white",
  cursor: "pointer",
  fontWeight: 600,
}

const dayFree = {
  background: "#e5f7eb",
}

const dayPartial = {
  background: "#fff3cd",
}

const dayOccupied = {
  background: "#f8d7da",
}

const daySelected = {
  outline: "2px solid #111827",
  outlineOffset: 1,
}

const dayDisabled = {
  cursor: "not-allowed",
  opacity: 0.75,
}

const legendRow = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap" as const,
  fontSize: 12,
}

const legendItem = {
  display: "flex",
  alignItems: "center",
  gap: 6,
}

const legendDot = {
  width: 12,
  height: 12,
  borderRadius: 999,
  display: "inline-block",
  border: "1px solid #d1d5db",
}

const blocksBox = {
  border: "1px solid #f3c7cc",
  background: "#fff5f6",
  borderRadius: 10,
  padding: 10,
  display: "flex",
  flexDirection: "column" as const,
  gap: 8,
}

const blockLine = {
  fontSize: 13,
  color: "#7f1d1d",
}