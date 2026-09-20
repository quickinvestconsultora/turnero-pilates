import { TEXTO_DESLINDE } from '../config/deslinde'

type Props = {
  aceptado: boolean
  onCambiar: (aceptado: boolean) => void
}

export default function AceptarDeslinde({ aceptado, onCambiar }: Props) {
  return (
    <div className="deslinde">
      <details className="deslinde-texto">
        <summary>Leer el deslinde de responsabilidad</summary>
        {TEXTO_DESLINDE.split('\n\n').map((parrafo, i) => (
          <p key={i}>{parrafo}</p>
        ))}
      </details>

      <label className="deslinde-check">
        <input
          type="checkbox"
          checked={aceptado}
          onChange={(e) => onCambiar(e.target.checked)}
          required
        />
        Leí y acepto el deslinde de responsabilidad.
      </label>
    </div>
  )
}
