import { useState } from 'react'
import type { Perfil } from '../tipos'
import { cerrarSesion } from '../servicios/perfil'
import { nombreCompleto } from '../personas'
import CabeceraApp from './CabeceraApp'
import AgendaStaff from './AgendaStaff'
import PlantillasStaff from './PlantillasStaff'

type Vista = 'agenda' | 'plantillas'

// Pantalla de la profesora: arma y ve solo sus turnos. No ve clientes,
// pagos ni estadísticas (eso es del staff).
export default function InstructoraApp({ perfil }: { perfil: Perfil }) {
  const [vista, setVista] = useState<Vista>('agenda')

  return (
    <div className="app">
      <CabeceraApp
        titulo={
          <strong>
            {nombreCompleto(perfil)}
            <span className="etiqueta-rol">Profesora</span>
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
          Mis turnos
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
        {vista === 'agenda' && <AgendaStaff instructoraId={perfil.id} />}
        {vista === 'plantillas' && <PlantillasStaff instructoraId={perfil.id} />}
      </main>
    </div>
  )
}
