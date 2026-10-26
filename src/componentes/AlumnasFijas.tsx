import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PlantillaTurno, Perfil } from '../tipos'
import { listarClientes } from '../servicios/clientes'
import { dejarFija, fijarAlumna, fijasDePlantilla, moverFija } from '../servicios/fijas'
import type { FijaDePlantilla } from '../servicios/fijas'
import { nombreCompleto } from '../personas'
import { NOMBRE_DIA, horaCorta } from '../fechas'

// Alumnas fijas de un turno fijo: se anotan solas en cada turno nuevo de ese día y
// horario, mientras su abono lo cubra y haya lugar, hasta que alguien las saque.
export default function AlumnasFijas({
  plantillaId,
  plantillas,
}: {
  plantillaId: string
  plantillas: PlantillaTurno[]
}) {
  const [abierto, setAbierto] = useState(false)
  const [lista, setLista] = useState<FijaDePlantilla[] | null>(null)
  const [clientes, setClientes] = useState<Perfil[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [moviendo, setMoviendo] = useState<string | null>(null)
  const [destino, setDestino] = useState('')

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

  const otrosHorarios = plantillas.filter((p) => p.id !== plantillaId && p.activa)

  const mover = async (f: FijaDePlantilla) => {
    if (!destino) return
    const nuevo = otrosHorarios.find((p) => p.id === destino)
    if (!nuevo) return
    if (
      !window.confirm(
        `¿Mover a ${f.nombre} ${f.apellido} al horario fijo de los ${NOMBRE_DIA[nuevo.dia_semana].toLowerCase()} ${horaCorta(nuevo.hora)}?` +
          `\n\nSe cancelan sus reservas futuras de este horario (sin contarlas como cancelación suya) y se la anota en los turnos ya publicados del nuevo.`,
      )
    ) {
      return
    }
    setError('')
    setAviso('')
    setOcupado(true)
    try {
      const r = await moverFija(f.alumna_id, plantillaId, destino)
      setAviso(
        `Listo: ${f.nombre} ahora es fija los ${NOMBRE_DIA[nuevo.dia_semana].toLowerCase()} ${horaCorta(nuevo.hora)}. ` +
          `Se anularon ${r.anuladas} reserva${r.anuladas === 1 ? '' : 's'} del horario anterior y se la anotó en ${r.anotadas} turno${r.anotadas === 1 ? '' : 's'} del nuevo.`,
      )
      setMoviendo(null)
      setDestino('')
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo mover.')
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
                  <span className="acciones-pago">
                    {otrosHorarios.length > 0 && (
                      <button
                        type="button"
                        className="link-secundario"
                        onClick={() => {
                          setMoviendo(moviendo === f.alumna_id ? null : f.alumna_id)
                          setDestino('')
                        }}
                      >
                        Mover a otro horario
                      </button>
                    )}
                    <button type="button" className="link-secundario" onClick={() => quitar(f)}>
                      Sacar
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {moviendo && lista && (
            <div className="form-caja">
              <label htmlFor={'fija-destino-' + plantillaId}>
                Mover a {lista.find((x) => x.alumna_id === moviendo)?.nombre} a este horario:
              </label>
              <select id={'fija-destino-' + plantillaId} value={destino} onChange={(e) => setDestino(e.target.value)}>
                <option value="">Elegí un horario fijo</option>
                {otrosHorarios.map((p) => (
                  <option key={p.id} value={p.id}>
                    {NOMBRE_DIA[p.dia_semana]} {horaCorta(p.hora)}
                    {p.instructor ? ` · ${p.instructor}` : ''}
                  </option>
                ))}
              </select>
              <div className="barra-acciones">
                <button
                  type="button"
                  disabled={!destino || ocupado}
                  onClick={() => {
                    const f = lista.find((x) => x.alumna_id === moviendo)
                    if (f) mover(f)
                  }}
                >
                  {ocupado ? 'Moviendo...' : 'Mover'}
                </button>
                <button type="button" className="link-secundario" onClick={() => setMoviendo(null)}>
                  Cancelar
                </button>
              </div>
            </div>
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
