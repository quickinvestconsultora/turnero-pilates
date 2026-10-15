import { useState } from 'react'
import type { Perfil } from '../tipos'
import { cerrarSesion } from '../servicios/perfil'
import CabeceraApp from './CabeceraApp'
import Hoy from './Hoy'
import AgendaStaff from './AgendaStaff'
import SemanaGrilla from './SemanaGrilla'
import PlantillasStaff from './PlantillasStaff'
import Estadisticas from './Estadisticas'
import Clientes from './Clientes'
import Profesores from './Profesores'

type Vista = 'hoy' | 'agenda' | 'semana' | 'plantillas' | 'clientes' | 'profesores' | 'estadisticas'

const PESTAÑAS: [Vista, string][] = [
  ['hoy', 'Hoy'],
  ['agenda', 'Agenda'],
  ['semana', 'Semana'],
  ['plantillas', 'Turnos fijos'],
  ['clientes', 'Clientes'],
  ['profesores', 'Profesores'],
  ['estadisticas', 'Estadísticas'],
]

export default function AdminApp({ perfil }: { perfil: Perfil }) {
  const [vista, setVista] = useState<Vista>('hoy')

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
          </button>
        ))}
      </nav>

      <main className="contenido">
        {vista === 'hoy' && <Hoy />}
        {vista === 'agenda' && <AgendaStaff />}
        {vista === 'semana' && <SemanaGrilla />}
        {vista === 'plantillas' && <PlantillasStaff />}
        {vista === 'clientes' && <Clientes />}
        {vista === 'profesores' && <Profesores />}
        {vista === 'estadisticas' && <Estadisticas />}
      </main>
    </div>
  )
}
