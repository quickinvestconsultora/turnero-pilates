import { useState } from 'react'
import type { Perfil } from '../tipos'
import { cerrarSesion } from '../servicios/perfil'
import CabeceraApp from './CabeceraApp'
import AgendaStaff from './AgendaStaff'
import PlantillasStaff from './PlantillasStaff'
import Estadisticas from './Estadisticas'
import Clientes from './Clientes'

type Vista = 'agenda' | 'plantillas' | 'clientes' | 'estadisticas'

export default function AdminApp({ perfil }: { perfil: Perfil }) {
  const [vista, setVista] = useState<Vista>('agenda')

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

      <nav className="tabs">
        <button
          type="button"
          className={vista === 'agenda' ? 'tab activa' : 'tab'}
          onClick={() => setVista('agenda')}
        >
          Agenda
        </button>
        <button
          type="button"
          className={vista === 'plantillas' ? 'tab activa' : 'tab'}
          onClick={() => setVista('plantillas')}
        >
          Turnos fijos
        </button>
        <button
          type="button"
          className={vista === 'clientes' ? 'tab activa' : 'tab'}
          onClick={() => setVista('clientes')}
        >
          Clientes
        </button>
        <button
          type="button"
          className={vista === 'estadisticas' ? 'tab activa' : 'tab'}
          onClick={() => setVista('estadisticas')}
        >
          Estadísticas
        </button>
      </nav>

      <main className="contenido">
        {vista === 'agenda' && <AgendaStaff />}
        {vista === 'plantillas' && <PlantillasStaff />}
        {vista === 'clientes' && <Clientes />}
        {vista === 'estadisticas' && <Estadisticas />}
      </main>
    </div>
  )
}
