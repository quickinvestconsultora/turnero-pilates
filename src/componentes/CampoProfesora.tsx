import { useEffect, useState } from 'react'
import type { Profesora } from '../tipos'
import { listarProfesoras } from '../servicios/profesoras'

export type ValorProfesora = { instructoraId?: string; instructor?: string }

const OTRA = '__otra'

// Selector que usa el staff al crear un turno: elige entre las profesoras
// registradas (el turno queda a su nombre y ella lo ve y maneja), o escribe
// un nombre a mano para alguien que no tiene cuenta.
export default function CampoProfesora({
  id,
  onCambio,
}: {
  id: string
  onCambio: (v: ValorProfesora) => void
}) {
  const [profesoras, setProfesoras] = useState<Profesora[]>([])
  const [seleccion, setSeleccion] = useState('')
  const [texto, setTexto] = useState('')

  useEffect(() => {
    listarProfesoras()
      .then(setProfesoras)
      .catch(() => setProfesoras([]))
  }, [])

  const elegir = (valor: string, otroTexto: string) => {
    setSeleccion(valor)
    setTexto(otroTexto)
    if (valor === OTRA) onCambio({ instructor: otroTexto })
    else if (valor) onCambio({ instructoraId: valor })
    else onCambio({})
  }

  return (
    <div>
      <label htmlFor={id}>Profesora (opcional)</label>
      <select id={id} value={seleccion} onChange={(e) => elegir(e.target.value, texto)}>
        <option value="">Sin asignar</option>
        {profesoras.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre}
          </option>
        ))}
        <option value={OTRA}>Otra (escribir nombre)</option>
      </select>
      {seleccion === OTRA && (
        <input
          aria-label="Nombre de la profesora"
          value={texto}
          onChange={(e) => elegir(OTRA, e.target.value)}
          placeholder="Nombre"
        />
      )}
    </div>
  )
}
