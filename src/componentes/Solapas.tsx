// Fila de solapas secundarias (dentro de Administración, Finanzas, etc.). Se
// acomodan en la cantidad de filas que haga falta, así ninguna queda fuera de
// la pantalla en el celular.
export default function Solapas<T extends string>({
  items,
  activa,
  onElegir,
  etiqueta,
  interna = false,
}: {
  items: { clave: T; etiqueta: string; pastilla?: number }[]
  activa: T
  onElegir: (clave: T) => void
  etiqueta: string
  interna?: boolean
}) {
  return (
    <nav className={interna ? 'tabs subtabs subtabs--interna' : 'tabs subtabs'} aria-label={etiqueta}>
      {items.map((i) => (
        <button
          key={i.clave}
          type="button"
          className={activa === i.clave ? 'tab activa' : 'tab'}
          onClick={() => onElegir(i.clave)}
        >
          {i.etiqueta}
          {i.pastilla ? <span className="pastilla">{i.pastilla}</span> : null}
        </button>
      ))}
    </nav>
  )
}
