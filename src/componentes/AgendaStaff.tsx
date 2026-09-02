import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { TurnoConReservas } from '../tipos'
import {
  actualizarTurno,
  cancelarTurno,
  crearTurno,
  listarTurnosStaff,
  quitarReserva,
} from '../servicios/agenda'
import { encabezadoDia, horaCorta, hoyIso } from '../fechas'

export default function AgendaStaff() {
  const [turnos, setTurnos] = useState<TurnoConReservas[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [mostrarAlta, setMostrarAlta] = useState(false)

  const cargar = useCallback(async () => {
    setError('')
    try {
      setTurnos(await listarTurnosStaff())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la agenda.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const porDia = new Map<string, TurnoConReservas[]>()
  for (const t of turnos) {
    const arr = porDia.get(t.fecha) ?? []
    arr.push(t)
    porDia.set(t.fecha, arr)
  }

  return (
    <div>
      <div className="fila-titulo">
        <h2>Próximas 3 semanas</h2>
        <button type="button" onClick={() => setMostrarAlta((v) => !v)}>
          {mostrarAlta ? 'Cerrar' : '+ Turno suelto'}
        </button>
      </div>

      {mostrarAlta && (
        <FormAltaTurno
          onCreado={() => {
            setMostrarAlta(false)
            cargar()
          }}
        />
      )}

      {error && <p className="mensaje-error">{error}</p>}

      {cargando ? (
        <p className="vacio">Cargando...</p>
      ) : turnos.length === 0 ? (
        <p className="vacio">
          No hay turnos en la agenda. Creá un turno suelto o generá desde un turno fijo.
        </p>
      ) : (
        <div className="grupos-dia">
          {[...porDia.entries()].map(([fecha, delDia]) => (
            <section key={fecha} className="grupo-dia">
              <h2>{encabezadoDia(fecha)}</h2>
              {delDia.map((t) => (
                <TurnoStaff key={t.id} turno={t} onCambio={cargar} onError={setError} />
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function TurnoStaff({
  turno,
  onCambio,
  onError,
}: {
  turno: TurnoConReservas
  onCambio: () => void
  onError: (m: string) => void
}) {
  const [ocupado, setOcupado] = useState(false)
  const anotados = turno.reservas.filter((r) => r.estado === 'reservada')
  const espera = turno.reservas.filter((r) => r.estado === 'lista_espera')

  const conManejo = async (fn: () => Promise<void>) => {
    setOcupado(true)
    onError('')
    try {
      await fn()
      onCambio()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'No se pudo completar la acción.')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className={turno.cancelado ? 'turno-staff cancelado' : 'turno-staff'}>
      <div className="turno-staff-cabecera">
        <span className="turno-hora">{horaCorta(turno.hora)}</span>
        <span className="turno-detalle">
          {turno.instructor ? `${turno.instructor} · ` : ''}
          {anotados.length}/{turno.cupo}
          {turno.cancelado && ' · CANCELADO'}
        </span>
        {!turno.cancelado && (
          <div className="barra-acciones">
            <button
              type="button"
              className="link-secundario"
              disabled={ocupado}
              onClick={() => {
                const valor = prompt('Nuevo cupo', String(turno.cupo))
                if (valor == null) return
                const cupo = Number(valor)
                if (!Number.isInteger(cupo) || cupo < 1) {
                  onError('El cupo tiene que ser un número mayor a 0.')
                  return
                }
                conManejo(() => actualizarTurno(turno.id, { cupo }))
              }}
            >
              Editar cupo
            </button>
            <button
              type="button"
              className="link-peligro"
              disabled={ocupado}
              onClick={() => {
                if (confirm('¿Cancelar este turno? Se avisa que quedó sin efecto.')) {
                  conManejo(() => cancelarTurno(turno.id))
                }
              }}
            >
              Cancelar turno
            </button>
          </div>
        )}
      </div>

      {turno.nota && <p className="turno-nota">{turno.nota}</p>}

      {!turno.cancelado && (
        <ul className="anotados">
          {anotados.length === 0 && <li className="vacio-inline">Nadie anotado todavía</li>}
          {anotados.map((r) => (
            <li key={r.id}>
              <span>
                {r.perfiles?.nombre || 'Sin nombre'}
                {r.perfiles?.telefono ? ` · ${r.perfiles.telefono}` : ''}
              </span>
              <button
                type="button"
                className="link-peligro"
                disabled={ocupado}
                onClick={() => {
                  if (confirm(`¿Sacar a ${r.perfiles?.nombre ?? 'esta persona'} del turno?`)) {
                    conManejo(() => quitarReserva(r.id))
                  }
                }}
              >
                Sacar
              </button>
            </li>
          ))}
          {espera.map((r) => (
            <li key={r.id} className="en-espera">
              <span>{r.perfiles?.nombre || 'Sin nombre'} — en espera</span>
              <button
                type="button"
                className="link-secundario"
                disabled={ocupado}
                onClick={() => conManejo(() => quitarReserva(r.id))}
              >
                Sacar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function FormAltaTurno({ onCreado }: { onCreado: () => void }) {
  const [fecha, setFecha] = useState(hoyIso())
  const [hora, setHora] = useState('09:00')
  const [cupo, setCupo] = useState('6')
  const [instructor, setInstructor] = useState('')
  const [nota, setNota] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    const cupoNum = Number(cupo)
    if (!Number.isInteger(cupoNum) || cupoNum < 1) {
      setError('El cupo tiene que ser un número mayor a 0.')
      return
    }
    setEnviando(true)
    try {
      await crearTurno({ fecha, hora, cupo: cupoNum, instructor, nota })
      onCreado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el turno.')
      setEnviando(false)
    }
  }

  return (
    <form className="form-caja" onSubmit={enviar}>
      <div className="grilla-campos">
        <div>
          <label htmlFor="a-fecha">Fecha</label>
          <input
            id="a-fecha"
            type="date"
            value={fecha}
            min={hoyIso()}
            onChange={(e) => setFecha(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="a-hora">Hora</label>
          <input
            id="a-hora"
            type="time"
            value={hora}
            onChange={(e) => setHora(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="a-cupo">Cupo</label>
          <input
            id="a-cupo"
            type="number"
            min={1}
            value={cupo}
            onChange={(e) => setCupo(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="a-instructor">Instructor (opcional)</label>
          <input
            id="a-instructor"
            value={instructor}
            onChange={(e) => setInstructor(e.target.value)}
          />
        </div>
      </div>
      <label htmlFor="a-nota">Nota (opcional)</label>
      <input id="a-nota" value={nota} onChange={(e) => setNota(e.target.value)} />

      {error && <p className="mensaje-error">{error}</p>}
      <button type="submit" disabled={enviando}>
        {enviando ? 'Creando...' : 'Crear turno'}
      </button>
    </form>
  )
}
