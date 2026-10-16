import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  borrarAnuncio,
  cambiarAnuncioActivo,
  crearAnuncio,
  ETIQUETA_PUBLICO,
  listarAnuncios,
} from '../servicios/gestion'
import type { Anuncio, PublicoAnuncio } from '../servicios/gestion'
import { hoyIso } from '../fechas'

const fechaAr = (iso: string) => iso.split('-').reverse().join('/')

function estado(a: Anuncio): { texto: string; vigente: boolean } {
  const hoy = hoyIso()
  if (!a.activo) return { texto: 'Desactivado', vigente: false }
  if (a.hasta && a.hasta < hoy) return { texto: 'Vencido', vigente: false }
  if (a.desde > hoy) return { texto: `Empieza el ${fechaAr(a.desde)}`, vigente: false }
  return { texto: 'Visible ahora', vigente: true }
}

// Administración → Anuncios: carteles que ven las alumnas y/o profesoras al
// entrar a la app, con la opción de mandarlos también por mail.
export default function AnunciosStaff() {
  const [anuncios, setAnuncios] = useState<Anuncio[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    setError('')
    try {
      setAnuncios(await listarAnuncios())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los anuncios.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const alternar = async (a: Anuncio) => {
    setError('')
    try {
      await cambiarAnuncioActivo(a.id, !a.activo)
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar el anuncio.')
    }
  }

  const quitar = async (a: Anuncio) => {
    if (!window.confirm('¿Borrar este anuncio? Deja de verse para todas.')) return
    setError('')
    try {
      await borrarAnuncio(a.id)
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo borrar.')
    }
  }

  return (
    <div>
      <h2>Anuncios</h2>
      <p className="ayuda">
        Un cartel que ven al entrar a la app: feriados, cambios de horario, novedades. Cada persona lo
        puede cerrar. Si lo marcás para mandar por mail, sale en los próximos minutos (de a 40 por vez).
      </p>

      <FormAnuncio onCreado={cargar} />

      {error && <p className="mensaje-error">{error}</p>}

      <h3>Publicados</h3>
      {cargando ? (
        <p className="vacio">Cargando...</p>
      ) : anuncios.length === 0 ? (
        <p className="vacio">Todavía no publicaste ningún anuncio.</p>
      ) : (
        <ul className="lista-clientes">
          {anuncios.map((a) => {
            const e = estado(a)
            return (
              <li key={a.id} className="cliente">
                <div className="cliente-datos">
                  <strong>{a.titulo || a.mensaje.slice(0, 50)}</strong>
                  {a.titulo && <span className="turno-detalle">{a.mensaje}</span>}
                  <span className="turno-detalle">
                    <span className={e.vigente ? 'etiqueta-motivo etiqueta-motivo--sin_empezar' : 'etiqueta-motivo'}>
                      {e.texto}
                    </span>
                    {` · Para: ${ETIQUETA_PUBLICO[a.para]}`}
                    {a.importante && ' · Importante'}
                    {a.enviar_mail && ' · También por mail'}
                    {` · Desde ${fechaAr(a.desde)}`}
                    {a.hasta && ` hasta ${fechaAr(a.hasta)}`}
                  </span>
                </div>
                <div className="cliente-enlaces">
                  <button type="button" className="link-secundario" onClick={() => alternar(a)}>
                    {a.activo ? 'Desactivar' : 'Activar'}
                  </button>
                  <button type="button" className="link-secundario" onClick={() => quitar(a)}>
                    Borrar
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function FormAnuncio({ onCreado }: { onCreado: () => void }) {
  const hoy = hoyIso()
  const [titulo, setTitulo] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [para, setPara] = useState<PublicoAnuncio>('alumnas')
  const [importante, setImportante] = useState(false)
  const [desde, setDesde] = useState(hoy)
  const [hasta, setHasta] = useState('')
  const [enviarMail, setEnviarMail] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  const publicar = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!mensaje.trim()) {
      setError('Escribí el mensaje.')
      return
    }
    if (hasta && hasta < desde) {
      setError('La fecha final no puede ser anterior a la inicial.')
      return
    }
    if (
      enviarMail &&
      !window.confirm('Este anuncio también va a salir por mail a todas las destinatarias. ¿Publicarlo?')
    ) {
      return
    }
    setEnviando(true)
    try {
      await crearAnuncio({ titulo, mensaje, para, importante, desde, hasta: hasta || null, enviarMail })
      setTitulo('')
      setMensaje('')
      setImportante(false)
      setHasta('')
      setEnviarMail(false)
      onCreado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo publicar el anuncio.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form className="form-caja" onSubmit={publicar}>
      <label htmlFor="anuncio-titulo">Título (opcional)</label>
      <input
        id="anuncio-titulo"
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        maxLength={80}
        placeholder="Ej: Feriado del lunes"
      />

      <label htmlFor="anuncio-mensaje">Mensaje</label>
      <textarea
        id="anuncio-mensaje"
        value={mensaje}
        onChange={(e) => setMensaje(e.target.value)}
        rows={3}
        maxLength={600}
        placeholder="Ej: El lunes 17 no hay clases por el feriado. ¡Nos vemos el martes!"
        required
      />

      <div className="grilla-campos">
        <div>
          <label htmlFor="anuncio-para">Para quiénes</label>
          <select id="anuncio-para" value={para} onChange={(e) => setPara(e.target.value as PublicoAnuncio)}>
            {(Object.keys(ETIQUETA_PUBLICO) as PublicoAnuncio[]).map((p) => (
              <option key={p} value={p}>
                {ETIQUETA_PUBLICO[p]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="anuncio-desde">Se ve desde</label>
          <input id="anuncio-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} required />
        </div>
        <div>
          <label htmlFor="anuncio-hasta">Hasta (opcional)</label>
          <input id="anuncio-hasta" type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} />
        </div>
      </div>

      <label className="deslinde-check">
        <input type="checkbox" checked={importante} onChange={(e) => setImportante(e.target.checked)} />
        <span>Importante (se muestra resaltado)</span>
      </label>
      <label className="deslinde-check">
        <input type="checkbox" checked={enviarMail} onChange={(e) => setEnviarMail(e.target.checked)} />
        <span>Mandarlo también por mail</span>
      </label>

      {error && <p className="mensaje-error">{error}</p>}
      <div className="barra-acciones">
        <button type="submit" disabled={enviando}>
          {enviando ? 'Publicando...' : 'Publicar anuncio'}
        </button>
      </div>
    </form>
  )
}
