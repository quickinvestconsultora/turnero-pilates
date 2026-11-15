import { TUTORIAL } from '../config/tutorial'

// Ventana "Ayuda": cómo usar la app, un apartado desplegable por tema. El contenido está en
// src/config/tutorial.ts.
export default function TutorialAlumna({ onCerrar }: { onCerrar: () => void }) {
  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal tutorial" onClick={(e) => e.stopPropagation()}>
        <h2>Cómo usar la app</h2>
        <p className="subtitulo">Tocá un tema para ver cómo se hace.</p>
        <div className="tutorial-lista">
          {TUTORIAL.map((a, i) => (
            <details key={a.titulo} className="tutorial-apartado" open={i === 0}>
              <summary>{a.titulo}</summary>
              <ol>
                {a.pasos.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ol>
            </details>
          ))}
        </div>
        <div className="modal-botones">
          <button type="button" onClick={onCerrar}>
            Entendido
          </button>
        </div>
      </div>
    </div>
  )
}
