"use client"

import { useState } from "react"
import ReservationModal from "./ReservationModal"

type Props = {
  space: {
    id: number
    title: string
    description: string
    price_per_hour: number
  }
}

export default function SpaceCard({ space }: Props) {

  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <div
      style={{
        border: "1px solid #ddd",
        padding: "20px",
        borderRadius: "8px",
        marginBottom: "20px"
      }}
    >

      <h3>{space.title}</h3>

      <p>{space.description}</p>

      <p>
        <strong>
          R$ {space.price_per_hour}/hora
        </strong>
      </p>

      <button
        onClick={() => setIsModalOpen(true)}
        style={{
          padding: "10px 16px",
          background: "green",
          color: "white",
          border: "none",
          cursor: "pointer",
          borderRadius: "4px"
        }}
      >
        Reservar
      </button>

      <ReservationModal
        propertyId={space.id}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />

    </div>
  )
}