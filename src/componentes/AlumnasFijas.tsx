import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Perfil } from '../tipos'
import { listarClientes } from '../servicios/clientes'
import { dejarFija, fijarAlumna, fijasDePlantilla } from '../servicios/fijas'
import type { FijaDePlantilla } from '../servicios/fijas'
import { nombreCompleto } from '../personas'

// Alumnas fijas de un turno fijo: se anotan solas en cada turno nuevo de ese día y
// horario, mientras su abono lo cubra y haya lugar, hasta que alguien las saque.
export default function AlumnasFijas({ plantillaId }: { plantillaId: string }) {
  const [abierto, setAbierto] = useState(false)
  const [lista, setLista] = useState<FijaDePlantilla[] | null>(null)
  const [clientes, setClientes] = useState<Perfil[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const cargar = useCallback(async () => {
    try {
      setLista(await fijasDePlantilla(plantillaId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las alumnas fijas.')
    }
  }, [plantillaId])

  // El número se muestra siempre; el detalle, al abrir.
  useEffect(() => {
    cargar()
  }, [cargar])

  useEffect(() => {
    if (!abierto || clientes.length > 0) return
    listarClientes()
      .then(setClientes)
      .catch(() => setClientes([]))
  }, [abierto, clientes.length])

  const yaFijas = useMemo(() => new Set((lista ?? []).map((f) => f.alumna_id)), [lista])

  const resultados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return []
    return clientes
      .filter((c) => !yaFijas.has(c.id) && (nombreCompleto(c).toLowerCase().includes(q) || (c.telefono ?? '').includes(q)))
      .slice(0, 6)
  }, [clientes, busqueda, yaFijas])

  const agregar = async (c: Perfil) => {
    setError('')
    setAviso('')
    setOcupado(true)
    try {
      const n = await fijarAlumna(c.id, plantillaId)
      setAviso(
        `${nombreCompleto(c)} quedó fija. ` +
          (n > 0
            ? `La anotamos en ${n} turno${n === 1 ? '' : 's'} ya publicado${n === 1 ? '' : 's'}.`
            : 'No había turnos publicados para anotarla ahora (se anota sola cuando se publiquen o cuando su abono los cubra).'),
      )
      setBusqueda('')
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo agregar.')
    } finally {
      setOcupado(false)
    }
  }

  const quitar = async (f: FijaDePlantilla) => {
    if (!window.confirm(`¿Sacar a ${f.nombre} ${f.apellido} de este horario fijo? Sus reservas ya hechas se mantienen.`)) return
    setError('')
    setAviso('')
    try {
      await dejarFija(f.alumna_id, plantillaId)
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo sacar.')
    }
  }

  return (
    <div className="fijas-bloque">
      <button type="button" className="link-secundario" onClick={() => setAbierto((v) => !v)}>
        {abierto ? 'Ocultar alumnas fijas' : `Alumnas fijas (${lista === null ? '…' : lista.length})`}
      </button>

      {abierto && (
        <div className="form-caja">
          <p className="ayuda">
            Las alumnas fijas se anotan solas en cada turno nuevo de este día y horario, mientras su abono lo cubra y
            haya lugar. Si cancelan una fecha, no se las vuelve a anotar en esa fecha.
          </p>
          {error && <p className="mensaje-error">{error}</p>}
          {aviso && <p className="mensaje-ok">{aviso}</p>}

          {lista !== null && lista.length === 0 && <p className="ayuda">Todavía no hay alumnas fijas en este horario.</p>}
          {lista !== null && lista.length > 0 && (
            <ul className="ficha-historial">
              {lista.map((f) => (
                <li key={f.alumna_id}>
                  <span>
                    {f.nombre} {f.apellido}
                  </span>
                  <button type="button" className="link-secundario" onClick={() => quitar(f)}>
                    Sacar
                  </button>
                </li>
              ))}
            </ul>
          )}

          <label htmlFor={'fija-busqueda-' + plantillaId}>Sumar una alumna</label>
          <input
            id={'fija-busqueda-' + plantillaId}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o teléfono"
          />
          {resultados.length > 0 && (
            <ul className="ficha-historial">
              {resultados.map((c) => (
                <li key={c.id}>
                  <span>
                    {nombreCompleto(c)} <span className="ayuda">· {c.telefono || 'sin teléfono'}</span>
                  </span>
                  <button type="button" className="boton-mini" disabled={ocupado} onClick={() => agregar(c)}>
                    Dejarla fija
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
