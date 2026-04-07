"use client"

import { useEffect, useState } from "react"
import SpaceCard from "@/components/SpaceCard"
import AvailabilityCalendar from "@/components/AvailabilityCalendar"
import { supabase } from "@/lib/supabase"

export default function SpacesPage() {

  const [spaces, setSpaces] = useState<any[]>([])

  useEffect(() => {

    async function loadSpaces() {

      const { data } = await supabase
        .from("properties")
        .select("*")

      setSpaces(data || [])

    }

    loadSpaces()

  }, [])

  return (

    <div style={{ padding: 40 }}>

      <h1>Espaços disponíveis</h1>

      {spaces.map((space) => (

        <div key={space.id} style={{ marginBottom: 50 }}>

          <SpaceCard space={space} />

          <AvailabilityCalendar propertyId={space.id} />

        </div>

      ))}

    </div>

  )
}