import { useEffect, useMemo, useState } from 'react'
import type { Perfil } from '../tipos'
import { listarClientes } from '../servicios/clientes'
import { nombreCompleto } from '../personas'
import CobrosDelMes from './CobrosDelMes'
import Egresos from './Egresos'
import GastosFijos from './GastosFijos'
import OtrosIngresos from './OtrosIngresos'
import PagoManual from './PagoManual'
import PanoramaFinanciero from './PanoramaFinanciero'

export type PestañaFinanzas = 'panorama' | 'cobros' | 'gastos' | 'ingresos' | 'fijos'

const PESTAÑAS: [PestañaFinanzas, string][] = [
  ['panorama', 'Panorama'],
  ['cobros', 'Cobros'],
  ['gastos', 'Gastos'],
  ['ingresos', 'Otros ingresos'],
  ['fijos', 'Gastos fijos'],
]

// Gestión financiera del negocio: panorama (ingresos, egresos, ganancia, costo por
// clase, punto de equilibrio), cobros a alumnas, gastos, otros ingresos y gastos fijos.
export default function Finanzas({ inicial = 'panorama' }: { inicial?: PestañaFinanzas }) {
  const [pestaña, setPestaña] = useState<PestañaFinanzas>(inicial)

  useEffect(() => {
    setPestaña(inicial)
  }, [inicial])

  return (
    <div>
      <h2>Finanzas</h2>
      <nav className="tabs subtabs" aria-label="Secciones de finanzas">
        {PESTAÑAS.map(([clave, etiqueta]) => (
          <button
            key={clave}
            type="button"
            className={pestaña === clave ? 'tab activa' : 'tab'}
            onClick={() => setPestaña(clave)}
          >
            {etiqueta}
          </button>
        ))}
      </nav>

      {pestaña === 'panorama' && <PanoramaFinanciero />}
      {pestaña === 'cobros' && <CobrosConCarga />}
      {pestaña === 'gastos' && <Egresos />}
      {pestaña === 'ingresos' && <OtrosIngresos />}
      {pestaña === 'fijos' && <GastosFijos />}
    </div>
  )
}

// Cobros del mes con un acceso directo para cargar un cobro "por fuera" (efectivo,
// transferencia directa) sin entrar a la ficha: se elige a la alumna y se carga.
function CobrosConCarga() {
  const [abierto, setAbierto] = useState(false)
  const [clientes, setClientes] = useState<Perfil[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [elegida, setElegida] = useState<Perfil | null>(null)
  const [recarga, setRecarga] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!abierto || clientes.length > 0) return
    listarClientes()
      .then(setClientes)
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudieron cargar las alumnas.'))
  }, [abierto, clientes.length])

  const resultados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return []
    return clientes
      .filter((c) => nombreCompleto(c).toLowerCase().includes(q) || (c.telefono ?? '').includes(q))
      .slice(0, 6)
  }, [clientes, busqueda])

  const cerrar = () => {
    setAbierto(false)
    setElegida(null)
    setBusqueda('')
  }

  return (
    <div>
      <div className="fila-titulo">
        <h3>Cobros a alumnas</h3>
        <button type="button" className="link-secundario" onClick={() => (abierto ? cerrar() : setAbierto(true))}>
          {abierto ? 'Cerrar' : '+ Cargar un cobro'}
        </button>
      </div>

      {abierto && (
        <div className="form-caja">
          {error && <p className="mensaje-error">{error}</p>}
          {!elegida ? (
            <>
              <label htmlFor="cobro-busqueda">¿De quién es el cobro?</label>
              <input
                id="cobro-busqueda"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre o teléfono"
                autoFocus
              />
              {resultados.length > 0 && (
                <ul className="ficha-historial">
                  {resultados.map((c) => (
                    <li key={c.id}>
                      <span>
                        {nombreCompleto(c)} <span className="ayuda">· {c.telefono || 'sin teléfono'}</span>
                      </span>
                      <button type="button" className="boton-mini" onClick={() => setElegida(c)}>
                        Elegir
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {busqueda.trim() && resultados.length === 0 && clientes.length > 0 && (
                <p className="ayuda">No hay alumnas con ese nombre.</p>
              )}
            </>
          ) : (
            <PagoManual
              alumna={{ id: elegida.id, nombre: elegida.nombre }}
              onRegistrado={() => {
                cerrar()
                setRecarga((n) => n + 1)
              }}
              onCerrar={cerrar}
            />
          )}
        </div>
      )}

      <CobrosDelMes key={recarga} />
    </div>
  )
}
