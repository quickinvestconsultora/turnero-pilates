import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Perfil, Profesora, TurnoDisponible } from '../tipos'
import { cerrarSesion } from '../servicios/perfil'
import { listarFotosGaleria, listarProfesoras } from '../servicios/profesoras'
import { listarMisComprobantes } from '../servicios/comprobantes'
import type { FotoGaleria } from '../servicios/profesoras'
import {
  cancelar,
  listarTurnos,
  reservar,
  marcarPromocionVista,
  reservarSerie,
  DIAS_VISIBLES,
  HORAS_LIMITE_CANCELAR,
} from '../servicios/turnos'
import {
  diaSemanaPlural,
  encabezadoDia,
  faltanMenosDe,
  horaCorta,
  nombreMes,
  yaPaso,
} from '../fechas'
import { abonoVencido, diaMes } from '../cuenta'
import CabeceraApp from './CabeceraApp'
import EditarPerfil from './EditarPerfil'
import AvisoPago from './AvisoPago'
import AvisoPromocion from './AvisoPromocion'
import EstadoAbono from './EstadoAbono'
import InstalarApp from './InstalarApp'
import AvisoPrimeraClase from './AvisoPrimeraClase'
import ModalPago from './ModalPago'
import ModalProfesora from './ModalProfesora'

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
  const [aviso, setAviso] = useState('')
  const [ocupadoId, setOcupadoId] = useState<string | null>(null)
  const [editandoPerfil, setEditandoPerfil] = useState(false)
  const [pagoRequerido, setPagoRequerido] = useState(false)
  const [avisoPrimeraClase, setAvisoPrimeraClase] = useState(false)
  const [profesoras, setProfesoras] = useState<Profesora[]>([])
  const [profesoraAbierta, setProfesoraAbierta] = useState<Profesora | null>(null)

  const [galeria, setGaleria] = useState<FotoGaleria[]>([])
  const [comprobantePendiente, setComprobantePendiente] = useState(false)

  const cargarComprobantes = useCallback(async () => {
    try {
      const mios = await listarMisComprobantes()
      setComprobantePendiente(mios.some((c) => c.estado === 'pendiente'))
    } catch {
      setComprobantePendiente(false)
    }
  }, [])

  useEffect(() => {
    cargarComprobantes()
  }, [cargarComprobantes])

  useEffect(() => {
    // Si falla, el nombre de la profesora se ve igual, solo que sin ficha.
    listarProfesoras()
      .then(setProfesoras)
      .catch(() => setProfesoras([]))
    listarFotosGaleria()
      .then(setGaleria)
      .catch(() => setGaleria([]))
  }, [])

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

  const accionSerie = async (turno: TurnoDisponible) => {
    setOcupadoId(turno.id)
    setError('')
    setAviso('')
    try {
      const r = await reservarSerie(turno.id)
      const partes = [
        r.reservadas > 0
          ? `Te anotamos en ${r.reservadas} turno${r.reservadas === 1 ? '' : 's'}.`
          : 'No quedó ningún turno nuevo para anotarte.',
      ]
      if (r.ya_anotada > 0) partes.push(`Ya estabas anotada en ${r.ya_anotada}.`)
      if (r.sin_lugar.length > 0) {
        partes.push(`No había lugar el ${r.sin_lugar.map(diaMes).join(', ')}.`)
      }
      if (r.sin_cobertura.length > 0) {
        partes.push(`Tu abono no cubre el ${r.sin_cobertura.map(diaMes).join(', ')}.`)
      }
      setAviso(partes.join(' '))
      await cargar()
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : 'No se pudo completar la acción.'
      if (mensaje === 'PAGO_REQUERIDO') setPagoRequerido(true)
      else setError(mensaje)
    } finally {
      setOcupadoId(null)
    }
  }

  const accion = async (turno: TurnoDisponible, quiere: 'reservar' | 'cancelar') => {
    setOcupadoId(turno.id)
    setError('')
    setAviso('')
    try {
      if (quiere === 'reservar') {
        const resultado = await reservar(turno.id)
        if (resultado.primeraClase) setAvisoPrimeraClase(true)
      } else {
        await cancelar(turno.id)
      }
      await cargar()
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : 'No se pudo completar la acción.'
      if (mensaje === 'PAGO_REQUERIDO') setPagoRequerido(true)
      else setError(mensaje)
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

  // Turnos en los que la base la subió desde la lista de espera y todavía no
  // vio el aviso. Al tocar "Entendido" quedan marcados como vistos.
  const promovidas = useMemo(
    () => mios.filter((t) => t.mi_estado === 'reservada' && t.promovida_sin_ver),
    [mios],
  )
  const entenderPromociones = async () => {
    try {
      await Promise.all(promovidas.map((t) => marcarPromocionVista(t.id)))
    } finally {
      await cargar()
    }
  }

  // "Reservar todo el mes": solo con abono al día. Para cada turno que viene de
  // un turno fijo, cuántos del mismo horario y mes podría sumar hoy (sin
  // reserva, con lugar y dentro de lo que cubre el abono).
  const puedeSerie = perfil.estado_cuenta === 'al_dia' && !abonoVencido(perfil)
  const seriePorTurno = useMemo(() => {
    const cuenta = new Map<string, number>()
    if (!puedeSerie) return cuenta
    const hasta = perfil.al_dia_hasta
    const reservables = disponibles.filter(
      (t) =>
        t.plantilla_id &&
        !t.mi_estado &&
        Number(t.ocupados) < t.cupo &&
        (!hasta || t.fecha <= hasta),
    )
    for (const t of reservables) {
      const n = reservables.filter(
        (o) => o.plantilla_id === t.plantilla_id && o.fecha.slice(0, 7) === t.fecha.slice(0, 7),
      ).length
      cuenta.set(t.id, n)
    }
    return cuenta
  }, [disponibles, puedeSerie, perfil.al_dia_hasta])

  return (
    <div className="app">
      <CabeceraApp
        titulo={<strong>Hola, {perfil.nombre || 'alumno'}</strong>}
        acciones={
          <>
            <button
              type="button"
              className="link-secundario"
              onClick={() => setEditandoPerfil(true)}
            >
              Mis datos
            </button>
            <button type="button" className="link-secundario" onClick={cerrarSesion}>
              Salir
            </button>
          </>
        }
      />

      <AvisoPromocion turnos={promovidas} onEntendido={entenderPromociones} />
      <AvisoPago perfil={perfil} onComprobante={cargarComprobantes} />
      {comprobantePendiente && (
        <p className="estado-abono estado-abono--pronto">
          Mandaste un comprobante de pago: el estudio lo está revisando y te habilita los turnos.
        </p>
      )}
      <EstadoAbono perfil={perfil} />
      <InstalarApp />

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
        {aviso && <p className="mensaje-ok">{aviso}</p>}

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
            profesoras={profesoras}
            onVerProfesora={setProfesoraAbierta}
            seriePorTurno={seriePorTurno}
            esPrueba={perfil.estado_cuenta === 'prueba'}
            onReservarSerie={accionSerie}
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

      {pagoRequerido && (
        <ModalPago
          perfil={perfil}
          onCerrar={() => setPagoRequerido(false)}
          onComprobante={cargarComprobantes}
        />
      )}

      {avisoPrimeraClase && (
        <AvisoPrimeraClase perfil={perfil} onCerrar={() => setAvisoPrimeraClase(false)} />
      )}

      {profesoraAbierta && (
        <ModalProfesora
          profesora={profesoraAbierta}
          fotos={galeria.filter((f) => f.profesora_id === profesoraAbierta.id).map((f) => f.url)}
          onCerrar={() => setProfesoraAbierta(null)}
        />
      )}
    </div>
  )
}

function ListaTurnos({
  turnos,
  ocupadoId,
  profesoras,
  onVerProfesora,
  seriePorTurno,
  esPrueba,
  onReservarSerie,
  onReservar,
  onCancelar,
}: {
  turnos: TurnoDisponible[]
  ocupadoId: string | null
  profesoras: Profesora[]
  onVerProfesora: (p: Profesora) => void
  seriePorTurno: Map<string, number>
  esPrueba: boolean
  onReservarSerie: (t: TurnoDisponible) => void
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
                      {t.mi_estado === 'lista_espera'
                        ? 'En lista de espera'
                        : libres > 0
                          ? `${libres} lugar${libres === 1 ? '' : 'es'}`
                          : 'Completo'}
                    </span>
                    {esPrueba && t.mi_estado === 'reservada' && (
                      <span className="etiqueta-prueba">Clase de prueba</span>
                    )}
                    {t.instructor &&
                      (() => {
                        const ficha = profesoras.find((p) => p.id === t.instructora_id)
                        return ficha ? (
                          <button
                            type="button"
                            className="turno-profesora turno-profesora--ficha"
                            onClick={() => onVerProfesora(ficha)}
                          >
                            Profesora: {t.instructor}
                          </button>
                        ) : (
                          <span className="turno-profesora">Profesora: {t.instructor}</span>
                        )
                      })()}
                    {t.nota && <span className="turno-nota">{t.nota}</span>}
                  </div>

                  {t.mi_estado === 'reservada' &&
                  faltanMenosDe(t.fecha, t.hora, HORAS_LIMITE_CANCELAR) ? (
                    <span className="ayuda">
                      No se puede cancelar
                      <br />
                      (faltan menos de {HORAS_LIMITE_CANCELAR} h)
                    </span>
                  ) : t.mi_estado ? (
                    <button
                      type="button"
                      className="btn-fantasma"
                      disabled={ocupado}
                      onClick={() => onCancelar(t)}
                    >
                      {ocupado ? '...' : 'Cancelar'}
                    </button>
                  ) : (
                    <div className="turno-acciones">
                      <button type="button" disabled={ocupado} onClick={() => onReservar(t)}>
                        {ocupado ? '...' : libres > 0 ? 'Reservar' : 'Anotarme en espera'}
                      </button>
                      {(seriePorTurno.get(t.id) ?? 0) >= 2 && (
                        <button
                          type="button"
                          className="link-secundario"
                          disabled={ocupado}
                          onClick={() => onReservarSerie(t)}
                        >
                          Reservar los {seriePorTurno.get(t.id)} {diaSemanaPlural(t.fecha)} de{' '}
                          {nombreMes(t.fecha)}
                        </button>
                      )}
                    </div>
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
