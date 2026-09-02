import { useState } from 'react'
import type { Perfil } from '../tipos'
import { cerrarSesion } from '../servicios/perfil'
import AgendaStaff from './AgendaStaff'
import PlantillasStaff from './PlantillasStaff'

type Vista = 'agenda' | 'plantillas'

export default function AdminApp({ perfil }: { perfil: Perfil }) {
  const [vista, setVista] = useState<Vista>('agenda')

  return (
    <div className="app">
      <header className="barra-superior">
        <div>
          <strong>{perfil.nombre || 'Staff'}</strong>
          <span className="etiqueta-rol">Administración</span>
        </div>
        <button type="button" className="link-secundario" onClick={cerrarSesion}>
          Salir
        </button>
      </header>

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
      </nav>

      <main className="contenido">
        {vista === 'agenda' ? <AgendaStaff /> : <PlantillasStaff />}
      </main>
    </div>
  )
}
