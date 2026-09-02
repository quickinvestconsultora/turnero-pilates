import type { ReactNode } from 'react'
import marca from '../assets/forteva-marca.jpg'

type Props = {
  titulo: ReactNode
  acciones: ReactNode
}

// Cabecera común de la app: la marca de FORTEVA arriba y, debajo, el saludo
// (o lo que sea) a la izquierda y los botones a la derecha.
export default function CabeceraApp({ titulo, acciones }: Props) {
  return (
    <header className="cabecera">
      <img className="marca-app" src={marca} alt="FORTEVA Studio" />
      <div className="cabecera-fila">
        <div>{titulo}</div>
        <div className="barra-acciones">{acciones}</div>
      </div>
    </header>
  )
}
