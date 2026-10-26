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
  HORAS_LIMITE_CANCELAR,
} from '../servicios/turnos'
import {
  diaSemanaPlural,
  encabezadoDiaCorto,
  NOMBRE_DIA,
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
import CartelAnuncios from './CartelAnuncios'
import UltimoPago from './UltimoPago'
import RetornoPago from './RetornoPago'
import EncuestaClase from './EncuestaClase'
import EstadoAbono from './EstadoAbono'
import InstalarApp from './InstalarApp'
import { TarjetaNotificaciones } from './Notificaciones'
import AgregarAlCalendario from './AgregarAlCalendario'
import { descargarIcs } from '../calendario'
import { dejarFija, fijarAlumna, misFijas } from '../servicios/fijas'
import type { Fija } from '../servicios/fijas'
import AvisoPrimeraClase from './AvisoPrimeraClase'
import MiCuenta from './MiCuenta'
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
  const [mostrandoCuenta, setMostrandoCuenta] = useState(false)
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

  // Horarios en los que quedó "fija": se anota sola en los turnos nuevos.
  const [fijas, setFijas] = useState<Fija[]>([])
  const cargarFijas = useCallback(async () => {
    try {
      setFijas(await misFijas())
    } catch {
      setFijas([])
    }
  }, [])

  useEffect(() => {
    cargarFijas()
  }, [cargarFijas])

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

  const fijarme = async (turno: TurnoDisponible) => {
    if (!turno.plantilla_id) return
    const dia = diaSemanaPlural(turno.fecha)
    if (
      !window.confirm(
        `¿Quedarte fija todos los ${dia} a las ${horaCorta(turno.hora)}?` +
          `\n\nTe anotamos sola en cada turno nuevo de ese día y horario, mientras tu abono lo cubra y haya lugar. ` +
          `Si un día no podés venir, cancelás ese turno. Para dejar de ser fija, lo sacás desde "Mis turnos".`,
      )
    ) {
      return
    }
    setOcupadoId(turno.id)
    setError('')
    setAviso('')
    try {
      const n = await fijarAlumna(perfil.id, turno.plantilla_id)
      setAviso(
        `Listo: quedaste fija los ${dia} a las ${horaCorta(turno.hora)}. ` +
          (n > 0 ? `Te anotamos en ${n} turno${n === 1 ? '' : 's'} más.` : 'Desde ahora te anotamos sola en cada turno nuevo.'),
      )
      await cargar()
      await cargarFijas()
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : 'No se pudo completar la acción.'
      if (mensaje === 'PAGO_REQUERIDO') setPagoRequerido(true)
      else setError(mensaje)
    } finally {
      setOcupadoId(null)
    }
  }

  const sacarFija = async (f: Fija) => {
    if (!window.confirm(`¿Dejar de ser fija los ${NOMBRE_DIA[f.dia_semana].toLowerCase()} a las ${horaCorta(f.hora)}? Tus reservas ya hechas se mantienen.`)) return
    setError('')
    setAviso('')
    try {
      await dejarFija(perfil.id, f.plantilla_id)
      await cargarFijas()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la acción.')
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
            <button
              type="button"
              className="link-secundario"
              onClick={() => setMostrandoCuenta(true)}
            >
              Mi cuenta
            </button>
            <button type="button" className="link-secundario" onClick={cerrarSesion}>
              Salir
            </button>
          </>
        }
      />

      <CartelAnuncios />
      <RetornoPago perfil={perfil} onPerfilActualizado={onPerfilActualizado} />
      <EncuestaClase />
      <AvisoPromocion turnos={promovidas} onEntendido={entenderPromociones} />
      <AvisoPago perfil={perfil} onComprobante={cargarComprobantes} />
      {comprobantePendiente && (
        <p className="estado-abono estado-abono--pronto">
          Mandaste un comprobante de pago: el estudio lo está revisando y te habilita los turnos.
        </p>
      )}
      <EstadoAbono perfil={perfil} />
      <UltimoPago perfil={perfil} onVerTodos={() => setMostrandoCuenta(true)} />
      <InstalarApp />
      <TarjetaNotificaciones />

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
        {vista === 'mios' && fijas.length > 0 && (
          <div className="mis-fijas">
            <strong>Mis horarios fijos</strong>
            <span className="ayuda">Me anotan sola en cada turno nuevo de estos horarios.</span>
            <ul className="ficha-historial">
              {fijas.map((f) => (
                <li key={f.plantilla_id}>
                  <span>
                    {NOMBRE_DIA[f.dia_semana]} {horaCorta(f.hora)}
                    {f.instructor && <span className="ayuda"> · {f.instructor}</span>}
                  </span>
                  <button type="button" className="link-secundario" onClick={() => sacarFija(f)}>
                    Dejar de ser fija
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {vista === 'mios' && mios.some((t) => t.mi_estado === 'reservada') && (
          <button
            type="button"
            className="link-secundario"
            onClick={() => descargarIcs(mios.filter((t) => t.mi_estado === 'reservada'), 'mis-turnos-forteva')}
          >
            Agregar todos mis turnos al calendario
          </button>
        )}

        {cargando ? (
          <p className="vacio">Cargando turnos...</p>
        ) : lista.length === 0 ? (
          <p className="vacio">
            {vista === 'disponibles'
              ? 'Todavía no hay turnos publicados. Consultale al estudio.'
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
            fijas={new Set(fijas.map((f) => f.plantilla_id))}
            puedeFijar={puedeSerie}
            onFijar={fijarme}
            onReservarSerie={accionSerie}
            onReservar={(t) => accion(t, 'reservar')}
            onCancelar={(t) => accion(t, 'cancelar')}
          />
        )}
      </main>

      {mostrandoCuenta && <MiCuenta perfil={perfil} onCerrar={() => setMostrandoCuenta(false)} />}

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
  fijas,
  puedeFijar,
  onFijar,
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
  fijas: Set<string>
  puedeFijar: boolean
  onFijar: (t: TurnoDisponible) => void
  onReservarSerie: (t: TurnoDisponible) => void
  onReservar: (t: TurnoDisponible) => void
  onCancelar: (t: TurnoDisponible) => void
}) {
  // "Quedarme fija": solo en turnos que salen de un turno fijo y en los que ya estoy anotada.
  const controlFija = (t: TurnoDisponible, ocupado: boolean) => {
    if (t.mi_estado !== 'reservada' || !t.plantilla_id) return null
    if (fijas.has(t.plantilla_id)) return <span className="etiqueta-fija">Horario fijo</span>
    if (!puedeFijar) return null
    return (
      <button type="button" className="link-secundario" disabled={ocupado} onClick={() => onFijar(t)}>
        Quedarme fija en este horario
      </button>
    )
  }

  // Agrupamos por día para encabezar cada bloque.
  const porDia = new Map<string, TurnoDisponible[]>()
  for (const t of turnos) {
    const arr = porDia.get(t.fecha) ?? []
    arr.push(t)
    porDia.set(t.fecha, arr)
  }

  return (
    <div className="grupos-dia grupos-dia--compacto">
      {[...porDia.entries()].map(([fecha, delDia]) => (
        <section key={fecha} className="grupo-dia">
          <h2>{encabezadoDiaCorto(fecha)}</h2>
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
                    <div className="turno-acciones">
                      <span className="ayuda">
                        No se puede cancelar
                        <br />
                        (faltan menos de {HORAS_LIMITE_CANCELAR} h)
                      </span>
                      <AgregarAlCalendario turno={t} />
                      {controlFija(t, ocupado)}
                    </div>
                  ) : t.mi_estado ? (
                    <div className="turno-acciones">
                      <button
                        type="button"
                        className="btn-fantasma"
                        disabled={ocupado}
                        onClick={() => onCancelar(t)}
                      >
                        {ocupado ? '...' : 'Cancelar'}
                      </button>
                      {t.mi_estado === 'reservada' && <AgregarAlCalendario turno={t} />}
                      {controlFija(t, ocupado)}
                    </div>
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
