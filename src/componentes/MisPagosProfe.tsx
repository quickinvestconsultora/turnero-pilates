import { useEffect, useMemo, useState } from 'react'
import { listarPagosProfesoras, miLiquidacion } from '../servicios/gestion'
import type { MiLiquidacion, PagoProfesora } from '../servicios/gestion'
import { ETIQUETA_MEDIO } from '../servicios/clientes'
import { hoyIso, inicioDeMes, nombreMes } from '../fechas'

const pesos = (n: number) =>
  n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })

const fechaAr = (iso: string) => iso.split('-').reverse().join('/')

// Pantalla de la profesora: cuántas clases dio en el mes, cuánto le corresponde
// y el registro de lo que el estudio le fue pagando.
export default function MisPagosProfe({ miId }: { miId: string }) {
  const [mes, setMes] = useState(0)
  const [liq, setLiq] = useState<MiLiquidacion | null>(null)
  const [pagos, setPagos] = useState<PagoProfesora[] | null>(null)
  const [error, setError] = useState('')

  const referencia = useMemo(() => inicioDeMes(hoyIso(), mes), [mes])
  const titulo = `${nombreMes(referencia)} ${referencia.slice(0, 4)}`

  useEffect(() => {
    setLiq(null)
    miLiquidacion(referencia)
      .then(setLiq)
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo cargar tu liquidación.'))
  }, [referencia])

  useEffect(() => {
    listarPagosProfesoras({ profesoraId: miId })
      .then(setPagos)
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudieron cargar tus pagos.'))
  }, [miId])

  const delMes = (pagos ?? []).filter((p) => p.periodo === referencia)

  return (
    <div>
      <div className="fila-titulo">
        <h2>Mis pagos</h2>
        <div className="barra-acciones">
          <button type="button" className="link-secundario" disabled={mes <= -12} onClick={() => setMes((m) => m - 1)}>
            ← Anterior
          </button>
          {mes !== 0 && (
            <button type="button" className="link-secundario" onClick={() => setMes(0)}>
              Este mes
            </button>
          )}
        </div>
      </div>
      <p className="ayuda hoy-fecha">{titulo}: clases que ya diste, sin contar las canceladas.</p>

      {error && <p className="mensaje-error">{error}</p>}

      {!liq ? (
        <p className="vacio">Cargando...</p>
      ) : (
        <>
          <div className="cobros-resumen">
            <div>
              <span className="ayuda">Clases dadas</span>
              <strong>{liq.clases}</strong>
            </div>
            <div>
              <span className="ayuda">Te corresponde</span>
              <strong>{liq.a_pagar === null ? 'A definir' : pesos(liq.a_pagar)}</strong>
            </div>
            <div>
              <span className="ayuda">Ya cobraste</span>
              <strong>{pesos(liq.pagado)}</strong>
            </div>
          </div>
          {liq.valor_clase !== null && (
            <p className="ayuda">
              Valor por clase: {pesos(liq.valor_clase)}.
              {liq.saldo !== null && liq.saldo > 0 && ` Te falta cobrar ${pesos(liq.saldo)}.`}
              {liq.saldo !== null && liq.saldo <= 0 && liq.clases > 0 && ' Estás al día.'}
            </p>
          )}
          {liq.valor_clase === null && (
            <p className="ayuda">El estudio todavía no cargó tu valor por clase.</p>
          )}
        </>
      )}

      <h3>Pagos de {nombreMes(referencia)}</h3>
      {pagos === null ? (
        <p className="ayuda">Cargando...</p>
      ) : delMes.length === 0 ? (
        <p className="ayuda">Todavía no hay pagos registrados en este mes.</p>
      ) : (
        <ul className="ficha-historial">
          {delMes.map((p) => (
            <li key={p.id}>
              <span>
                {fechaAr(p.fecha)} · {ETIQUETA_MEDIO[p.medio]}
                {p.nota && <span className="ayuda"> · {p.nota}</span>}
              </span>
              <strong>{pesos(p.monto)}</strong>
            </li>
          ))}
        </ul>
      )}

      <h3>Todo mi historial</h3>
      {pagos === null ? (
        <p className="ayuda">Cargando...</p>
      ) : pagos.length === 0 ? (
        <p className="ayuda">Todavía no tenés pagos registrados.</p>
      ) : (
        <ul className="ficha-historial">
          {pagos.map((p) => (
            <li key={p.id}>
              <span>
                {fechaAr(p.fecha)} · liquidación de {nombreMes(p.periodo)} {p.periodo.slice(0, 4)}
                <span className="ayuda">
                  {' '}
                  · {ETIQUETA_MEDIO[p.medio]}
                  {p.clases > 0 && ` · ${p.clases} clase${p.clases === 1 ? '' : 's'}`}
                </span>
              </span>
              <strong>{pesos(p.monto)}</strong>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
