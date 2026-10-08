import { useCallback, useEffect, useMemo, useState } from 'react'
import type { EstadoCuenta, Perfil } from '../tipos'
import { actualizarEstadoCuenta, listarClientes } from '../servicios/clientes'
import { obtenerUrlDeslinde } from '../servicios/deslinde'
import { fechaCorta } from '../fechas'
import { nombreCompleto } from '../personas'
import FichaCliente from './FichaCliente'

const ETIQUETA_ESTADO: Record<EstadoCuenta, string> = {
  prueba: 'Prueba',
  al_dia: 'Al día',
  pendiente: 'Debe',
}

const ETIQUETA_NIVEL: Record<string, string> = {
  principiante: 'Principiante',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
}

// paraProfesora: la versión que ve una profesora (miId = su id): mismas fichas
// y observaciones, pero sin estado de cuenta, pagos ni deslinde.
export default function Clientes({
  paraProfesora = false,
  miId,
}: {
  paraProfesora?: boolean
  miId?: string
}) {
  const [clientes, setClientes] = useState<Perfil[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [busqueda, setBusqueda] = useState('')

  const cargar = useCallback(async () => {
    setError('')
    try {
      setClientes(await listarClientes(paraProfesora))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los clientes.')
    } finally {
      setCargando(false)
    }
  }, [paraProfesora])

  useEffect(() => {
    cargar()
  }, [cargar])

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return clientes
    return clientes.filter(
      (c) =>
        nombreCompleto(c).toLowerCase().includes(q) ||
        (c.telefono ?? '').includes(q) ||
        (c.dni ?? '').includes(q),
    )
  }, [clientes, busqueda])

  return (
    <div>
      <div className="fila-titulo">
        <h2>Clientes</h2>
        <span className="turno-detalle">{clientes.length} en total</span>
      </div>

      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar por nombre o teléfono"
        aria-label="Buscar cliente"
      />

      {error && <p className="mensaje-error">{error}</p>}

      {cargando ? (
        <p className="vacio">Cargando...</p>
      ) : filtrados.length === 0 ? (
        <p className="vacio">
          {clientes.length === 0 ? 'Todavía no hay alumnas registradas.' : 'No hay resultados.'}
        </p>
      ) : (
        <ul className="lista-clientes">
          {filtrados.map((c) => (
            <ClienteItem
              key={c.id}
              cliente={c}
              paraProfesora={paraProfesora}
              miId={miId}
              onCambio={cargar}
              onError={setError}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function ClienteItem({
  cliente,
  paraProfesora,
  miId,
  onCambio,
  onError,
}: {
  cliente: Perfil
  paraProfesora: boolean
  miId?: string
  onCambio: () => void
  onError: (m: string) => void
}) {
  const [ocupado, setOcupado] = useState(false)
  const [errorDeslinde, setErrorDeslinde] = useState('')
  const [fichaAbierta, setFichaAbierta] = useState(false)

  const cambiarEstado = async (estado: EstadoCuenta) => {
    if (estado === cliente.estado_cuenta) return
    setOcupado(true)
    onError('')
    try {
      await actualizarEstadoCuenta(cliente.id, estado)
      onCambio()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'No se pudo actualizar.')
    } finally {
      setOcupado(false)
    }
  }

  const verDeslinde = async () => {
    setErrorDeslinde('')
    try {
      const url = await obtenerUrlDeslinde(cliente.id)
      window.open(url, '_blank', 'noopener')
    } catch {
      setErrorDeslinde('Todavía no tiene el PDF subido.')
    }
  }

  return (
    <li className="cliente">
      <div className="cliente-datos">
        <strong>{nombreCompleto(cliente)}</strong>
        <span className="turno-detalle">
          {cliente.dni ? `DNI ${cliente.dni} · ` : ''}
          {cliente.telefono || 'Sin teléfono'}
          {cliente.nivel ? ` · ${ETIQUETA_NIVEL[cliente.nivel]}` : ''}
          {' · Desde '}
          {fechaCorta(cliente.creado_en.slice(0, 10))}
        </span>
        <div className="cliente-enlaces">
          <button
            type="button"
            className="link-secundario enlace-deslinde"
            onClick={() => setFichaAbierta(!fichaAbierta)}
          >
            {fichaAbierta ? 'Cerrar ficha' : 'Ver ficha y observaciones'}
          </button>
          {!paraProfesora && (
            <button type="button" className="link-secundario enlace-deslinde" onClick={verDeslinde}>
              Ver deslinde firmado
            </button>
          )}
        </div>
        {errorDeslinde && <span className="mensaje-error">{errorDeslinde}</span>}
      </div>

      {!paraProfesora && (
        <div className={`estado-cuenta estado-cuenta--${cliente.estado_cuenta}`}>
          {ETIQUETA_ESTADO[cliente.estado_cuenta]}
        </div>
      )}

      {!paraProfesora && (
      <div className="asistencia cliente-acciones">
        <button
          type="button"
          className={cliente.estado_cuenta === 'prueba' ? 'activo-neutro' : ''}
          disabled={ocupado}
          onClick={() => cambiarEstado('prueba')}
        >
          Prueba
        </button>
        <button
          type="button"
          className={cliente.estado_cuenta === 'al_dia' ? 'activo-si' : ''}
          disabled={ocupado}
          onClick={() => cambiarEstado('al_dia')}
        >
          Al día
        </button>
        <button
          type="button"
          className={cliente.estado_cuenta === 'pendiente' ? 'activo-no' : ''}
          disabled={ocupado}
          onClick={() => cambiarEstado('pendiente')}
        >
          Debe
        </button>
      </div>
      )}

      {fichaAbierta && (
        <FichaCliente cliente={cliente} onCambio={onCambio} paraProfesora={paraProfesora} miId={miId} />
      )}
    </li>
  )
}
