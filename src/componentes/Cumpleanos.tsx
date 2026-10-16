import { useEffect, useState } from 'react'
import type { Perfil } from '../tipos'
import { listarClientes } from '../servicios/clientes'
import { proximoCumple } from '../cumple'
import { fechaLarga } from '../fechas'
import { nombreCompleto } from '../personas'
import { mensajeCumple } from '../whatsapp'
import EnlaceWhatsApp from './EnlaceWhatsApp'

const DIAS_ADELANTE = 7

// Cumpleaños de hoy y de los próximos días, con el saludo por WhatsApp listo.
// No muestra nada si no hay ninguno. (El mail de saludo sale solo ese día.)
export default function Cumpleanos({ paraProfesora = false }: { paraProfesora?: boolean }) {
  const [proximos, setProximos] = useState<{ cliente: Perfil; dias: number; edad: number; fecha: string }[]>([])

  useEffect(() => {
    listarClientes(paraProfesora)
      .then((clientes) => {
        const lista = clientes
          .map((cliente) => ({ cliente, c: proximoCumple(cliente.fecha_nacimiento) }))
          .filter((x): x is { cliente: Perfil; c: NonNullable<typeof x.c> } => x.c !== null && x.c.dias <= DIAS_ADELANTE)
          .map((x) => ({ cliente: x.cliente, ...x.c }))
          .sort((a, b) => a.dias - b.dias)
        setProximos(lista)
      })
      .catch(() => setProximos([]))
  }, [paraProfesora])

  if (proximos.length === 0) return null

  return (
    <section className="tarjeta-cumple" aria-label="Cumpleaños">
      <h3>🎂 Cumpleaños</h3>
      <ul>
        {proximos.map(({ cliente, dias, edad, fecha }) => (
          <li key={cliente.id}>
            <span>
              <strong>{nombreCompleto(cliente)}</strong> cumple {edad} ·{' '}
              {dias === 0 ? <strong>hoy</strong> : dias === 1 ? 'mañana' : fechaLarga(fecha).toLowerCase()}
            </span>
            <EnlaceWhatsApp
              telefono={cliente.telefono}
              mensaje={mensajeCumple(cliente.nombre)}
              etiqueta="Saludar"
            />
          </li>
        ))}
      </ul>
    </section>
  )
}
