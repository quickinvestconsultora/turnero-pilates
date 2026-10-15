import { useCallback, useEffect, useMemo, useState } from 'react'
import { informeProfesoras } from '../servicios/informes'
import type { FilaInformeProfesora } from '../servicios/informes'
import { descargarCsv } from '../csv'
import { finDeMes, hoyIso, inicioDeMes, nombreMes } from '../fechas'

// Informe del mes por profesora para liquidar: clases dadas y asistencia.
// Solo cuenta clases que ya empezaron y no se cancelaron.
export default function InformeProfesoras() {
  const [mes, setMes] = useState(0) // 0 = este mes, -1 = el anterior…
  const [filas, setFilas] = useState<FilaInformeProfesora[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const referencia = useMemo(() => inicioDeMes(hoyIso(), mes), [mes])
  const desde = referencia
  const hasta = finDeMes(referencia)
  const titulo = `${nombreMes(referencia)} ${referencia.slice(0, 4)}`

  const cargar = useCallback(async () => {
    setError('')
    setCargando(true)
    try {
      setFilas(await informeProfesoras(desde, hasta))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el informe.')
    } finally {
      setCargando(false)
    }
  }, [desde, hasta])

  useEffect(() => {
    cargar()
  }, [cargar])

  const totales = filas.reduce(
    (t, f) => ({
      clases: t.clases + f.clases,
      anotadas: t.anotadas + f.anotadas,
      asistieron: t.asistieron + f.asistieron,
      ausentes: t.ausentes + f.ausentes,
    }),
    { clases: 0, anotadas: 0, asistieron: 0, ausentes: 0 },
  )

  const descargar = () =>
    descargarCsv(`informe-profesoras-${referencia.slice(0, 7)}.csv`, [
      ['Profesora', 'Clases dadas', 'Anotadas', 'Asistieron', 'Faltaron', 'Sin marcar', 'Promedio por clase'],
      ...filas.map((f) => [
        f.nombre,
        f.clases,
        f.anotadas,
        f.asistieron,
        f.ausentes,
        f.anotadas - f.asistieron - f.ausentes,
        f.clases > 0 ? (f.anotadas / f.clases).toFixed(1).replace('.', ',') : '',
      ]),
    ])

  return (
    <section className="informe-profesoras">
      <div className="fila-titulo">
        <h3>Informe del mes</h3>
        <div className="barra-acciones">
          <button
            type="button"
            className="link-secundario"
            disabled={mes <= -12}
            onClick={() => setMes((m) => m - 1)}
          >
            ← Anterior
          </button>
          {mes !== 0 && (
            <button type="button" className="link-secundario" onClick={() => setMes(0)}>
              Este mes
            </button>
          )}
        </div>
      </div>
      <p className="ayuda hoy-fecha">{titulo}: clases ya dadas, sin contar las canceladas.</p>

      {error && <p className="mensaje-error">{error}</p>}

      {cargando ? (
        <p className="vacio">Cargando...</p>
      ) : filas.length === 0 ? (
        <p className="vacio">No hubo clases en este mes todavía.</p>
      ) : (
        <>
          <div className="grilla-semana-scroll">
            <table className="tabla-informe">
              <thead>
                <tr>
                  <th>Profesora</th>
                  <th>Clases</th>
                  <th>Anotadas</th>
                  <th>Asistieron</th>
                  <th>Faltaron</th>
                  <th>Sin marcar</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.clave}>
                    <th scope="row">{f.nombre}</th>
                    <td>{f.clases}</td>
                    <td>{f.anotadas}</td>
                    <td>{f.asistieron}</td>
                    <td>{f.ausentes}</td>
                    <td>{f.anotadas - f.asistieron - f.ausentes}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Total</th>
                  <td>{totales.clases}</td>
                  <td>{totales.anotadas}</td>
                  <td>{totales.asistieron}</td>
                  <td>{totales.ausentes}</td>
                  <td>{totales.anotadas - totales.asistieron - totales.ausentes}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <button type="button" className="link-secundario" onClick={descargar}>
            Descargar para Excel
          </button>
        </>
      )}
    </section>
  )
}
