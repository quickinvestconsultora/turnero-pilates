import { useEffect, useState } from 'react'
import type { Perfil } from '../tipos'
import { cerrarSesion } from '../servicios/perfil'
import { contarComprobantesPendientes } from '../servicios/comprobantes'
import CabeceraApp from './CabeceraApp'
import Hoy from './Hoy'
import AgendaStaff from './AgendaStaff'
import SemanaGrilla from './SemanaGrilla'
import PlantillasStaff from './PlantillasStaff'
import Estadisticas from './Estadisticas'
import Clientes from './Clientes'
import Profesores from './Profesores'
import Respaldo from './Respaldo'
import Reactivar from './Reactivar'
import Resumen from './Resumen'
import Finanzas from './Finanzas'
import type { PestañaFinanzas } from './Finanzas'
import AnunciosStaff from './AnunciosStaff'

type Vista = 'hoy' | 'agenda' | 'semana' | 'plantillas' | 'administracion'
type Seccion =
  | 'resumen'
  | 'clientes'
  | 'reactivar'
  | 'profesores'
  | 'finanzas'
  | 'estadisticas'
  | 'anuncios'
  | 'respaldo'

const PESTAÑAS: [Vista, string][] = [
  ['hoy', 'Hoy'],
  ['agenda', 'Agenda'],
  ['semana', 'Semana'],
  ['plantillas', 'Turnos fijos'],
  ['administracion', 'Administración'],
]

const SECCIONES: [Seccion, string][] = [
  ['resumen', 'Resumen'],
  ['clientes', 'Clientes'],
  ['reactivar', 'Para reactivar'],
  ['profesores', 'Profesores'],
  ['finanzas', 'Finanzas'],
  ['estadisticas', 'Estadísticas'],
  ['anuncios', 'Anuncios'],
  ['respaldo', 'Respaldo'],
]

export default function AdminApp({ perfil }: { perfil: Perfil }) {
  const [vista, setVista] = useState<Vista>('hoy')
  const [seccion, setSeccion] = useState<Seccion>('resumen')
  const [pendientes, setPendientes] = useState(0)
  const [pestañaFinanzas, setPestañaFinanzas] = useState<PestañaFinanzas>('panorama')

  // Los atajos del Resumen pueden llevar directo a una pestaña de Finanzas.
  const irA = (destino: Seccion | 'cobros' | 'egresos') => {
    if (destino === 'cobros' || destino === 'egresos') {
      setPestañaFinanzas(destino === 'cobros' ? 'cobros' : 'gastos')
      setSeccion('finanzas')
      return
    }
    setSeccion(destino)
  }

  // Cantidad de comprobantes esperando confirmación. Se ve como número en
  // "Administración" y en "Clientes". Se actualiza al cambiar de pantalla,
  // que es cuando se resuelven.
  useEffect(() => {
    contarComprobantesPendientes()
      .then(setPendientes)
      .catch(() => setPendientes(0))
  }, [vista, seccion])

  return (
    <div className="app">
      <CabeceraApp
        titulo={
          <strong>
            {perfil.nombre || 'Staff'}
            <span className="etiqueta-rol">Administración</span>
          </strong>
        }
        acciones={
          <button type="button" className="link-secundario" onClick={cerrarSesion}>
            Salir
          </button>
        }
      />

      <nav className="tabs tabs-scroll">
        {PESTAÑAS.map(([clave, etiqueta]) => (
          <button
            key={clave}
            type="button"
            className={vista === clave ? 'tab activa' : 'tab'}
            onClick={() => setVista(clave)}
          >
            {etiqueta}
            {clave === 'administracion' && pendientes > 0 && (
              <span className="pastilla">{pendientes}</span>
            )}
          </button>
        ))}
      </nav>

      {vista === 'administracion' && (
        <nav className="tabs subtabs" aria-label="Secciones de administración">
          {SECCIONES.map(([clave, etiqueta]) => (
            <button
              key={clave}
              type="button"
              className={seccion === clave ? 'tab activa' : 'tab'}
              onClick={() => {
                if (clave === 'finanzas') setPestañaFinanzas('panorama')
                setSeccion(clave)
              }}
            >
              {etiqueta}
              {clave === 'clientes' && pendientes > 0 && <span className="pastilla">{pendientes}</span>}
            </button>
          ))}
        </nav>
      )}

      <main className="contenido">
        {vista === 'hoy' && <Hoy />}
        {vista === 'agenda' && <AgendaStaff />}
        {vista === 'semana' && <SemanaGrilla />}
        {vista === 'plantillas' && <PlantillasStaff />}
        {vista === 'administracion' && seccion === 'resumen' && <Resumen onIr={irA} />}
        {vista === 'administracion' && seccion === 'clientes' && <Clientes />}
        {vista === 'administracion' && seccion === 'reactivar' && <Reactivar />}
        {vista === 'administracion' && seccion === 'profesores' && <Profesores />}
        {vista === 'administracion' && seccion === 'finanzas' && <Finanzas inicial={pestañaFinanzas} />}
        {vista === 'administracion' && seccion === 'estadisticas' && <Estadisticas />}
        {vista === 'administracion' && seccion === 'anuncios' && <AnunciosStaff />}
        {vista === 'administracion' && seccion === 'respaldo' && <Respaldo />}
      </main>
    </div>
  )
}
