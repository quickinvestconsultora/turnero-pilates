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
import Solapas from './Solapas'

type Vista = 'hoy' | 'agenda' | 'semana' | 'plantillas' | 'administracion'
type Seccion = 'resumen' | 'clientes' | 'profesores' | 'finanzas' | 'mas'
type SubClientes = 'lista' | 'reactivar'
type SubMas = 'estadisticas' | 'anuncios' | 'respaldo'

// A dónde pueden llevar los atajos del Resumen.
type Destino = 'clientes' | 'reactivar' | 'cobros' | 'egresos' | 'estadisticas'

const PESTAÑAS: [Vista, string][] = [
  ['hoy', 'Hoy'],
  ['agenda', 'Agenda'],
  ['semana', 'Semana'],
  ['plantillas', 'Turnos fijos'],
  ['administracion', 'Administración'],
]

export default function AdminApp({ perfil }: { perfil: Perfil }) {
  const [vista, setVista] = useState<Vista>('hoy')
  const [seccion, setSeccion] = useState<Seccion>('resumen')
  const [subClientes, setSubClientes] = useState<SubClientes>('lista')
  const [subMas, setSubMas] = useState<SubMas>('estadisticas')
  const [pendientes, setPendientes] = useState(0)
  const [pestañaFinanzas, setPestañaFinanzas] = useState<PestañaFinanzas>('panorama')

  // Los atajos del Resumen llevan directo a la pantalla que corresponde.
  const irA = (destino: Destino) => {
    if (destino === 'cobros' || destino === 'egresos') {
      setPestañaFinanzas(destino === 'cobros' ? 'cobros' : 'gastos')
      setSeccion('finanzas')
    } else if (destino === 'clientes' || destino === 'reactivar') {
      setSubClientes(destino === 'reactivar' ? 'reactivar' : 'lista')
      setSeccion('clientes')
    } else {
      setSubMas('estadisticas')
      setSeccion('mas')
    }
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
        <Solapas
          etiqueta="Secciones de administración"
          activa={seccion}
          onElegir={(clave) => {
            if (clave === 'finanzas') setPestañaFinanzas('panorama')
            setSeccion(clave)
          }}
          items={[
            { clave: 'resumen', etiqueta: 'Resumen' },
            { clave: 'clientes', etiqueta: 'Clientes', pastilla: pendientes },
            { clave: 'profesores', etiqueta: 'Profesores' },
            { clave: 'finanzas', etiqueta: 'Finanzas' },
            { clave: 'mas', etiqueta: 'Más' },
          ]}
        />
      )}

      <main className="contenido">
        {vista === 'hoy' && <Hoy />}
        {vista === 'agenda' && <AgendaStaff />}
        {vista === 'semana' && <SemanaGrilla />}
        {vista === 'plantillas' && <PlantillasStaff />}
        {vista === 'administracion' && seccion === 'resumen' && <Resumen onIr={irA} />}
        {vista === 'administracion' && seccion === 'clientes' && (
          <>
            <Solapas
              interna
              etiqueta="Clientes"
              activa={subClientes}
              onElegir={setSubClientes}
              items={[
                { clave: 'lista', etiqueta: 'Todas las alumnas' },
                { clave: 'reactivar', etiqueta: 'Para reactivar' },
              ]}
            />
            {subClientes === 'lista' ? <Clientes /> : <Reactivar />}
          </>
        )}
        {vista === 'administracion' && seccion === 'profesores' && <Profesores />}
        {vista === 'administracion' && seccion === 'finanzas' && <Finanzas inicial={pestañaFinanzas} />}
        {vista === 'administracion' && seccion === 'mas' && (
          <>
            <Solapas
              interna
              etiqueta="Más opciones"
              activa={subMas}
              onElegir={setSubMas}
              items={[
                { clave: 'estadisticas', etiqueta: 'Estadísticas' },
                { clave: 'anuncios', etiqueta: 'Anuncios' },
                { clave: 'respaldo', etiqueta: 'Respaldo' },
              ]}
            />
            {subMas === 'estadisticas' && <Estadisticas />}
            {subMas === 'anuncios' && <AnunciosStaff />}
            {subMas === 'respaldo' && <Respaldo />}
          </>
        )}
      </main>
    </div>
  )
}
