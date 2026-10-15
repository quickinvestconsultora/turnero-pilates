import { useState } from 'react'
import type { Perfil } from '../tipos'
import { cerrarSesion } from '../servicios/perfil'
import { nombreCompleto } from '../personas'
import CabeceraApp from './CabeceraApp'
import Hoy from './Hoy'
import AgendaStaff from './AgendaStaff'
import SemanaGrilla from './SemanaGrilla'
import PlantillasStaff from './PlantillasStaff'
import Clientes from './Clientes'
import PerfilProfe from './PerfilProfe'
import BienvenidaProfe from './BienvenidaProfe'

type Vista = 'hoy' | 'agenda' | 'semana' | 'plantillas' | 'clientes' | 'perfil'

const PESTAÑAS: [Vista, string][] = [
  ['hoy', 'Hoy'],
  ['agenda', 'Mis turnos'],
  ['semana', 'Semana'],
  ['plantillas', 'Turnos fijos'],
  ['clientes', 'Clientes'],
  ['perfil', 'Mi perfil'],
]

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
  const [vista, setVista] = useState<Vista>('hoy')
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
        {vista === 'hoy' && <Hoy instructoraId={perfil.id} />}
        {vista === 'semana' && <SemanaGrilla instructoraId={perfil.id} />}
        {vista === 'agenda' && <AgendaStaff instructoraId={perfil.id} />}
        {vista === 'plantillas' && <PlantillasStaff instructoraId={perfil.id} />}
        {vista === 'clientes' && <Clientes paraProfesora miId={perfil.id} />}
        {vista === 'perfil' && <PerfilProfe perfil={perfil} onGuardado={onPerfilActualizado} />}
      </main>

      {mostrarBienvenida && <BienvenidaProfe nombre={perfil.nombre} onCerrar={cerrarBienvenida} />}
    </div>
  )
}
