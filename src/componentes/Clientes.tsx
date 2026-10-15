import { useCallback, useEffect, useMemo, useState } from 'react'
import type { EstadoCuenta, Perfil } from '../tipos'
import { actualizarEstadoCuenta, listarClientes } from '../servicios/clientes'
import { obtenerUrlDeslinde } from '../servicios/deslinde'
import { abonoVencido, diaMes } from '../cuenta'
import { fechaCorta, hoyIso, sumarDias } from '../fechas'
import { nombreCompleto } from '../personas'
import { mensajeCliente } from '../whatsapp'
import EnlaceWhatsApp from './EnlaceWhatsApp'
import { descargarCsv } from '../csv'
import ComprobantesPendientes from './ComprobantesPendientes'
import ControlRecordatorios from './ControlRecordatorios'
import FichaCliente from './FichaCliente'
import RegistrarPago from './RegistrarPago'
import type { ModoPago } from './RegistrarPago'

const ETIQUETA_ESTADO: Record<EstadoCuenta, string> = {
  prueba: 'Prueba',
  al_dia: 'Al día',
  pendiente: 'Debe',
}

type Filtro = 'todas' | 'vencen' | 'vencidas' | 'debe' | 'prueba' | 'al_dia'

const ETIQUETA_FILTRO: [Filtro, string][] = [
  ['todas', 'Todas'],
  ['vencen', 'Vencen esta semana'],
  ['vencidas', 'Vencidas'],
  ['debe', 'Deben'],
  ['prueba', 'Prueba'],
  ['al_dia', 'Al día'],
]

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
  const [filtro, setFiltro] = useState<Filtro>('todas')

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

  const resumen = useMemo(() => {
    const en7 = sumarDias(hoyIso(), 7)
    const cuenta: Record<Filtro, (c: Perfil) => boolean> = {
      todas: () => true,
      vencen: (c) =>
        c.estado_cuenta === 'al_dia' &&
        !abonoVencido(c) &&
        c.al_dia_hasta !== null &&
        c.al_dia_hasta <= en7,
      vencidas: (c) => abonoVencido(c),
      debe: (c) => c.estado_cuenta === 'pendiente',
      prueba: (c) => c.estado_cuenta === 'prueba',
      al_dia: (c) => c.estado_cuenta === 'al_dia' && !abonoVencido(c),
    }
    const numeros = Object.fromEntries(
      (Object.keys(cuenta) as Filtro[]).map((f) => [f, clientes.filter(cuenta[f]).length]),
    ) as Record<Filtro, number>
    return { cuenta, numeros }
  }, [clientes])

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    let lista = paraProfesora ? clientes : clientes.filter(resumen.cuenta[filtro])
    if (q) {
      lista = lista.filter(
        (c) =>
          nombreCompleto(c).toLowerCase().includes(q) ||
          (c.telefono ?? '').includes(q) ||
          (c.dni ?? '').includes(q),
      )
    }
    // En los filtros de vencimiento, primero las que vencen antes.
    if (filtro === 'vencen' || filtro === 'vencidas') {
      lista = [...lista].sort((a, b) => (a.al_dia_hasta ?? '').localeCompare(b.al_dia_hasta ?? ''))
    }
    return lista
  }, [clientes, busqueda, filtro, paraProfesora, resumen])

  // Exporta lo que se está viendo (respeta el filtro y la búsqueda).
  const exportar = () => {
    const estadoTexto = (c: Perfil) =>
      abonoVencido(c)
        ? 'Abono vencido'
        : c.estado_cuenta === 'al_dia'
          ? 'Al día'
          : ETIQUETA_ESTADO[c.estado_cuenta]
    descargarCsv(`clientes-${hoyIso()}.csv`, [
      ['Apellido', 'Nombre', 'DNI', 'Celular', 'Nivel', 'Estado de cuenta', 'Abono cubre hasta', 'Alta'],
      ...filtrados.map((c) => [
        c.apellido,
        c.nombre,
        c.dni,
        c.telefono,
        c.nivel ? ETIQUETA_NIVEL[c.nivel] : '',
        estadoTexto(c),
        c.al_dia_hasta ? c.al_dia_hasta.split('-').reverse().join('/') : '',
        c.creado_en.slice(0, 10).split('-').reverse().join('/'),
      ]),
    ])
  }

  return (
    <div>
      <div className="fila-titulo">
        <h2>Clientes</h2>
        <div className="barra-acciones">
          <span className="turno-detalle">{clientes.length} en total</span>
          {!paraProfesora && (
            <button type="button" className="link-secundario" onClick={exportar}>
              Descargar para Excel
            </button>
          )}
        </div>
      </div>

      {!paraProfesora && <ControlRecordatorios />}

      {!paraProfesora && <ComprobantesPendientes onCambio={cargar} />}

      {!paraProfesora && (
        <div className="filtros-clientes" role="group" aria-label="Filtrar por estado de cuenta">
          {ETIQUETA_FILTRO.map(([f, etiqueta]) => (
            <button
              key={f}
              type="button"
              className={filtro === f ? 'chip activo' : 'chip'}
              onClick={() => setFiltro(f)}
            >
              {etiqueta} <span className="chip-numero">{resumen.numeros[f]}</span>
            </button>
          ))}
        </div>
      )}

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
  const [pagando, setPagando] = useState<ModoPago | null>(null)

  const vencido = abonoVencido(cliente)

  const conManejo = async (accion: () => Promise<void>) => {
    setOcupado(true)
    onError('')
    try {
      await accion()
      onCambio()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'No se pudo actualizar.')
    } finally {
      setOcupado(false)
    }
  }

  const cambiarEstado = (estado: 'prueba' | 'pendiente') => {
    if (estado === cliente.estado_cuenta) return
    return conManejo(() => actualizarEstadoCuenta(cliente.id, estado))
  }

  // "Al día" y "+1 mes" siempre registran el pago (monto, medio, hasta cuándo).
  const pedirPago = (modo: ModoPago) => {
    if (modo === 'este-mes' && cliente.estado_cuenta === 'al_dia' && !vencido) return
    setPagando(modo)
  }

  const etiquetaEstado =
    cliente.estado_cuenta === 'al_dia' && cliente.al_dia_hasta
      ? vencido
        ? `Venció el ${diaMes(cliente.al_dia_hasta)}`
        : `Al día hasta el ${diaMes(cliente.al_dia_hasta)}`
      : ETIQUETA_ESTADO[cliente.estado_cuenta]

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
          <EnlaceWhatsApp
            telefono={cliente.telefono}
            mensaje={
              paraProfesora
                ? `Hola ${cliente.nombre.trim() || 'hola'}! Te escribimos de FORTEVA Studio.`
                : mensajeCliente(cliente)
            }
          />
        </div>
        {errorDeslinde && <span className="mensaje-error">{errorDeslinde}</span>}
      </div>

      {!paraProfesora && (
        <div
          className={`estado-cuenta estado-cuenta--${vencido ? 'pendiente' : cliente.estado_cuenta}`}
        >
          {etiquetaEstado}
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
          onClick={() => pedirPago('este-mes')}
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
        {cliente.estado_cuenta === 'al_dia' && (
          <button
            type="button"
            className="boton-mini"
            disabled={ocupado}
            onClick={() => pedirPago('sumar')}
          >
            +1 mes
          </button>
        )}
      </div>
      )}

      {pagando && !paraProfesora && (
        <RegistrarPago
          cliente={cliente}
          modo={pagando}
          onRegistrado={() => {
            setPagando(null)
            onCambio()
          }}
          onCerrar={() => setPagando(null)}
        />
      )}

      {fichaAbierta && (
        <FichaCliente cliente={cliente} onCambio={onCambio} paraProfesora={paraProfesora} miId={miId} />
      )}
    </li>
  )
}
