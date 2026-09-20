-- ============================================================================
-- Turnero Pilates — esquema de base de datos
-- ----------------------------------------------------------------------------
-- Corré este archivo entero en: Supabase > SQL Editor > New query.
-- Es idempotente: lo podés volver a correr sin romper nada.
--
-- Modelo en una frase:
--   * El staff arma la AGENDA: turnos sueltos y/o plantillas semanales que
--     generan turnos.
--   * El alumno ve los TURNOS futuros con lugar y se anota (RESERVA).
--   * Nunca hay sobrecupo: reservar/cancelar pasa siempre por una función
--     que bloquea el turno y cuenta los lugares de forma atómica.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Perfiles (1 a 1 con auth.users)
-- ----------------------------------------------------------------------------
create table if not exists public.perfiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  nombre     text not null default '',
  telefono   text,
  rol        text not null default 'alumno' check (rol in ('alumno', 'staff')),
  creado_en  timestamptz not null default now()
);

-- Ficha de la alumna: se completa después de registrarse, desde "Mis datos".
-- Todo opcional y visible para el instructor antes de cada clase.
alter table public.perfiles
  add column if not exists nivel text check (nivel in ('principiante', 'intermedio', 'avanzado')),
  add column if not exists lesiones text,
  add column if not exists contacto_emergencia_nombre text,
  add column if not exists contacto_emergencia_telefono text;

-- Estado de cuenta: toda alumna nueva arranca en "prueba" (primera clase,
-- todavía no se le cobró nada). El staff la pasa a "al_dia" o "pendiente"
-- a mano desde Clientes — no hay cobro automático.
alter table public.perfiles
  add column if not exists estado_cuenta text not null default 'prueba'
    check (estado_cuenta in ('prueba', 'al_dia', 'pendiente')),
  add column if not exists pago_actualizado_en timestamptz;

-- Datos de identidad + deslinde de responsabilidad, obligatorios desde el
-- registro. deslinde_pdf_subido queda en false hasta que la app suba el PDF
-- a Storage (puede demorar si falta confirmar el mail: se reintenta solo la
-- próxima vez que la alumna entre con sesión activa).
alter table public.perfiles
  add column if not exists apellido text not null default '',
  add column if not exists dni text,
  add column if not exists deslinde_aceptado_en timestamptz,
  add column if not exists deslinde_pdf_subido boolean not null default false;

-- Cuando alguien se registra, le creamos el perfil automáticamente con los
-- datos que mandó en el formulario (van en raw_user_meta_data). Si vino con
-- 'acepta_deslinde', queda marcado el momento de la aceptación — el
-- formulario de registro no deja enviar sin tildar esa casilla.
create or replace function public.crear_perfil_para_usuario_nuevo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles (id, nombre, apellido, dni, telefono, deslinde_aceptado_en)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', ''),
    coalesce(new.raw_user_meta_data ->> 'apellido', ''),
    nullif(new.raw_user_meta_data ->> 'dni', ''),
    nullif(new.raw_user_meta_data ->> 'telefono', ''),
    case when new.raw_user_meta_data ->> 'acepta_deslinde' = 'true' then now() end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.crear_perfil_para_usuario_nuevo();

-- Helper: ¿el usuario actual es staff? (se usa en varias policies)
create or replace function public.es_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.perfiles
    where id = auth.uid() and rol = 'staff'
  );
$$;

