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
  const [message, setMessage] = useState("")

  const email = "gustavoaudi29@gmail.com"

  useEffect(() => {
    async function load() {
      setLoading(true)

      const res = await fetch(`/api/owner-bookings?email=${email}`)
      const json = await res.json()

      setData({
        properties: json.properties || [],
        bookings: json.bookings || [],
      })

      setLoading(false)
    }

    load()
  }, [])

  const properties = data.properties
  const bookings = data.bookings

  const recurringContracts = useMemo(() => {
    const map = new Map<string, ContractGroup>()

    for (const booking of bookings) {
      if (!booking.contract_id) continue
      if (!booking.recurrence_type) continue

      const property = properties.find((p) => p.id === booking.property_id)
      if (!property) continue

      if (!map.has(booking.contract_id)) {
        map.set(booking.contract_id, {
          contractId: booking.contract_id,
          propertyId: booking.property_id,
          propertyTitle: property.title,
          guestName: booking.guest_name,
          guestEmail: booking.guest_email,
          recurrenceType: booking.recurrence_type,
          recurrenceInterval: booking.recurrence_interval || 1,
          recurrenceCount: booking.recurrence_count || 1,
          durationHours: booking.duration_hours,
          firstDate: booking.date,
          bookings: [booking],
        })
      } else {
        map.get(booking.contract_id)!.bookings.push(booking)
      }
    }

    return Array.from(map.values())
  }, [bookings, properties])

  const totalRevenue = useMemo(() => {
    return bookings.reduce((acc, b) => {
      const property = properties.find((p) => p.id === b.property_id)
      if (!property) return acc
      return acc + property.price_per_hour * (b.duration_hours || 1)
    }, 0)
  }, [bookings, properties])

  if (loading) return <p style={{ padding: 40 }}>Carregando...</p>

  return (
    <div style={{ padding: 40, maxWidth: 1100, margin: "0 auto" }}>
      <h1>Painel do proprietário</h1>

      {message && <div style={notice}>{message}</div>}

      {/* RESUMO */}
      <div style={summary}>
        <Card title="Espaços" value={properties.length} />
        <Card title="Reservas" value={bookings.length} />
        <Card title="Receita estimada" value={`R$ ${totalRevenue}`} />
        <Card title="Contratos recorrentes" value={recurringContracts.length} />
      </div>

      {/* CONTRATOS */}
      <h2>Planos recorrentes</h2>

      {recurringContracts.map((c) => {
        const property = properties.find((p) => p.id === c.propertyId)
        const monthly = (property?.price_per_hour || 0) * (c.durationHours || 1) * 4

        return (
          <div key={c.contractId} style={contractBox}>
            <h3>{c.propertyTitle}</h3>

            <p>
              {c.guestName} • {c.guestEmail}
            </p>

            <p>
              <strong>Tipo:</strong> {c.recurrenceType}
            </p>

            <p>
              <strong>Estimativa mensal:</strong> R$ {monthly}
            </p>

            <p>
              <strong>Ocorrências:</strong> {c.bookings.length}
            </p>
          </div>
        )
      })}

      {/* ESPAÇOS */}
      <h2 style={{ marginTop: 40 }}>Seus espaços</h2>

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

function Card({ title, value }: any) {
  return (
    <div style={card}>
      <h3>{value}</h3>
      <p>{title}</p>
    </div>
  )
}

const summary: React.CSSProperties = {
  display: "flex",
  gap: 20,
  marginBottom: 40,
  flexWrap: "wrap",
}

const card = {
  flex: "1 1 220px",
  background: "#f5f5f5",
  padding: 20,
  borderRadius: 12,
  textAlign: "center" as const,
}

const box = {
  border: "1px solid #ddd",
  borderRadius: 12,
  padding: 20,
  marginTop: 20,
}

const notice = {
  marginBottom: 20,
  padding: 10,
  background: "#fef3c7",
  borderRadius: 8,
}

const contractBox = {
  border: "1px solid #ddd",
  padding: 16,
  borderRadius: 10,
  marginTop: 10,
}