import { useEffect, useState } from 'react'
import { enviarEncuesta, hayEncuestaPendiente, omitirEncuesta } from '../servicios/opiniones'
import { GOOGLE_RESENIAS_URL } from '../config/resenias'

// Encuesta corta en la pantalla de la alumna: "¿cómo venís?". Si puntúa alto y el
// estudio cargó el link de Google, le sugiere dejar una reseña; si puntúa bajo,
// el comentario le llega en privado al estudio.
export default function EncuestaClase() {
  const [visible, setVisible] = useState(false)
  const [estrellas, setEstrellas] = useState(0)
  const [comentario, setComentario] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [gracias, setGracias] = useState<number | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    hayEncuestaPendiente()
      .then(setVisible)
      .catch(() => setVisible(false))
  }, [])

  if (gracias !== null) {
    const alta = gracias >= 4
    return (
      <div className="encuesta">
        <p>
          <strong>¡Gracias por contarnos!</strong>{' '}
          {alta
            ? GOOGLE_RESENIAS_URL
              ? 'Nos alegra que lo estés disfrutando. ¿Nos dejás una reseña en Google? Ayuda muchísimo.'
              : 'Nos alegra que lo estés disfrutando.'
            : 'Tomamos nota de lo que nos dijiste para mejorar.'}
        </p>
        <div className="barra-acciones">
          {alta && GOOGLE_RESENIAS_URL && (
            <a className="btn-fantasma" href={GOOGLE_RESENIAS_URL} target="_blank" rel="noopener noreferrer">
              Dejar una reseña
            </a>
          )}
          <button type="button" className="link-secundario" onClick={() => setGracias(null)}>
            Cerrar
          </button>
        </div>
      </div>
    )
  }

  if (!visible) return null

  const enviar = async () => {
    if (estrellas === 0) return
    setError('')
    setEnviando(true)
    try {
      await enviarEncuesta(estrellas, comentario)
      setVisible(false)
      setGracias(estrellas)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar. Probá de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  const ahoraNo = async () => {
    setVisible(false)
    try {
      await omitirEncuesta()
    } catch {
      // Si no se pudo anotar, la pregunta puede volver a aparecer: no pasa nada.
    }
  }

  return (
    <div className="encuesta">
      <p>
        <strong>¿Cómo venís con tus clases en FORTEVA?</strong>
        <br />
        <span className="ayuda">Tu opinión nos ayuda a mejorar.</span>
      </p>
      <div className="encuesta-estrellas" role="radiogroup" aria-label="Puntuación de 1 a 5 estrellas">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={estrellas === n}
            aria-label={`${n} ${n === 1 ? 'estrella' : 'estrellas'}`}
            className={n <= estrellas ? 'estrella estrella--llena' : 'estrella'}
            onClick={() => setEstrellas(n)}
          >
            ★
          </button>
        ))}
      </div>
      {estrellas > 0 && (
        <textarea
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder={estrellas >= 4 ? '¿Qué es lo que más te gusta? (opcional)' : '¿Qué podemos mejorar? (opcional)'}
          aria-label="Comentario"
        />
      )}
      {error && <p className="mensaje-error">{error}</p>}
      <div className="barra-acciones">
        <button type="button" disabled={estrellas === 0 || enviando} onClick={enviar}>
          {enviando ? 'Enviando...' : 'Enviar'}
        </button>
        <button type="button" className="link-secundario" onClick={ahoraNo}>
          Ahora no
        </button>
      </div>
    </div>
  )
}