-- ----------------------------------------------------------------------------
-- 2. Plantillas de turno (turno recurrente semanal)
-- ----------------------------------------------------------------------------
create table if not exists public.plantillas_turno (
  id            uuid primary key default gen_random_uuid(),
  dia_semana    smallint not null check (dia_semana between 0 and 6), -- 0 = domingo
  hora          time not null,
  duracion_min  smallint not null default 60 check (duracion_min > 0),
  cupo          smallint not null check (cupo > 0),
  instructor    text,
  activa        boolean not null default true,
  creado_en     timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3. Turnos (instancia concreta en una fecha)
-- ----------------------------------------------------------------------------
create table if not exists public.turnos (
  id            uuid primary key default gen_random_uuid(),
  fecha         date not null,
  hora          time not null,
  duracion_min  smallint not null default 60 check (duracion_min > 0),
  cupo          smallint not null check (cupo > 0),
  instructor    text,
  plantilla_id  uuid references public.plantillas_turno (id) on delete set null,
  cancelado     boolean not null default false,
  nota          text,
  creado_en     timestamptz not null default now(),
  -- Un solo turno por franja horaria (el estudio tiene una sala). Si algún
  -- día hay dos salas en paralelo, se cambia por unique (fecha, hora, sala).
  unique (fecha, hora)
);

create index if not exists turnos_fecha_idx on public.turnos (fecha);

-- ----------------------------------------------------------------------------
-- 4. Reservas
-- ----------------------------------------------------------------------------
create table if not exists public.reservas (
  id         uuid primary key default gen_random_uuid(),
  turno_id   uuid not null references public.turnos (id) on delete cascade,
  alumno_id  uuid not null references public.perfiles (id) on delete cascade,
  estado     text not null default 'reservada'
             check (estado in ('reservada', 'lista_espera', 'cancelada')),
  creado_en  timestamptz not null default now(),
  -- Una fila por (turno, alumno): cancelar y volver a anotarse reusa la fila.
  unique (turno_id, alumno_id)
);

create index if not exists reservas_turno_idx on public.reservas (turno_id);
create index if not exists reservas_alumno_idx on public.reservas (alumno_id);

-- Asistencia: la carga el staff después de que la clase pasó. Null mientras
-- no se marcó (clase futura, o pasada y todavía sin cargar).
alter table public.reservas
  add column if not exists asistencia text check (asistencia in ('asistio', 'ausente'));

-- ============================================================================
-- 5. Row Level Security
-- ============================================================================
alter table public.perfiles        enable row level security;
alter table public.plantillas_turno enable row level security;
alter table public.turnos          enable row level security;
alter table public.reservas        enable row level security;

-- --- perfiles -----------------------------------------------------------------
drop policy if exists perfiles_ver_propio on public.perfiles;
create policy perfiles_ver_propio on public.perfiles
  for select using (id = auth.uid() or public.es_staff());

drop policy if exists perfiles_editar_propio on public.perfiles;
create policy perfiles_editar_propio on public.perfiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- El staff además puede editar la ficha de cualquiera (para marcar estado
-- de cuenta desde Clientes, por ejemplo).
drop policy if exists perfiles_staff_edita on public.perfiles;
create policy perfiles_staff_edita on public.perfiles
  for update using (public.es_staff()) with check (public.es_staff());

-- Nadie se autoasciende a staff, ni se marca a sí mismo "al día": si el que
-- edita no es staff, esos dos campos quedan como estaban (aunque el update
-- intente cambiarlos).
create or replace function public.proteger_rol_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Solo frenamos el cambio si viene de un usuario logueado que no es staff
  -- (o sea, desde la app). Con auth.uid() nulo —SQL Editor, service_role—
  -- dejamos pasar el cambio: así se puede nombrar al primer staff.
  if auth.uid() is not null and not public.es_staff() then
    if new.rol is distinct from old.rol then
      new.rol := old.rol;
    end if;
    if new.estado_cuenta is distinct from old.estado_cuenta then
      new.estado_cuenta := old.estado_cuenta;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists proteger_rol on public.perfiles;
create trigger proteger_rol
  before update on public.perfiles
  for each row execute function public.proteger_rol_perfil();

-- --- plantillas_turno (solo staff) -----------------------------------------
drop policy if exists plantillas_staff on public.plantillas_turno;
create policy plantillas_staff on public.plantillas_turno
  for all using (public.es_staff()) with check (public.es_staff());

-- --- turnos ---------------------------------------------------------------
-- Alumno: ve turnos futuros no cancelados. Staff: ve y edita todo.
drop policy if exists turnos_ver on public.turnos;
create policy turnos_ver on public.turnos
  for select using (
    public.es_staff()
    or (not cancelado and fecha >= current_date)
  );

drop policy if exists turnos_staff_escribe on public.turnos;
create policy turnos_staff_escribe on public.turnos
  for all using (public.es_staff()) with check (public.es_staff());

-- --- reservas -----------------------------------------------------------------
-- Alumno: ve solo las suyas. Staff: ve y edita todas.
-- Alumno NO inserta/actualiza directo: usa las funciones reservar_turno /
-- cancelar_reserva (que corren con security definer y saltean estas policies).
drop policy if exists reservas_ver on public.reservas;
create policy reservas_ver on public.reservas
  for select using (alumno_id = auth.uid() or public.es_staff());

drop policy if exists reservas_staff_escribe on public.reservas;
create policy reservas_staff_escribe on public.reservas
  for all using (public.es_staff()) with check (public.es_staff());

-- ============================================================================
-- 6. Storage: PDF del deslinde de responsabilidad
-- ----------------------------------------------------------------------------
-- Bucket privado. Cada PDF se guarda en "<id-de-la-alumna>/deslinde.pdf", así
-- que el primer segmento de la ruta identifica de quién es el archivo.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('deslindes', 'deslindes', false)
on conflict (id) do nothing;

-- Sin esto, ni siquiera un usuario logueado puede "ver" que el bucket
-- existe (Storage lo trata como si no estuviera, aunque sí esté creado).
-- No es sensible: solo dice que hay un bucket llamado "deslindes", los
-- archivos de adentro los protegen las políticas de más abajo.
drop policy if exists deslindes_bucket_visible on storage.buckets;
create policy deslindes_bucket_visible on storage.buckets
  for select using (id = 'deslindes');

drop policy if exists deslindes_alumna_sube on storage.objects;
create policy deslindes_alumna_sube on storage.objects
  for insert with check (
    bucket_id = 'deslindes' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Update además de insert: si el primer intento de subida falla (por ej. se
-- pierde la conexión) el reintento sube con upsert, que es un update.
drop policy if exists deslindes_alumna_actualiza on storage.objects;
create policy deslindes_alumna_actualiza on storage.objects
  for update using (
    bucket_id = 'deslindes' and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'deslindes' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists deslindes_ver on storage.objects;
create policy deslindes_ver on storage.objects
  for select using (
    bucket_id = 'deslindes'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.es_staff())
  );

-- ============================================================================
-- 7. Funciones de negocio
-- ============================================================================

-- --- Reservar un turno ------------------------------------------------------
-- Devuelve { estado: 'reservada' | 'lista_espera', primera_clase: boolean }.
-- primera_clase = true cuando esta reserva es la primera que hace la alumna
-- (la clase de prueba gratis): el frontend usa eso para mostrarle el aviso
-- de bienvenida con lo que tiene que abonar para la próxima.
drop function if exists public.reservar_turno(uuid);
create function public.reservar_turno(p_turno_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turno    public.turnos;
  v_ocupados int;
  v_estado_actual text;
  v_estado   text;
  v_rol           text;
  v_estado_cuenta text;
  v_reservas_previas int;
  v_primera_clase boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.';
  end if;

  -- Bloqueamos la fila del turno: si dos personas reservan el último lugar
  -- al mismo tiempo, una espera a la otra y el conteo sale bien.
  select * into v_turno from public.turnos where id = p_turno_id for update;

  if not found then
    raise exception 'El turno no existe.';
  end if;
  if v_turno.cancelado then
    raise exception 'Ese turno fue cancelado.';
  end if;
  if (v_turno.fecha + v_turno.hora) < now() then
    raise exception 'Ese turno ya pasó.';
  end if;

  -- ¿Ya estaba anotado?
  select estado into v_estado_actual
  from public.reservas
  where turno_id = p_turno_id and alumno_id = auth.uid();

  if v_estado_actual in ('reservada', 'lista_espera') then
    -- no hacemos nada, ya tiene lugar/está esperando
    return json_build_object('estado', v_estado_actual, 'primera_clase', false);
  end if;

  -- Regla de pago (solo alumnas): la primera reserva es gratis (prueba).
  -- De ahí en más, o el staff la pasó a "al_dia" o queda bloqueada hasta
  -- regularizar. "pendiente" siempre bloquea. El frontend reconoce el
  -- mensaje 'PAGO_REQUERIDO' y muestra la ventana de pago en vez de un
  -- error genérico.
  select rol, estado_cuenta into v_rol, v_estado_cuenta
  from public.perfiles where id = auth.uid();

  if v_rol = 'alumno' then
    if v_estado_cuenta = 'pendiente' then
      raise exception 'PAGO_REQUERIDO';
    end if;

    if v_estado_cuenta = 'prueba' then
      select count(*) into v_reservas_previas
      from public.reservas
      where alumno_id = auth.uid() and estado <> 'cancelada';

      if v_reservas_previas >= 1 then
        raise exception 'PAGO_REQUERIDO';
      end if;

      v_primera_clase := true; -- esta va a ser su primera reserva: la de prueba
    end if;
  end if;

  select count(*) into v_ocupados
  from public.reservas
  where turno_id = p_turno_id and estado = 'reservada';

  v_estado := case when v_ocupados < v_turno.cupo then 'reservada' else 'lista_espera' end;

  insert into public.reservas (turno_id, alumno_id, estado)
  values (p_turno_id, auth.uid(), v_estado)
  on conflict (turno_id, alumno_id)
    do update set estado = excluded.estado, creado_en = now();

  return json_build_object('estado', v_estado, 'primera_clase', v_primera_clase);
end;
$$;

-- --- Cancelar mi reserva ----------------------------------------------------
-- Al liberarse un lugar, sube automáticamente al primero de la lista de espera.
create or replace function public.cancelar_reserva(p_turno_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado_previo text;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.';
  end if;

  -- Bloqueamos el turno para serializar la promoción de la lista de espera.
  perform 1 from public.turnos where id = p_turno_id for update;
  if not found then
    raise exception 'El turno no existe.';
  end if;

  select estado into v_estado_previo
  from public.reservas
  where turno_id = p_turno_id and alumno_id = auth.uid();

  if v_estado_previo is null or v_estado_previo not in ('reservada', 'lista_espera') then
    raise exception 'No tenías una reserva activa en ese turno.';
  end if;

  update public.reservas
    set estado = 'cancelada'
  where turno_id = p_turno_id and alumno_id = auth.uid();

  -- Si liberé un lugar "de verdad" y hay gente esperando, promovemos al
  -- que se anotó primero.
  if v_estado_previo = 'reservada' then
    update public.reservas
      set estado = 'reservada'
    where id = (
      select id from public.reservas
      where turno_id = p_turno_id and estado = 'lista_espera'
      order by creado_en asc
      limit 1
    );
  end if;
end;
$$;

-- --- Listar turnos para el alumno -----------------------------------------
-- Un turno por fila, con cuántos lugares hay ocupados y en qué estado está
-- MI reserva (o null si no me anoté).
create or replace function public.listar_turnos(p_desde date, p_hasta date)
returns table (
  id           uuid,
  fecha        date,
  hora         time,
  duracion_min smallint,
  cupo         smallint,
  instructor   text,
  nota         text,
  ocupados     bigint,
  mi_estado    text
)
language sql
security definer
set search_path = public
as $$
  select
    t.id, t.fecha, t.hora, t.duracion_min, t.cupo, t.instructor, t.nota,
    (select count(*) from public.reservas r
       where r.turno_id = t.id and r.estado = 'reservada') as ocupados,
    (select r.estado from public.reservas r
       where r.turno_id = t.id and r.alumno_id = auth.uid()
       and r.estado in ('reservada', 'lista_espera')) as mi_estado
  from public.turnos t
  where t.cancelado = false
    and t.fecha between p_desde and p_hasta
  order by t.fecha, t.hora;
$$;

-- --- Generar turnos desde una plantilla (staff) --------------------------
-- Crea un turno por cada fecha entre p_desde y p_hasta que caiga en el día
-- de semana de la plantilla. Los que ya existen (misma fecha/hora) se saltean.
-- Devuelve cuántos turnos nuevos creó.
create or replace function public.generar_turnos(
  p_plantilla_id uuid,
  p_desde date,
  p_hasta date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pl    public.plantillas_turno;
  v_fecha date;
  v_creados int := 0;
begin
  if not public.es_staff() then
    raise exception 'Solo el staff puede generar turnos.';
  end if;

  select * into v_pl from public.plantillas_turno where id = p_plantilla_id;
  if not found then
    raise exception 'La plantilla no existe.';
  end if;

  v_fecha := p_desde;
  while v_fecha <= p_hasta loop
    if extract(dow from v_fecha)::int = v_pl.dia_semana then
      insert into public.turnos (fecha, hora, duracion_min, cupo, instructor, plantilla_id)
      values (v_fecha, v_pl.hora, v_pl.duracion_min, v_pl.cupo, v_pl.instructor, v_pl.id)
      on conflict (fecha, hora) do nothing;
      if found then
        v_creados := v_creados + 1;
      end if;
    end if;
    v_fecha := v_fecha + 1;
  end loop;

  return v_creados;
end;
$$;

-- --- Estadísticas del período (staff) --------------------------------------
-- Un solo viaje a la base: junta ocupación, ausentismo y el detalle por
-- horario y por alumna en un JSON. Solo mira turnos que ya pasaron (a uno
-- que todavía no se dio no le corresponde "ocupación final" ni asistencia).
create or replace function public.estadisticas(p_desde date, p_hasta date)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  resultado json;
begin
  if not public.es_staff() then
    raise exception 'Solo el staff puede ver estadísticas.';
  end if;

  select json_build_object(
    'turnos_dictados', (
      select count(*) from turnos
      where fecha between p_desde and p_hasta and cancelado = false
        and (fecha + hora) < now()
    ),
    'cupo_total', (
      select coalesce(sum(cupo), 0) from turnos
      where fecha between p_desde and p_hasta and cancelado = false
        and (fecha + hora) < now()
    ),
    'reservas_totales', (
      select count(*) from reservas r
      join turnos t on t.id = r.turno_id
      where t.fecha between p_desde and p_hasta and t.cancelado = false
        and (t.fecha + t.hora) < now()
        and r.estado = 'reservada'
    ),
    'alumnas_activas', (
      select count(distinct r.alumno_id) from reservas r
      join turnos t on t.id = r.turno_id
      where t.fecha between p_desde and p_hasta and t.cancelado = false
        and r.estado = 'reservada'
    ),
    'asistieron', (
      select count(*) from reservas r
      join turnos t on t.id = r.turno_id
      where t.fecha between p_desde and p_hasta and r.asistencia = 'asistio'
    ),
    'ausentes', (
      select count(*) from reservas r
      join turnos t on t.id = r.turno_id
      where t.fecha between p_desde and p_hasta and r.asistencia = 'ausente'
    ),
    'por_horario', (
      select coalesce(json_agg(x order by x.dia_semana, x.hora), '[]'::json) from (
        select dia_semana, hora, count(*) as turnos, sum(cupo) as cupo_total, sum(reservas) as reservas
        from (
          select
            extract(dow from t.fecha)::int as dia_semana,
            t.hora,
            t.cupo,
            (select count(*) from reservas r
               where r.turno_id = t.id and r.estado = 'reservada') as reservas
          from turnos t
          where t.fecha between p_desde and p_hasta and t.cancelado = false
            and (t.fecha + t.hora) < now()
        ) por_turno
        group by dia_semana, hora
      ) x
    ),
    'ausencias_por_alumna', (
      select coalesce(json_agg(y order by y.ausencias desc), '[]'::json) from (
        select btrim(p.nombre || ' ' || p.apellido) as nombre, count(*) as ausencias
        from reservas r
        join turnos t on t.id = r.turno_id
        join perfiles p on p.id = r.alumno_id
        where t.fecha between p_desde and p_hasta and r.asistencia = 'ausente'
        group by p.nombre, p.apellido
        order by count(*) desc
        limit 10
      ) y
    )
  ) into resultado;

  return resultado;
end;
$$;

-- Permisos de ejecución (authenticated ya puede ejecutar funciones public
-- por defecto en Supabase, pero lo dejamos explícito).
grant execute on function public.reservar_turno(uuid)          to authenticated;
grant execute on function public.cancelar_reserva(uuid)        to authenticated;
grant execute on function public.listar_turnos(date, date)     to authenticated;
grant execute on function public.generar_turnos(uuid, date, date) to authenticated;
grant execute on function public.estadisticas(date, date)      to authenticated;
