import { useState } from 'react'

type Props = {
  id: string
  value: string
  onChange: (valor: string) => void
  autoComplete: string
  minLength?: number
  required?: boolean
}

// Input de contraseña con un botón de ojo para mostrar/ocultar lo escrito.
export default function CampoPassword({ id, value, onChange, autoComplete, minLength, required }: Props) {
  const [ver, setVer] = useState(false)

  return (
    <div className="campo-password">
      <input
        id={id}
        type={ver ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        minLength={minLength}
        required={required}
      />
      <button
        type="button"
        className="boton-ver-password"
        onClick={() => setVer((v) => !v)}
        aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        aria-pressed={ver}
      >
        {ver ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path
              d="M3 3l18 18M10.6 10.6a2.5 2.5 0 0 0 3.5 3.5M9.4 5.3A10.4 10.4 0 0 1 12 5c5.5 0 9 4.5 10 7-.5 1.2-1.4 2.6-2.7 3.8M6.4 6.6C4.2 8 2.6 10 2 12c1 2.5 4.5 7 10 7 1.4 0 2.7-.3 3.9-.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path
              d="M2 12c1-2.5 4.5-7 10-7s9 4.5 10 7c-1 2.5-4.5 7-10 7s-9-4.5-10-7z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  )
}
