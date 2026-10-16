import { useCallback, useEffect, useState } from 'react'
import { listarParaReactivar, marcarReactivacion } from '../servicios/reactivar'
import type { AlumnaParaReactivar, MotivoReactivar } from '../servicios/reactivar'
import { diaMes } from '../cuenta'
import { fechaCorta } from '../fechas'
import { nombreCompleto } from '../personas'
import { mensajeReactivar } from '../whatsapp'
import EnlaceWhatsApp from './EnlaceWhatsApp'

const OPCIONES_DIAS = [14, 21, 30, 45]
const DIAS_DE_DESCANSO = 30 // después de escribirle, no aparece por este tiempo

const ETIQUETA_MOTIVO: Record<MotivoReactivar, string> = {
  sin_venir: 'Dejó de venir',
  vencido: 'Abono vencido sin renovar',
  sin_empezar: 'Nunca vino',
}

function diasDesde(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const hoy = new Date()
  const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  return Math.round((base.getTime() - new Date(y, m - 1, d).getTime()) / 86_400_000)
}

// Alumnas para volver a invitar: dejaron de venir, no renovaron o se registraron
// y nunca reservaron. Cada una trae el mensaje de WhatsApp armado; al tocarlo
// queda anotado que se le escribió y la lista la esconde por un tiempo.
export default function Reactivar() {
  const [dias, setDias] = useState(21)
  const [lista, setLista] = useState<AlumnaParaReactivar[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [verContactadas, setVerContactadas] = useState(false)

  const cargar = useCallback(async () => {
    setError('')
    setCargando(true)
    try {
      setLista(await listarParaReactivar(dias))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la lista.')
    } finally {
      setCargando(false)
    }
  }, [dias])

  useEffect(() => {
    cargar()
  }, [cargar])

  const contactadaReciente = (a: AlumnaParaReactivar) =>
    a.avisada_en !== null && diasDesde(a.avisada_en) < DIAS_DE_DESCANSO

  const pendientes = lista.filter((a) => !contactadaReciente(a))
  const contactadas = lista.filter(contactadaReciente)
  const visibles = verContactadas ? lista : pendientes

  const anotarContacto = async (a: AlumnaParaReactivar) => {
    try {
      await marcarReactivacion(a.alumna_id)
      setLista((l) =>
        l.map((x) => (x.alumna_id === a.alumna_id ? { ...x, avisada_en: new Date().toISOString() } : x)),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo anotar el contacto.')
    }
  }

  return (
    <div>
      <div className="fila-titulo">
        <h2>Para reactivar</h2>
        <span className="turno-detalle">{pendientes.length} para escribirles</span>
      </div>
      <p className="ayuda">
        Alumnas sin ninguna clase reservada que dejaron de venir. Tocá WhatsApp: se abre el chat con el
        mensaje escrito y queda anotado que les escribiste.
      </p>

      <div className="filtros-clientes" role="group" aria-label="Hace cuánto dejaron de venir">
        {OPCIONES_DIAS.map((n) => (
          <button
            key={n}
            type="button"
            className={dias === n ? 'chip activo' : 'chip'}
            onClick={() => setDias(n)}
          >
            {n} días sin venir
          </button>
        ))}
      </div>

      {error && <p className="mensaje-error">{error}</p>}

      {cargando ? (
        <p className="vacio">Cargando...</p>
      ) : visibles.length === 0 ? (
        <p className="vacio">
          {contactadas.length > 0
            ? 'No queda nadie por contactar. ¡Buen trabajo!'
            : 'Nadie para reactivar con este criterio.'}
        </p>
      ) : (
        <ul className="lista-clientes">
          {visibles.map((a) => (
            <li key={a.alumna_id} className="cliente">
              <div className="cliente-datos">
                <strong>{nombreCompleto(a)}</strong>
                <span className="turno-detalle">
                  {a.ultima_clase
                    ? `Última clase: ${fechaCorta(a.ultima_clase)} (hace ${diasDesde(a.ultima_clase)} días) · ${a.clases} en total`
                    : 'Todavía no tuvo ninguna clase'}
                </span>
                <span className="turno-detalle">
                  <span className={`etiqueta-motivo etiqueta-motivo--${a.motivo}`}>
                    {ETIQUETA_MOTIVO[a.motivo]}
                  </span>
                  {a.motivo === 'vencido' && a.al_dia_hasta && ` · venció el ${diaMes(a.al_dia_hasta)}`}
                  {a.avisada_en && ` · le escribiste hace ${diasDesde(a.avisada_en)} días`}
                </span>
              </div>
              <div className="cliente-enlaces">
                {a.telefono ? (
                  <EnlaceWhatsApp
                    telefono={a.telefono}
                    mensaje={mensajeReactivar(a.nombre, a.motivo, a.al_dia_hasta)}
                    etiqueta={a.avisada_en ? 'Escribirle de nuevo' : 'WhatsApp'}
                    onClick={() => anotarContacto(a)}
                  />
                ) : (
                  <span className="ayuda">Sin teléfono</span>
                )}
                {!a.avisada_en && a.telefono && (
                  <button type="button" className="link-secundario" onClick={() => anotarContacto(a)}>
                    Ya le escribí
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {contactadas.length > 0 && (
        <button type="button" className="link-secundario" onClick={() => setVerContactadas((v) => !v)}>
          {verContactadas
            ? 'Esconder las que ya contacté'
            : `Mostrar las ${contactadas.length} que ya contacté`}
        </button>
      )}
    </div>
  )
}
