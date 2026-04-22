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

const BACKEND_URL = "https://checkout-backend-beta.vercel.app"

function parseTime(time: string) {
  const [h, m] = time.split(":").map(Number)
  return h * 60 + m
}

function calcDuration(start: string, end: string) {
  const diff = parseTime(end) - parseTime(start)
  return Math.max(1, Math.ceil(diff / 60))
}

export default function ReservationModal({
  isOpen,
  onClose,
  propertyId,
  pricePerHour,
  propertyTitle = "Espaço",
  defaultDate = "",
}: Props) {
  const [guestName, setGuestName] = useState("")
  const [guestEmail, setGuestEmail] = useState("")
  const [date, setDate] = useState(defaultDate)

  const [bookingMode, setBookingMode] = useState<BookingMode>("time")
  const [startTime, setStartTime] = useState("08:00")
  const [endTime, setEndTime] = useState("09:00")

  const [blockedRanges, setBlockedRanges] = useState<any[]>([])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    fetchBlocks()
  }, [isOpen])

  async function fetchBlocks() {
    const today = new Date()
    const future = new Date()
    future.setMonth(today.getMonth() + 2)

    const res = await fetch(
      `${BACKEND_URL}/api/get-booking-blocks?property_id=${propertyId}&start_date=${today.toISOString()}&end_date=${future.toISOString()}`
    )

    const data = await res.json()
    setBlockedRanges(data.blocks || [])
  }

  function isTimeBlocked(date: string, start: string, end: string) {
    const startAt = new Date(`${date}T${start}:00`)
    const endAt = new Date(`${date}T${end}:00`)

    return blockedRanges.some((b) => {
      const s = new Date(b.start_at)
      const e = new Date(b.end_at)
      return startAt < e && endAt > s
    })
  }

  const selectedDayBlocks = useMemo(() => {
    if (!date) return []

    return blockedRanges.filter((b) =>
      new Date(b.start_at).toISOString().slice(0, 10) === date
    )
  }, [blockedRanges, date])

  async function handleCheckout() {
    setError("")

    if (!guestName || !guestEmail || !date) {
      setError("Preencha tudo")
      return
    }

    if (isTimeBlocked(date, startTime, endTime)) {
      setError("Horário já reservado")
      return
    }

    setLoading(true)

    try {
      const res = await fetch(
        `${BACKEND_URL}/api/create-checkout-session`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            property_id: propertyId,
            guest_name: guestName,
            guest_email: guestEmail,
            date,
            start_time: startTime,
            end_time: endTime,
          }),
        }
      )

      const data = await res.json()
      window.location.href = data.url
    } catch {
      setError("Erro")
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div style={overlay}>
      <div style={modal}>
        
        {/* 🔥 DEBUG */}
        <h2 style={{ background: "yellow", padding: 10 }}>
          DEBUG MODAL 🚨
        </h2>

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

        {/* DISPONIBILIDADE */}
        {date && (
          <div style={{ background: "#eee", padding: 10 }}>
            {selectedDayBlocks.length === 0 ? (
              <p style={{ color: "green" }}>Dia livre</p>
            ) : (
              <>
                <p style={{ color: "red" }}>Ocupado:</p>
                {selectedDayBlocks.map((b, i) => (
                  <div key={i}>
                    {new Date(b.start_at).toLocaleTimeString("pt-BR")} -{" "}
                    {new Date(b.end_at).toLocaleTimeString("pt-BR")}
                  </div>
                ))}
              </>
            )}
          </div>
        )}

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

        {error && <p style={{ color: "red" }}>{error}</p>}

        <button onClick={handleCheckout}>
          {loading ? "..." : "Reservar"}
        </button>

        <button onClick={onClose}>Fechar</button>
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
  width: 400,
}