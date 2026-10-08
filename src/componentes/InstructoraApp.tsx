import { useState } from 'react'
import type { Perfil } from '../tipos'
import { cerrarSesion } from '../servicios/perfil'
import { nombreCompleto } from '../personas'
import CabeceraApp from './CabeceraApp'
import AgendaStaff from './AgendaStaff'
import PlantillasStaff from './PlantillasStaff'
import Clientes from './Clientes'
import PerfilProfe from './PerfilProfe'
import BienvenidaProfe from './BienvenidaProfe'

type Vista = 'agenda' | 'plantillas' | 'clientes' | 'perfil'

const claveBienvenida = (id: string) => `forteva-bienvenida-profe-${id}`

function yaVioBienvenida(id: string): boolean {
  try {
    return localStorage.getItem(claveBienvenida(id)) === '1'
  } catch {
    return false
  }
}

// Pantalla de la profesora: ve la agenda completa pero maneja solo sus
// turnos; ve las fichas de las alumnas sin nada de pagos ni estadísticas.
export default function InstructoraApp({
  perfil,
  onPerfilActualizado,
}: {
  perfil: Perfil
  onPerfilActualizado: (p: Perfil) => void
}) {
  const [vista, setVista] = useState<Vista>('agenda')
  const [mostrarBienvenida, setMostrarBienvenida] = useState(() => !yaVioBienvenida(perfil.id))

  const cerrarBienvenida = () => {
    try {
      localStorage.setItem(claveBienvenida(perfil.id), '1')
    } catch {
      // Sin almacenamiento: el tutorial puede volver a aparecer, no pasa nada.
    }
    setMostrarBienvenida(false)
    // Si todavía no cargó su nombre, la llevamos a completar el perfil.
    if (!perfil.nombre) setVista('perfil')
  }

  return (
    <div className="app">
      <CabeceraApp
        titulo={
          <strong>
            {perfil.nombre ? nombreCompleto(perfil) : 'Profe'}
            <span className="etiqueta-rol">Profesora</span>
          </strong>
        }
        acciones={
          <>
            <button
              type="button"
              className="link-secundario"
              onClick={() => setMostrarBienvenida(true)}
            >
              Tutorial
            </button>
            <button type="button" className="link-secundario" onClick={cerrarSesion}>
              Salir
            </button>
          </>
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
        <button
          type="button"
          className={vista === 'clientes' ? 'tab activa' : 'tab'}
          onClick={() => setVista('clientes')}
        >
          Clientes
        </button>
        <button
          type="button"
          className={vista === 'perfil' ? 'tab activa' : 'tab'}
          onClick={() => setVista('perfil')}
        >
          Mi perfil
        </button>
      </nav>

      <main className="contenido">
        {vista === 'agenda' && <AgendaStaff instructoraId={perfil.id} />}
        {vista === 'plantillas' && <PlantillasStaff instructoraId={perfil.id} />}
        {vista === 'clientes' && <Clientes paraProfesora miId={perfil.id} />}
        {vista === 'perfil' && <PerfilProfe perfil={perfil} onGuardado={onPerfilActualizado} />}
      </main>

      {mostrarBienvenida && <BienvenidaProfe nombre={perfil.nombre} onCerrar={cerrarBienvenida} />}
    </div>
  )
}
