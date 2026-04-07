"use client"

import { useEffect, useMemo, useState } from "react"
import Calendar from "react-calendar"
import "react-calendar/dist/Calendar.css"

type BlockItem = {
  id: string
  date: string
  period?: string | null
  start_time?: string | null
  end_time?: string | null
}

export default function OwnerCalendar({ propertyId }: any) {
  const [availability, setAvailability] = useState<any>({})
  const [blocks, setBlocks] = useState<BlockItem[]>([])
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [status, setStatus] = useState<string>("")
  const [loading, setLoading] = useState(false)
  const [startTime, setStartTime] = useState("08:00")
  const [endTime, setEndTime] = useState("09:00")

  function formatLocalDate(date: Date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
  }

  function parseTimeToMinutes(time: string) {
    const [h, m] = time.split(":").map(Number)
    return h * 60 + m
  }

  function minutesToTime(mins: number) {
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
  }

  function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
    return aStart < bEnd && bStart < aEnd
  }

  function periodToInterval(period: string) {
    if (period === "morning") return { start: 8 * 60, end: 12 * 60 }
    if (period === "afternoon") return { start: 12 * 60, end: 18 * 60 }
    if (period === "evening") return { start: 18 * 60, end: 22 * 60 }
    if (period === "day" || period === "exclusive") return { start: 0, end: 24 * 60 }
    return null
  }

  function itemToInterval(item: BlockItem) {
    if (item.period) return periodToInterval(item.period)

    if (item.start_time && item.end_time) {
      return {
        start: parseTimeToMinutes(item.start_time),
        end: parseTimeToMinutes(item.end_time),
      }
    }

    return null
  }

  async function loadData() {
    setLoading(true)

    try {
      const start = new Date()
      const end = new Date()
      end.setMonth(end.getMonth() + 2)

      const startStr = formatLocalDate(start)
      const endStr = formatLocalDate(end)

      const resAvailability = await fetch(
        `/api/availability?property_id=${propertyId}&start=${startStr}&end=${endStr}`
      )
      const availabilityData = await resAvailability.json()

      const resBlocks = await fetch(
        `/api/blocks/list?property_id=${propertyId}&start=${startStr}&end=${endStr}`
      )
      const blocksData = await resBlocks.json()

      setAvailability(availabilityData || {})
      setBlocks(Array.isArray(blocksData) ? blocksData : [])
    } catch (err) {
      console.error(err)
      setStatus("Erro ao carregar calendário")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [propertyId])

  const selectedDateKey = useMemo(() => {
    if (!selectedDate) return null
    return formatLocalDate(selectedDate)
  }, [selectedDate])

  const dayBlocks = useMemo(() => {
    if (!selectedDateKey) return []
    return blocks.filter((b) => b.date === selectedDateKey)
  }, [blocks, selectedDateKey])

  function isPeriodBlocked(dateStr: string, period: string) {
    const day = availability[dateStr] || {
      morning: true,
      afternoon: true,
      evening: true,
    }

    if (period === "morning") return !day.morning
    if (period === "afternoon") return !day.afternoon
    if (period === "evening") return !day.evening

    return false
  }

  function isHourBlocked(dateStr: string, start: string, end: string) {
    const slotStart = parseTimeToMinutes(start)
    const slotEnd = parseTimeToMinutes(end)

    for (const block of dayBlocks) {
      if (block.period === "day" || block.period === "exclusive") {
        return true
      }

      if (block.period) {
        const interval = periodToInterval(block.period)
        if (!interval) continue

        if (overlaps(slotStart, slotEnd, interval.start, interval.end)) {
          return true
        }

        continue
      }

      if (block.start_time && block.end_time) {
        const blockInterval = itemToInterval(block)
        if (!blockInterval) continue

        if (overlaps(slotStart, slotEnd, blockInterval.start, blockInterval.end)) {
          return true
        }
      }
    }

    return false
  }

  function tileContent({ date }: any) {
    const key = formatLocalDate(date)
    const day = availability[key]

    if (!day) return null

    return (
      <div style={{ marginTop: 4 }}>
        <div style={{ display: "flex", justifyContent: "center", gap: 2 }}>
          {!day.morning ? <Dot color="#ef4444" /> : <Dot color="#22c55e" />}
          {!day.afternoon ? <Dot color="#ef4444" /> : <Dot color="#22c55e" />}
          {!day.evening ? <Dot color="#ef4444" /> : <Dot color="#22c55e" />}
        </div>
      </div>
    )
  }

  async function handleBlockPeriod(period: string) {
    if (!selectedDateKey) return

    setStatus("Salvando...")

    const res = await fetch("/api/blocks/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        property_id: propertyId,
        date: selectedDateKey,
        period,
      }),
    })

    const data = await res.json().catch(() => null)

    if (!res.ok) {
      setStatus(data?.error || `Erro ao bloquear (${res.status})`)
      return
    }

    setStatus("Bloqueio salvo")
    await loadData()
  }

  async function handleBlockRange(start: string, end: string) {
    if (!selectedDateKey) return

    if (!start || !end) {
      setStatus("Preencha início e fim")
      return
    }

    if (parseTimeToMinutes(end) <= parseTimeToMinutes(start)) {
      setStatus("O horário final precisa ser maior que o inicial")
      return
    }

    setStatus("Salvando...")

    const res = await fetch("/api/blocks/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        property_id: propertyId,
        date: selectedDateKey,
        start_time: start,
        end_time: end,
      }),
    })

    const data = await res.json().catch(() => null)

    if (!res.ok) {
      setStatus(data?.error || `Erro ao bloquear (${res.status})`)
      return
    }

    setStatus("Horário salvo")
    await loadData()
  }

  async function handleDeleteBlock(block: BlockItem) {
    setStatus("Removendo...")

    const res = await fetch("/api/blocks/delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: block.id,
      }),
    })

    const data = await res.json().catch(() => null)

    if (!res.ok) {
      setStatus(data?.error || `Erro ao remover (${res.status})`)
      return
    }

    setStatus("Removido")
    await loadData()
  }

  function renderDaySummary() {
    if (!selectedDateKey) return null

    const day = availability[selectedDateKey] || {
      morning: true,
      afternoon: true,
      evening: true,
    }

    return (
      <div style={card}>
        <h3 style={{ marginBottom: 10 }}>Detalhes do dia</h3>

        <StatusRow label="Manhã" value={day.morning ? "Livre" : "Indisponível"} ok={day.morning} />
        <StatusRow label="Tarde" value={day.afternoon ? "Livre" : "Indisponível"} ok={day.afternoon} />
        <StatusRow label="Noite" value={day.evening ? "Livre" : "Indisponível"} ok={day.evening} />

        <div style={{ marginTop: 15, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <ActionButton onClick={() => handleBlockPeriod("morning")}>Bloquear manhã</ActionButton>
          <ActionButton onClick={() => handleBlockPeriod("afternoon")}>Bloquear tarde</ActionButton>
          <ActionButton onClick={() => handleBlockPeriod("evening")}>Bloquear noite</ActionButton>
          <ActionButton onClick={() => handleBlockPeriod("day")}>Bloquear dia inteiro</ActionButton>
        </div>
      </div>
    )
  }

  function renderTimeGrid() {
    if (!selectedDateKey) return null

    const slots = []
    for (let h = 8; h < 22; h++) {
      const start = minutesToTime(h * 60)
      const end = minutesToTime((h + 1) * 60)
      const blocked = isHourBlocked(selectedDateKey, start, end)

      slots.push({ start, end, blocked })
    }

    return (
      <div style={card}>
        <h3 style={{ marginBottom: 10 }}>Horários do dia</h3>

        <div style={{ display: "grid", gap: 8 }}>
          {slots.map((slot) => (
            <div
              key={`${slot.start}-${slot.end}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: slot.blocked ? "#fff1f2" : "#f8fafc",
              }}
            >
              <div>
                <strong>{slot.start}</strong> - {slot.end}
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ color: slot.blocked ? "#ef4444" : "#16a34a" }}>
                  {slot.blocked ? "Bloqueado" : "Livre"}
                </span>

                {!slot.blocked && (
                  <button
                    onClick={() => handleBlockRange(slot.start, slot.end)}
                    style={smallButton}
                  >
                    Bloquear
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
          <h4 style={{ margin: 0 }}>Bloquear intervalo personalizado</h4>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              style={input}
            />

            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              style={input}
            />

            <button onClick={() => handleBlockRange(startTime, endTime)} style={primaryButton}>
              Bloquear horário
            </button>
          </div>
        </div>
      </div>
    )
  }

  function renderBlocksList() {
    if (!selectedDateKey) return null

    if (dayBlocks.length === 0) {
      return (
        <div style={card}>
          <h3 style={{ marginBottom: 10 }}>Bloqueios do dia</h3>
          <p style={{ margin: 0 }}>Nenhum bloqueio criado para este dia.</p>
        </div>
      )
    }

    return (
      <div style={card}>
        <h3 style={{ marginBottom: 10 }}>Bloqueios do dia</h3>

        <div style={{ display: "grid", gap: 8 }}>
          {dayBlocks.map((block) => (
            <div
              key={block.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#fff",
              }}
            >
              <div>
                {block.period ? (
                  <strong>{labelForPeriod(block.period)}</strong>
                ) : (
                  <>
                    <strong>{normalizeTime(block.start_time)}</strong> - {normalizeTime(block.end_time)}
                  </>
                )}
              </div>

              <button onClick={() => handleDeleteBlock(block)} style={dangerButton}>
                Remover
              </button>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 20 }}>
      {loading && <p>Carregando...</p>}

      <div style={calendarWrapper}>
        <Calendar
          onClickDay={(date) => setSelectedDate(date)}
          tileContent={tileContent}
        />
      </div>

      {selectedDateKey && (
        <div style={{ marginTop: 18, display: "grid", gap: 16 }}>
          {renderDaySummary()}
          {renderTimeGrid()}
          {renderBlocksList()}
        </div>
      )}

      {status && <p style={{ marginTop: 12 }}>{status}</p>}
    </div>
  )
}

function normalizeTime(value?: string | null) {
  if (!value) return "--:--"
  return value.slice(0, 5)
}

function labelForPeriod(period: string) {
  if (period === "morning") return "Manhã"
  if (period === "afternoon") return "Tarde"
  if (period === "evening") return "Noite"
  if (period === "day") return "Dia inteiro"
  if (period === "exclusive") return "Exclusivo"
  return period
}

function Dot({ color }: any) {
  return (
    <div
      style={{
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: color,
      }}
    />
  )
}

function StatusRow({ label, value, ok }: any) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
      <span>{label}</span>
      <span style={{ color: ok ? "#16a34a" : "#dc2626" }}>{value}</span>
    </div>
  )
}

function ActionButton({ children, onClick }: any) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "9px 14px",
        borderRadius: 10,
        border: "none",
        cursor: "pointer",
        background: "#111827",
        color: "#fff",
      }}
    >
      {children}
    </button>
  )
}

const card: React.CSSProperties = {
  padding: 16,
  borderRadius: 14,
  border: "1px solid #e5e7eb",
  background: "#fff",
}

const calendarWrapper: React.CSSProperties = {
  padding: 12,
  borderRadius: 14,
  border: "1px solid #e5e7eb",
  background: "#fff",
}

const primaryButton: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "none",
  cursor: "pointer",
  background: "#111827",
  color: "#fff",
}

const dangerButton: React.CSSProperties = {
  padding: "9px 14px",
  borderRadius: 10,
  border: "none",
  cursor: "pointer",
  background: "#ef4444",
  color: "#fff",
}

const smallButton: React.CSSProperties = {
  padding: "7px 11px",
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
  background: "#111827",
  color: "#fff",
  fontSize: 12,
}

const input: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
}