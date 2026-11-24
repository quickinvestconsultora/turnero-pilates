-- Movimientos de una clienta, en orden: registro, ingresos, reservas y cancelaciones, turnos fijos,
-- pagos, comprobantes y observaciones. Correr en el SQL Editor del proyecto del turnero
-- (jgfqqiepceeyhvsbutal). Para otra clienta, cambiar el nombre y el apellido de abajo.
--
-- Ojo: la base guarda UNA fila por (turno, clienta) y la actualiza si cancela y vuelve a anotarse,
-- así que de cada turno se ve cómo quedó y cuándo fue su último movimiento, no todo su recorrido.

with c as (
  select p.id, p.nombre, p.apellido
  from public.perfiles p
  where p.nombre ilike '%martina%' and p.apellido ilike '%suhurt%'
)
select * from (
  select p.creado_en as cuando, 'Registro' as tipo,
         'Se registró en la app (' || c.nombre || ' ' || c.apellido || ')' as detalle
  from c join public.perfiles p on p.id = c.id

  union all
  select u.last_sign_in_at, 'Último ingreso', 'Última vez que entró a la app'
  from c join auth.users u on u.id = c.id
  where u.last_sign_in_at is not null

  union all
  select r.creado_en,
         case r.estado
           when 'reservada' then 'Reserva'
           when 'lista_espera' then 'Lista de espera'
           else case when r.cancelada_por_alumna then 'Cancelada por ella' else 'Cancelada (por el estudio o sin penalidad)' end
         end,
         to_char(t.fecha, 'DD/MM/YYYY') || ' ' || to_char(t.hora, 'HH24:MI')
           || coalesce(' · ' || t.instructor, '')
           || case when t.cancelado then ' · turno cancelado' else '' end
           || case when r.asistencia is not null then ' · asistencia: ' || r.asistencia else '' end
  from c
  join public.reservas r on r.alumno_id = c.id
  join public.turnos t on t.id = r.turno_id

  union all
  select f.creada_en, 'Turno fijo',
         'Quedó fija los ' || (array['domingo','lunes','martes','miércoles','jueves','viernes','sábado'])[pl.dia_semana + 1]
           || ' a las ' || to_char(pl.hora, 'HH24:MI') || case when pl.activa then '' else ' (horario desactivado)' end
  from c
  join public.inscripciones_fijas f on f.alumna_id = c.id
  join public.plantillas_turno pl on pl.id = f.plantilla_id

  union all
  select pc.creado_en, 'Pago',
         coalesce('$' || pc.monto::text, 'sin monto') || ' · ' || pc.medio || ' · ' || pc.concepto
           || coalesce(' · ' || pc.nota, '')
  from c join public.pagos_clientes pc on pc.alumna_id = c.id

  union all
  select cp.creado_en, 'Comprobante subido', 'Estado: ' || cp.estado || coalesce(' · ' || cp.nota, '')
  from c join public.comprobantes_pago cp on cp.alumna_id = c.id

  union all
  select o.creado_en, 'Observación del estudio', left(o.texto, 200)
  from c join public.observaciones_clientes o on o.alumna_id = c.id
) x
order by cuando desc;
