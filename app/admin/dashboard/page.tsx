"use client"

import { useEffect, useMemo, useState } from "react"
import OwnerCalendar from "@/components/OwnerCalendar"

type Property = {
  id: number
  title: string
  price_per_hour: number
}

type Booking = {
  id: string
  contract_id?: string | null
  property_id: number
  guest_name: string
  guest_email: string
  date: string
  period?: string | null
  start_time?: string | null
  end_time?: string | null
  duration_hours?: number | null
  recurrence_type?: string | null
  recurrence_interval?: number | null
  recurrence_count?: number | null
}

type ContractGroup = {
  contractId: string
  propertyId: number
  propertyTitle: string
  guestName: string
  guestEmail: string
  recurrenceType: string
  recurrenceInterval: number
  recurrenceCount: number
  period?: string | null
  startTime?: string | null
  endTime?: string | null
  durationHours?: number | null
  firstDate: string
  bookings: Booking[]
}

export default function OwnerDashboard() {
  const [data, setData] = useState<{ properties: Property[]; bookings: Booking[] }>({
    properties: [],
    bookings: [],
  })
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string>("")
  const [message, setMessage] = useState("")

  const email = "gustavoaudi29@gmail.com"

  useEffect(() => {
    async function load() {
      setLoading(true)
      setMessage("")

      try {
        const res = await fetch(`/api/owner-bookings?email=${email}`)
        const json = await res.json()

        setData({
          properties: Array.isArray(json?.properties) ? json.properties : [],
          bookings: Array.isArray(json?.bookings) ? json.bookings : [],
        })
      } catch (error) {
        console.error(error)
        setData({ properties: [], bookings: [] })
        setMessage("Erro ao carregar dados.")
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  const properties = data?.properties || []
  const bookings = data?.bookings || []

  const totalRevenue = useMemo(() => {
    return bookings.reduce((acc: number, b: Booking) => {
      const property = properties.find((p) => p.id === b.property_id)
      if (!property) return acc

      const duration = Number(b.duration_hours || 1)
      return acc + property.price_per_hour * duration
    }, 0)
  }, [bookings, properties])

  const recurringContracts = useMemo(() => {
    const map = new Map<string, ContractGroup>()

    for (const booking of bookings) {
      if (!booking.contract_id) continue
      if (!booking.recurrence_type || booking.recurrence_type === "none") continue

      const property = properties.find((p) => p.id === booking.property_id)
      if (!property) continue

      const existing = map.get(booking.contract_id)

      if (!existing) {
        map.set(booking.contract_id, {
          contractId: booking.contract_id,
          propertyId: booking.property_id,
          propertyTitle: property.title,
          guestName: booking.guest_name,
          guestEmail: booking.guest_email,
          recurrenceType: booking.recurrence_type || "weekly_monthly",
          recurrenceInterval: Number(booking.recurrence_interval || 1),
          recurrenceCount: Number(booking.recurrence_count || 1),
          period: booking.period,
          startTime: booking.start_time,
          endTime: booking.end_time,
          durationHours: booking.duration_hours,
          firstDate: booking.date,
          bookings: [booking],
        })
      } else {
        existing.bookings.push(booking)
        if (booking.date < existing.firstDate) {
          existing.firstDate = booking.date
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => a.firstDate.localeCompare(b.firstDate))
  }, [bookings, properties])

  async function handleCancelContract(contractId: string) {
    if (!confirm("Tem certeza que deseja cancelar este plano?")) return

    setActionLoading(contractId)
    setMessage("")

    try {
      const res = await fetch("/api/contracts/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contract_id: contractId,
        }),
      })

      const json = await res.json()

      if (!res.ok) {
        setMessage(json?.error || "Erro ao cancelar contrato.")
        setActionLoading("")
        return
      }

      setMessage(
        json?.penalty_charged
          ? "Contrato cancelado e multa cobrada automaticamente."
          : "Contrato cancelado sem multa."
      )

      const refresh = await fetch(`/api/owner-bookings?email=${email}`)
      const refreshJson = await refresh.json()

      setData({
        properties: Array.isArray(refreshJson?.properties) ? refreshJson.properties : [],
        bookings: Array.isArray(refreshJson?.bookings) ? refreshJson.bookings : [],
      })
    } catch (error) {
      console.error(error)
      setMessage("Erro inesperado ao cancelar contrato.")
    } finally {
      setActionLoading("")
    }
  }

  if (loading) return <p style={{ padding: 40 }}>Carregando...</p>

  return (
    <div style={{ padding: 40, maxWidth: 1100, margin: "0 auto" }}>
      <h1>Painel do proprietário</h1>

      {message && (
        <div style={notice}>
          {message}
        </div>
      )}

      {/* RESUMO */}
      <div style={{ display: "flex", gap: 20, marginBottom: 40, flexWrap: "wrap" }}>
        <div style={card}>
          <h3>{properties.length}</h3>
          <p>Espaços</p>
        </div>

        <div style={card}>
          <h3>{bookings.length}</h3>
          <p>Reservas</p>
        </div>

        <div style={card}>
          <h3>R$ {totalRevenue}</h3>
          <p>Receita estimada</p>
        </div>

        <div style={card}>
          <h3>{recurringContracts.length}</h3>
          <p>Planos recorrentes</p>
        </div>
      </div>

      {/* PLANOS RECORRENTES */}
      <h2>Planos recorrentes</h2>

      {recurringContracts.length === 0 && (
        <p>Nenhum plano recorrente encontrado.</p>
      )}

      {recurringContracts.map((contract) => (
        <div key={contract.contractId} style={contractBox}>
          <div style={contractHeader}>
            <div>
              <h3 style={{ margin: 0 }}>{contract.propertyTitle}</h3>
              <p style={{ margin: "6px 0 0", color: "#6b7280" }}>
                {contract.guestName} · {contract.guestEmail}
              </p>
            </div>

            <button
              onClick={() => handleCancelContract(contract.contractId)}
              disabled={actionLoading === contract.contractId}
              style={dangerButton}
            >
              {actionLoading === contract.contractId ? "Cancelando..." : "Cancelar plano"}
            </button>
          </div>

          <div style={contractGrid}>
            <div>
              <strong>Tipo:</strong> {contract.recurrenceType}
            </div>
            <div>
              <strong>Intervalo:</strong> {contract.recurrenceInterval}
            </div>
            <div>
              <strong>Repetições:</strong> {contract.recurrenceCount}
            </div>
            <div>
              <strong>Data inicial:</strong> {contract.firstDate}
            </div>
            <div>
              <strong>Período:</strong>{" "}
              {contract.period || "—"}
            </div>
            <div>
              <strong>Horário:</strong>{" "}
              {contract.startTime && contract.endTime
                ? `${contract.startTime} - ${contract.endTime}`
                : "—"}
            </div>
          </div>

          <p style={{ marginTop: 12, marginBottom: 0 }}>
            <strong>Ocorrências geradas:</strong> {contract.bookings.length}
          </p>
        </div>
      ))}

      {/* ESPAÇOS + CALENDÁRIO */}
      <h2 style={{ marginTop: 40 }}>Seus espaços</h2>

      {properties.length === 0 && <p>Você não possui espaços cadastrados</p>}

      {properties.map((p) => (
        <div key={p.id} style={box}>
          <h3>{p.title}</h3>
          <p>R$ {p.price_per_hour}/hora</p>

          <OwnerCalendar propertyId={p.id} />
        </div>
      ))}
    </div>
  )
}

const card: React.CSSProperties = {
  flex: "1 1 220px",
  background: "#f5f5f5",
  padding: 20,
  borderRadius: 12,
  textAlign: "center",
}

const box: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 12,
  padding: 20,
  marginTop: 20,
  background: "#fff",
}

const notice: React.CSSProperties = {
  margin: "16px 0 24px",
  padding: "12px 14px",
  borderRadius: 10,
  background: "#f9fafb",
  border: "1px solid #e5e7eb",
  color: "#111827",
}

const contractBox: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 16,
  marginTop: 16,
  background: "#fafafa",
}

const contractHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "start",
  marginBottom: 14,
  flexWrap: "wrap",
}

const contractGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
}

const dangerButton: React.CSSProperties = {
  border: "none",
  background: "#ef4444",
  color: "#fff",
  padding: "10px 14px",
  borderRadius: 10,
  cursor: "pointer",
  fontWeight: 600,
}