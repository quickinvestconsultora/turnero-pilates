import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Perfil, TurnoDisponible } from '../tipos'
import { cerrarSesion } from '../servicios/perfil'
import { cancelar, listarTurnos, reservar, DIAS_VISIBLES } from '../servicios/turnos'
import { encabezadoDia, horaCorta, yaPaso } from '../fechas'
import EditarPerfil from './EditarPerfil'

type Vista = 'disponibles' | 'mios'

type Props = {
  perfil: Perfil
  onPerfilActualizado: (p: Perfil) => void
}

export default function AlumnoApp({ perfil, onPerfilActualizado }: Props) {
  const [vista, setVista] = useState<Vista>('disponibles')
  const [turnos, setTurnos] = useState<TurnoDisponible[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [ocupadoId, setOcupadoId] = useState<string | null>(null)
  const [editandoPerfil, setEditandoPerfil] = useState(false)

  const cargar = useCallback(async () => {
    setError('')
    try {
      setTurnos(await listarTurnos())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los turnos.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const accion = async (turno: TurnoDisponible, quiere: 'reservar' | 'cancelar') => {
    setOcupadoId(turno.id)
    setError('')
    try {
      if (quiere === 'reservar') await reservar(turno.id)
      else await cancelar(turno.id)
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la acción.')
    } finally {
      setOcupadoId(null)
    }
  }

  const disponibles = useMemo(
    () => turnos.filter((t) => !yaPaso(t.fecha, t.hora)),
    [turnos],
  )
  const mios = useMemo(
    () => disponibles.filter((t) => t.mi_estado === 'reservada' || t.mi_estado === 'lista_espera'),
    [disponibles],
  )

  const lista = vista === 'disponibles' ? disponibles : mios

  return (
    <div className="app">
      <header className="barra-superior">
        <div>
          <strong>Hola, {perfil.nombre || 'alumno'}</strong>
        </div>
        <div className="barra-acciones">
          <button type="button" className="link-secundario" onClick={() => setEditandoPerfil(true)}>
            Mis datos
          </button>
          <button type="button" className="link-secundario" onClick={cerrarSesion}>
            Salir
          </button>
        </div>
      </header>

      <nav className="tabs">
        <button
          type="button"
          className={vista === 'disponibles' ? 'tab activa' : 'tab'}
          onClick={() => setVista('disponibles')}
        >
          Turnos disponibles
        </button>
        <button
          type="button"
          className={vista === 'mios' ? 'tab activa' : 'tab'}
          onClick={() => setVista('mios')}
        >
          Mis turnos {mios.length > 0 && <span className="pastilla">{mios.length}</span>}
        </button>
      </nav>

      <main className="contenido">
        {error && <p className="mensaje-error">{error}</p>}

        {cargando ? (
          <p className="vacio">Cargando turnos...</p>
        ) : lista.length === 0 ? (
          <p className="vacio">
            {vista === 'disponibles'
              ? `No hay turnos publicados para los próximos ${DIAS_VISIBLES} días.`
              : 'Todavía no reservaste ningún turno.'}
          </p>
        ) : (
          <ListaTurnos
            turnos={lista}
            ocupadoId={ocupadoId}
            onReservar={(t) => accion(t, 'reservar')}
            onCancelar={(t) => accion(t, 'cancelar')}
          />
        )}
      </main>

      {editandoPerfil && (
        <EditarPerfil
          perfil={perfil}
          onCerrar={() => setEditandoPerfil(false)}
          onGuardado={(p) => {
            onPerfilActualizado(p)
            setEditandoPerfil(false)
          }}
        />
      )}
    </div>
  )
}

function ListaTurnos({
  turnos,
  ocupadoId,
  onReservar,
  onCancelar,
}: {
  turnos: TurnoDisponible[]
  ocupadoId: string | null
  onReservar: (t: TurnoDisponible) => void
  onCancelar: (t: TurnoDisponible) => void
}) {
  // Agrupamos por día para encabezar cada bloque.
  const porDia = new Map<string, TurnoDisponible[]>()
  for (const t of turnos) {
    const arr = porDia.get(t.fecha) ?? []
    arr.push(t)
    porDia.set(t.fecha, arr)
  }

  return (
    <div className="grupos-dia">
      {[...porDia.entries()].map(([fecha, delDia]) => (
        <section key={fecha} className="grupo-dia">
          <h2>{encabezadoDia(fecha)}</h2>
          <ul className="lista-turnos">
            {delDia.map((t) => {
              const libres = Math.max(0, t.cupo - Number(t.ocupados))
              const ocupado = ocupadoId === t.id
              return (
                <li key={t.id} className="turno">
                  <div className="turno-info">
                    <span className="turno-hora">{horaCorta(t.hora)}</span>
                    <span className="turno-detalle">
                      {t.instructor ? `${t.instructor} · ` : ''}
                      {t.mi_estado === 'lista_espera'
                        ? 'En lista de espera'
                        : libres > 0
                          ? `${libres} lugar${libres === 1 ? '' : 'es'}`
                          : 'Completo'}
                    </span>
                    {t.nota && <span className="turno-nota">{t.nota}</span>}
                  </div>

                  {t.mi_estado ? (
                    <button
                      type="button"
                      className="btn-fantasma"
                      disabled={ocupado}
                      onClick={() => onCancelar(t)}
                    >
                      {ocupado ? '...' : 'Cancelar'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={ocupado}
                      onClick={() => onReservar(t)}
                    >
                      {ocupado ? '...' : libres > 0 ? 'Reservar' : 'Anotarme en espera'}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
