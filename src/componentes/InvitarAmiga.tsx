import { useEffect, useState } from 'react'
import { linkDeReferido, miCodigoReferido, misReferidos, referidosActivos } from '../servicios/referidos'
import type { MiReferida } from '../servicios/referidos'
import { BENEFICIO_REFERIDOS } from '../config/referidos'

const ETIQUETA_ESTADO: Record<MiReferida['estado'], string> = {
  registrada: 'se registró',
  vino: 'ya vino a clase',
  pago: 'ya es parte del estudio',
}

// "Traé a una amiga" dentro de Mi cuenta: su link y su código, cómo compartirlos y
// cómo van las amigas que ya se registraron. No se muestra si el estudio todavía
// no activó los referidos (interruptor en Clientes → Referidos).
export default function InvitarAmiga() {
  const [activos, setActivos] = useState(false)
  const [codigo, setCodigo] = useState<string | null>(null)
  const [amigas, setAmigas] = useState<MiReferida[]>([])
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    referidosActivos()
      .then(async (a) => {
        setActivos(a)
        if (!a) return
        setCodigo(await miCodigoReferido())
        setAmigas(await misReferidos())
      })
      .catch(() => setActivos(false))
  }, [])

  if (!activos || !codigo) return null

  const link = linkDeReferido(codigo)
  const mensaje = `Hola! Te invito a FORTEVA Studio, donde hago Pilates & Strength. Registrate con mi link y reservá tu primera clase: ${link}`

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopiado(true)
      window.setTimeout(() => setCopiado(false), 2500)
    } catch {
      window.prompt('Copiá este link:', link)
    }
  }

  return (
    <>
      <h3>Traé a una amiga</h3>
      <p className="ayuda">{BENEFICIO_REFERIDOS}</p>
      <p className="invitar-codigo">
        Tu código: <strong>{codigo}</strong>
      </p>
      <div className="barra-acciones">
        <a
          className="btn-fantasma"
          href={`https://wa.me/?text=${encodeURIComponent(mensaje)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Compartir por WhatsApp
        </a>
        <button type="button" className="link-secundario" onClick={copiar}>
          {copiado ? '¡Link copiado!' : 'Copiar mi link'}
        </button>
      </div>
      {amigas.length > 0 && (
        <ul className="ficha-historial">
          {amigas.map((a, i) => (
            <li key={i}>
              <span>
                {a.nombre || 'Tu amiga'} <span className="ayuda">· {ETIQUETA_ESTADO[a.estado]}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
