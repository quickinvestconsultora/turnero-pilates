import { useState } from 'react'
import logo from '../assets/forteva-logo.png'

type Paso = { titulo: string; texto: string; detalle?: string[] }

function pasos(nombre: string): Paso[] {
  return [
    {
      titulo: nombre ? `¡Bienvenida, ${nombre}!` : '¡Bienvenida, profe!',
      texto:
        'Ya sos parte de FORTEVA Studio. En menos de un minuto te mostramos cómo usar el turnero para manejar tus clases.',
    },
    {
      titulo: 'Tu agenda',
      texto:
        'En "Mis turnos" ves la agenda del estudio de las próximas 3 semanas, con cuántas alumnas hay anotadas en cada clase.',
      detalle: [
        'Tus turnos se abren y podés ver quién viene.',
        'Los de otras profes los ves, pero no los modificás.',
        'Con "Ver solo los míos" filtrás la agenda.',
      ],
    },
    {
      titulo: 'Cargá tus turnos',
      texto:
        'Tocá "+ Turno suelto" para una clase puntual: elegís fecha, hora y cupo. Queda automáticamente a tu nombre.',
      detalle: ['Si ya hay un turno a esa hora, el sistema te avisa: el estudio tiene una sola sala.'],
    },
    {
      titulo: 'Turnos fijos',
      texto:
        'Para las clases que repetís todas las semanas, andá a "Turnos fijos", cargá el día y la hora y tocá "Generar".',
      detalle: [
        'Se publican las próximas 4 semanas de una vez.',
        'Cuando quieras sumar más semanas, volvé a tocar "Generar".',
      ],
    },
    {
      titulo: 'Tus alumnas',
      texto:
        'Dentro de cada turno tuyo ves quién se anotó, su celular y si tiene alguna lesión o condición, marcada para que la tengas presente antes de empezar.',
      detalle: [
        'Podés cambiar el cupo o cancelar el turno.',
        'Las alumnas pueden cancelar hasta 2 horas antes de la clase.',
      ],
    },
    {
      titulo: 'Después de la clase',
      texto:
        'Entrá a "Cargar asistencia" y marcá a cada alumna como Asistió o Ausente. Con eso el estudio lleva el historial de cada una.',
    },
    {
      titulo: 'Clientes',
      texto:
        'En "Clientes" tenés la ficha de cada alumna: lesiones, contacto de emergencia, historial de asistencia y observaciones del estudio, que podés leer y sumar.',
      detalle: ['No ves nada de pagos: eso lo maneja la administración.'],
    },
    {
      titulo: 'Tu perfil',
      texto:
        'Subí tu foto y contales a las alumnas quién sos en "Mi perfil". Lo ven cuando tocan tu nombre en un turno.',
      detalle: ['Podés volver a ver este tutorial cuando quieras desde el botón "Tutorial".'],
    },
  ]
}

export default function BienvenidaProfe({
  nombre,
  onCerrar,
}: {
  nombre: string
  onCerrar: () => void
}) {
  const lista = pasos(nombre)
  const [i, setI] = useState(0)
  const paso = lista[i]
  const ultimo = i === lista.length - 1

  return (
    <div className="modal-fondo">
      <div className="modal bienvenida" role="dialog" aria-modal="true" aria-label="Tutorial">
        <img className="bienvenida-logo" src={logo} alt="FORTEVA Studio" />
        <h2>{paso.titulo}</h2>
        <p className="bienvenida-texto">{paso.texto}</p>
        {paso.detalle && (
          <ul className="bienvenida-detalle">
            {paso.detalle.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        )}

        <div className="bienvenida-puntos" aria-hidden="true">
          {lista.map((_, n) => (
            <span key={n} className={n === i ? 'punto activo' : 'punto'} />
          ))}
        </div>

        <div className="modal-botones bienvenida-botones">
          {i === 0 ? (
            <button type="button" className="link-secundario" onClick={onCerrar}>
              Saltar
            </button>
          ) : (
            <button type="button" className="link-secundario" onClick={() => setI(i - 1)}>
              Atrás
            </button>
          )}
          <button type="button" onClick={() => (ultimo ? onCerrar() : setI(i + 1))}>
            {ultimo ? '¡Empezar!' : 'Siguiente'}
          </button>
        </div>
      </div>
    </div>
  )
}
