"use client"

import { useEffect, useState } from "react"
import Calendar from "react-calendar"
import "react-calendar/dist/Calendar.css"
import ReservationModal from "./ReservationModal"

type Props = {
  propertyId: any
  pricePerHour?: number
}

export default function AvailabilityCalendar({
  propertyId,
  pricePerHour = 0,
}: Props) {
  const [availability, setAvailability] = useState<any>({})
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    async function loadAvailability() {
      const start = new Date()
      const end = new Date()
      end.setMonth(end.getMonth() + 2)

      const res = await fetch(
        `/api/availability?property_id=${propertyId}&start=${start.toISOString().split("T")[0]}&end=${end.toISOString().split("T")[0]}`
      )

      const data = await res.json()
      setAvailability(data)
    }

    loadAvailability()
  }, [propertyId])

  function handleDayClick(date: Date) {
    setSelectedDate(date)
  }

  function openReservation(period: string) {
    setSelectedPeriod(period)
    setModalOpen(true)
  }

  function renderPeriods() {
    if (!selectedDate) return null

    const key = selectedDate.toISOString().split("T")[0]

    const day = availability[key] || {
      morning: true,
      afternoon: true,
      evening: true,
    }

    return (
      <div style={{ marginTop: 20 }}>
        <h3>Escolha o período</h3>

        <button
          disabled={!day.morning}
          onClick={() => openReservation("morning")}
        >
          Manhã {day.morning ? "✅ Livre" : "❌ Ocupado"}
        </button>

        <button
          disabled={!day.afternoon}
          onClick={() => openReservation("afternoon")}
        >
          Tarde {day.afternoon ? "✅ Livre" : "❌ Ocupado"}
        </button>

        <button
          disabled={!day.evening}
          onClick={() => openReservation("evening")}
        >
          Noite {day.evening ? "✅ Livre" : "❌ Ocupado"}
        </button>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 20 }}>
      <Calendar onClickDay={handleDayClick} />

      {renderPeriods()}

      {modalOpen && selectedDate && selectedPeriod && (
        <ReservationModal
          propertyId={propertyId}
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          pricePerHour={pricePerHour}
          defaultDate={selectedDate.toISOString().split("T")[0]}
          defaultPeriod={selectedPeriod}
        />
      )}
    </div>
  )
}