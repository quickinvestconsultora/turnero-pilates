import { useCallback, useEffect, useState } from 'react'
import type { Profesora } from '../tipos'
import { listarProfesoras } from '../servicios/profesoras'
import { actualizarRol } from '../servicios/clientes'
import FotoProfe from './FotoProfe'

// Pestaña de administración: las profesoras del estudio. Cada una arma sus
// turnos desde su propia pantalla; acá se las ve y, si hace falta, se las
// devuelve a alumna.
export default function Profesores() {
  const [profesoras, setProfesoras] = useState<Profesora[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    setError('')
    try {
      setProfesoras(await listarProfesoras())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las profesoras.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const devolverAAlumna = async (p: Profesora) => {
    if (
      !window.confirm(
        `¿Devolver a ${p.nombre} a alumna?\n\nDeja de ver su pantalla de profesora. Los turnos que ya cargó se mantienen.`,
      )
    ) {
      return
    }
    setError('')
    try {
      await actualizarRol(p.id, 'alumno')
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar el rol.')
    }
  }

  return (
    <div>
      <div className="fila-titulo">
        <h2>Profesores</h2>
        <span className="turno-detalle">{profesoras.length} en total</span>
      </div>
      <p className="ayuda">
        Al cargar un turno (suelto o fijo) elegís a qué profesora le corresponde, y ella lo ve y lo
        maneja desde su pantalla. Para sumar una profesora, que se registre como alumna y pasala a
        profesora desde <em>Clientes → Ver ficha → Más opciones</em>.
      </p>

      {error && <p className="mensaje-error">{error}</p>}

      {cargando ? (
        <p className="vacio">Cargando...</p>
      ) : profesoras.length === 0 ? (
        <p className="vacio">Todavía no hay profesoras cargadas.</p>
      ) : (
        <ul className="lista-profesoras">
          {profesoras.map((p) => (
            <li key={p.id} className="profesora-item">
              <FotoProfe url={p.foto_url} nombre={p.nombre} tam={56} />
              <div className="profesora-datos">
                <strong>{p.nombre || 'Sin nombre todavía'}</strong>
                <span className="profesora-bio-corta">{p.bio || 'Todavía no cargó su descripción.'}</span>
                <details className="ficha-avanzado">
                  <summary>Más opciones</summary>
                  <button type="button" className="boton-mini" onClick={() => devolverAAlumna(p)}>
                    Devolver a alumna
                  </button>
                </details>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
