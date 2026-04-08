"use client"

import { useState } from "react"
import ReservationModal from "./ReservationModal"

type Props = {
  space: any
}

export default function SpaceCard({ space }: Props) {
  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <div style={card}>
      <h3>{space.name}</h3>
      <p>R$ {space.price_per_hour}/hora</p>

      <button onClick={() => setIsModalOpen(true)}>
        Reservar
      </button>

      <ReservationModal
        propertyId={space.id}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        pricePerHour={Number(space.price_per_hour ?? 0)}
        propertyTitle={space.name}
      />
    </div>
  )
}

const card = {
  border: "1px solid #ddd",
  padding: 16,
  borderRadius: 10,
  display: "flex",
  flexDirection: "column" as const,
  gap: 10,
}