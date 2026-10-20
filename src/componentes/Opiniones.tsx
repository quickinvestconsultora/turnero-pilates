import { useCallback, useEffect, useState } from 'react'
import { listarOpiniones, marcarOpinionRevisada } from '../servicios/opiniones'
import type { Opinion } from '../servicios/opiniones'
import { nombreCompleto } from '../personas'
import EnlaceWhatsApp from './EnlaceWhatsApp'

const fechaAr = (iso: string) => new Date(iso).toLocaleDateString('es-AR')

function Estrellas({ n }: { n: number }) {
  return (
    <span className="opinion-estrellas" aria-label={`${n} de 5`}>
      {'★'.repeat(n)}
      <span className="opinion-estrellas--vacias">{'★'.repeat(5 - n)}</span>
    </span>
  )
}

// Opiniones que dejan las alumnas en la encuesta. Las bajas (3 estrellas o menos)
// quedan marcadas hasta que se revisan; el comentario lo ve solo el estudio.
export default function Opiniones() {
  const [lista, setLista] = useState<Opinion[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [soloPendientes, setSoloPendientes] = useState(false)

  const cargar = useCallback(async () => {
    setError('')
    try {
      setLista(await listarOpiniones())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las opiniones.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const alternar = async (o: Opinion) => {
    setError('')
    try {
      await marcarOpinionRevisada(o.id, !o.revisada)
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar.')
    }
  }

  const promedio = lista.length > 0 ? lista.reduce((n, o) => n + o.estrellas, 0) / lista.length : null
  const bajasSinRevisar = lista.filter((o) => o.estrellas <= 3 && !o.revisada).length
  const visibles = soloPendientes ? lista.filter((o) => o.estrellas <= 3 && !o.revisada) : lista

  return (
    <div>
      <h2>Opiniones</h2>
      <p className="ayuda">
        Lo que contestan las alumnas en la encuesta (se les pregunta después de su tercera clase). Si alguien puntúa
        3 estrellas o menos, te llega un mail con su comentario.
      </p>

      {promedio !== null && (
        <div className="kpi-grid">
          <div className="kpi">
            <span className="kpi-valor">{promedio.toFixed(1).replace('.', ',')}</span>
            <span className="kpi-etiqueta">Promedio sobre {lista.length} opiniones</span>
          </div>
          <div className="kpi">
            <span className={bajasSinRevisar > 0 ? 'kpi-valor kpi-valor--negativo' : 'kpi-valor'}>{bajasSinRevisar}</span>
            <span className="kpi-etiqueta">Bajas sin revisar</span>
          </div>
        </div>
      )}

      {error && <p className="mensaje-error">{error}</p>}

      {lista.length > 0 && (
        <div className="filtros-clientes">
          <button type="button" className={!soloPendientes ? 'chip activo' : 'chip'} onClick={() => setSoloPendientes(false)}>
            Todas
          </button>
          <button type="button" className={soloPendientes ? 'chip activo' : 'chip'} onClick={() => setSoloPendientes(true)}>
            Para atender <span className="chip-numero">{bajasSinRevisar}</span>
          </button>
        </div>
      )}

      {cargando ? (
        <p className="vacio">Cargando...</p>
      ) : visibles.length === 0 ? (
        <p className="vacio">
          {lista.length === 0 ? 'Todavía no hay opiniones. Aparecen cuando las alumnas responden la encuesta.' : 'No hay nada para atender.'}
        </p>
      ) : (
        <ul className="lista-clientes">
          {visibles.map((o) => {
            const baja = o.estrellas <= 3
            return (
              <li key={o.id} className="cliente">
                <div className="cliente-datos">
                  <strong>
                    <Estrellas n={o.estrellas} /> {o.perfiles ? nombreCompleto(o.perfiles) : 'Alumna'}
                  </strong>
                  <span className="turno-detalle">{fechaAr(o.creado_en)}</span>
                  {o.comentario && <p className="opinion-comentario">{o.comentario}</p>}
                </div>
                <div className="cliente-enlaces">
                  {o.perfiles && baja && (
                    <EnlaceWhatsApp
                      telefono={o.perfiles.telefono}
                      mensaje={`Hola ${o.perfiles.nombre.trim() || 'hola'}! Te escribimos de FORTEVA Studio: vimos tu opinión y queremos entender cómo podemos mejorar tu experiencia. ¿Podemos charlar un momento?`}
                      etiqueta="Escribirle"
                    />
                  )}
                  {baja && (
                    <button type="button" className="link-secundario" onClick={() => alternar(o)}>
                      {o.revisada ? 'Marcar sin revisar' : 'Ya la revisé'}
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
