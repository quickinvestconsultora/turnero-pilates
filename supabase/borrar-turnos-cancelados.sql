-- Borra los turnos cancelados (y las reservas que tenían, que se van con ellos).
-- Correr en el SQL Editor del proyecto del TURNERO (jgfqqiepceeyhvsbutal).
--
-- Se dejan afuera los turnos cancelados que todavía no pasaron y que salen de
-- un turno fijo: si se borraran, la publicación automática los volvería a crear.
-- Esos se siguen viendo como cancelados hasta que pase su fecha.

-- 1) Vista previa: cuántos se van a borrar y cuántos se quedan.
select
  count(*) filter (where fecha < current_date or plantilla_id is null) as se_borran,
  count(*) filter (where fecha >= current_date and plantilla_id is not null) as se_quedan_por_turno_fijo
from public.turnos
where cancelado;

-- 2) Borrado.
delete from public.turnos
where cancelado
  and (fecha < current_date or plantilla_id is null);

-- 3) Control: lo que queda cancelado.
select fecha, hora, instructor
from public.turnos
where cancelado
order by fecha, hora;
