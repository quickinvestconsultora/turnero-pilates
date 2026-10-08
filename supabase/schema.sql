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

-- El teléfono es obligatorio desde el formulario de registro (ver Auth.tsx);
-- esto lo refuerza también del lado de la base, por si alguna vez se llama
-- a signUp() sin pasar por el formulario. Las cuentas viejas (de antes de
-- este campo) quedan con '' en vez de romper la migración.
update public.perfiles set telefono = '' where telefono is null;
alter table public.perfiles
  alter column telefono set default '',
  alter column telefono set not null;

-- Roles: alumna (reserva), instructora (maneja sus propios turnos) y staff
-- (administra todo). Una profesora se registra como cualquier alumna y el
-- staff la pasa a "instructora" desde Clientes.
alter table public.perfiles drop constraint if exists perfiles_rol_check;
alter table public.perfiles
  add constraint perfiles_rol_check check (rol in ('alumno', 'instructora', 'staff'));

-- Perfil público de la profesora (foto + descripción): lo edita ella desde
-- "Mi perfil" y lo ven las alumnas al tocar su nombre en un turno.
alter table public.perfiles
  add column if not exists bio text,
  add column if not exists foto_url text,
  add column if not exists formacion text,
  add column if not exists especialidades text,
  add column if not exists experiencia text,
  add column if not exists frase text,
  add column if not exists instagram text;

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
    coalesce(new.raw_user_meta_data ->> 'telefono', ''),
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

-- Helper: ¿el usuario actual es instructora?
create or replace function public.es_instructora()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.perfiles
    where id = auth.uid() and rol = 'instructora'
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

-- Profesora a cargo (opcional). Cuando está, "instructor" (el texto que se
-- muestra) lo completa la base con su nombre, así no hay que tipearlo ni
-- puede quedar distinto. Turnos sin instructora_id: el staff escribe el
-- nombre a mano, como siempre.
alter table public.plantillas_turno
  add column if not exists instructora_id uuid references public.perfiles (id) on delete set null;
alter table public.turnos
  add column if not exists instructora_id uuid references public.perfiles (id) on delete set null;

create index if not exists turnos_instructora_idx on public.turnos (instructora_id);

create or replace function public.completar_instructor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.instructora_id is not null then
    select btrim(nombre || ' ' || apellido) into new.instructor
    from public.perfiles where id = new.instructora_id;
  end if;
  return new;
end;
$$;

drop trigger if exists completar_instructor_turno on public.turnos;
create trigger completar_instructor_turno
  before insert or update on public.turnos
  for each row execute function public.completar_instructor();

drop trigger if exists completar_instructor_plantilla on public.plantillas_turno;
create trigger completar_instructor_plantilla
  before insert or update on public.plantillas_turno
  for each row execute function public.completar_instructor();

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

-- Observaciones del estudio sobre cada alumna (notas internas con fecha).
-- Tabla aparte y no una columna de perfiles: la alumna puede leer su propio
-- perfil, y estas notas son solo para el staff.
create table if not exists public.observaciones_clientes (
  id         uuid primary key default gen_random_uuid(),
  alumna_id  uuid not null references public.perfiles (id) on delete cascade,
  texto      text not null check (length(btrim(texto)) > 0),
  autor_id   uuid references auth.users (id) on delete set null default auth.uid(),
  creado_en  timestamptz not null default now()
);

create index if not exists observaciones_alumna_idx
  on public.observaciones_clientes (alumna_id, creado_en desc);

-- Galería de fotos de cada profesora (la que ven las alumnas en su ficha).
-- Los archivos están en el bucket público "profes"; acá se guarda la lista.
create table if not exists public.fotos_profesoras (
  id            uuid primary key default gen_random_uuid(),
  profesora_id  uuid not null references public.perfiles (id) on delete cascade,
  url           text not null,
  ruta          text not null,
  creado_en     timestamptz not null default now()
);

create index if not exists fotos_profesoras_idx
  on public.fotos_profesoras (profesora_id, creado_en);

-- Tope de 8 fotos por profesora, para que la ficha no se llene de archivos.
create or replace function public.limitar_fotos_profesora()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.fotos_profesoras where profesora_id = new.profesora_id) >= 8 then
    raise exception 'Podés tener hasta 8 fotos en tu ficha. Borrá alguna para subir otra.';
  end if;
  return new;
end;
$$;

-- Personas anotadas en un turno por la profesora (o el staff) que todavía no
-- tienen cuenta. Se les pide como mínimo nombre, apellido y teléfono; el mail
-- es opcional y sirve para, más adelante, avisarles ("te agregaron a este
-- turno, ¿querés registrarte con un click?"). Cuentan para el cupo.
create table if not exists public.reservas_invitadas (
  id                uuid primary key default gen_random_uuid(),
  turno_id          uuid not null references public.turnos (id) on delete cascade,
  nombre            text not null check (length(btrim(nombre)) > 0),
  apellido          text not null check (length(btrim(apellido)) > 0),
  telefono          text not null check (length(btrim(telefono)) > 0),
  email             text,
  agregada_por      uuid references auth.users (id) on delete set null default auth.uid(),
  asistencia        text check (asistencia in ('asistio', 'ausente')),
  aviso_enviado_en  timestamptz,
  creado_en         timestamptz not null default now()
);

create index if not exists reservas_invitadas_turno_idx
  on public.reservas_invitadas (turno_id);

drop trigger if exists limitar_fotos on public.fotos_profesoras;
create trigger limitar_fotos
  before insert on public.fotos_profesoras
  for each row execute function public.limitar_fotos_profesora();

-- ============================================================================
-- 5. Row Level Security
-- ============================================================================
alter table public.perfiles        enable row level security;
alter table public.plantillas_turno enable row level security;
alter table public.turnos          enable row level security;
alter table public.reservas        enable row level security;
alter table public.observaciones_clientes enable row level security;
alter table public.fotos_profesoras enable row level security;
alter table public.reservas_invitadas enable row level security;

-- ¿Puede el usuario actual manejar las anotadas de este turno? El staff, en
-- cualquiera; una profesora, solo en los suyos.
create or replace function public.puede_gestionar_turno(p_turno_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.es_staff() then
    return true;
  end if;
  return public.es_instructora() and exists (
    select 1 from public.turnos t
    where t.id = p_turno_id and t.instructora_id = auth.uid()
  );
end;
$$;

-- --- reservas_invitadas: solo quien maneja el turno. Se crean por función. -----
drop policy if exists invitadas_ver on public.reservas_invitadas;
create policy invitadas_ver on public.reservas_invitadas
  for select using (public.puede_gestionar_turno(turno_id));

drop policy if exists invitadas_actualiza on public.reservas_invitadas;
create policy invitadas_actualiza on public.reservas_invitadas
  for update using (public.puede_gestionar_turno(turno_id))
  with check (public.puede_gestionar_turno(turno_id));

drop policy if exists invitadas_borra on public.reservas_invitadas;
create policy invitadas_borra on public.reservas_invitadas
  for delete using (public.puede_gestionar_turno(turno_id));

-- --- fotos_profesoras: las ve cualquiera con sesión; las maneja la dueña ------
drop policy if exists fotos_profesoras_ver on public.fotos_profesoras;
create policy fotos_profesoras_ver on public.fotos_profesoras
  for select to authenticated using (true);

drop policy if exists fotos_profesoras_crea on public.fotos_profesoras;
create policy fotos_profesoras_crea on public.fotos_profesoras
  for insert with check (profesora_id = auth.uid() and public.es_instructora());

drop policy if exists fotos_profesoras_borra on public.fotos_profesoras;
create policy fotos_profesoras_borra on public.fotos_profesoras
  for delete using (
    (profesora_id = auth.uid() and public.es_instructora()) or public.es_staff()
  );

-- --- observaciones_clientes: solo staff, nunca la alumna ----------------------
drop policy if exists observaciones_staff on public.observaciones_clientes;
create policy observaciones_staff on public.observaciones_clientes
  for all using (public.es_staff()) with check (public.es_staff());

-- Las profesoras leen y agregan observaciones, y borran solo las suyas.
drop policy if exists observaciones_instructora_ver on public.observaciones_clientes;
create policy observaciones_instructora_ver on public.observaciones_clientes
  for select using (public.es_instructora());

drop policy if exists observaciones_instructora_crea on public.observaciones_clientes;
create policy observaciones_instructora_crea on public.observaciones_clientes
  for insert with check (public.es_instructora() and autor_id = auth.uid());

drop policy if exists observaciones_instructora_borra on public.observaciones_clientes;
create policy observaciones_instructora_borra on public.observaciones_clientes
  for delete using (public.es_instructora() and autor_id = auth.uid());

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
    or public.es_instructora()
    or (not cancelado and fecha >= current_date)
  );

drop policy if exists turnos_staff_escribe on public.turnos;
create policy turnos_staff_escribe on public.turnos
  for all using (public.es_staff()) with check (public.es_staff());

-- Instructora: crea, edita y cancela solo los turnos que son suyos.
drop policy if exists turnos_instructora_escribe on public.turnos;
create policy turnos_instructora_escribe on public.turnos
  for all
  using (public.es_instructora() and instructora_id = auth.uid())
  with check (public.es_instructora() and instructora_id = auth.uid());

drop policy if exists plantillas_instructora on public.plantillas_turno;
create policy plantillas_instructora on public.plantillas_turno
  for all
  using (public.es_instructora() and instructora_id = auth.uid())
  with check (public.es_instructora() and instructora_id = auth.uid());

-- Instructora: ve toda la agenda y cuántas anotadas hay en cada turno, pero
-- solo marca asistencia en los suyos. Los datos de las alumnas anotadas
-- (nombre, lesión) los ve únicamente de sus propios turnos, ver
-- perfiles_instructora_ve más abajo.
drop policy if exists reservas_instructora_ver on public.reservas;
create policy reservas_instructora_ver on public.reservas
  for select using (public.es_instructora());

drop policy if exists reservas_instructora_asistencia on public.reservas;
create policy reservas_instructora_asistencia on public.reservas
  for update
  using (
    public.es_instructora()
    and exists (
      select 1 from public.turnos t
      where t.id = reservas.turno_id and t.instructora_id = auth.uid()
    )
  )
  with check (
    public.es_instructora()
    and exists (
      select 1 from public.turnos t
      where t.id = reservas.turno_id and t.instructora_id = auth.uid()
    )
  );

drop policy if exists perfiles_instructora_ve on public.perfiles;
create policy perfiles_instructora_ve on public.perfiles
  for select using (
    public.es_instructora()
    and exists (
      select 1 from public.reservas r
      join public.turnos t on t.id = r.turno_id
      where r.alumno_id = perfiles.id and t.instructora_id = auth.uid()
    )
  );

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

-- Fotos de las profesoras: bucket PÚBLICO (se muestran a las alumnas con un
-- <img>). Cada una sube solo a su carpeta "<id>/foto.jpg".
insert into storage.buckets (id, name, public)
values ('profes', 'profes', true)
on conflict (id) do update set public = true;

drop policy if exists profes_bucket_visible on storage.buckets;
create policy profes_bucket_visible on storage.buckets
  for select using (id = 'profes');

drop policy if exists profes_foto_ver on storage.objects;
create policy profes_foto_ver on storage.objects
  for select using (bucket_id = 'profes');

drop policy if exists profes_foto_sube on storage.objects;
create policy profes_foto_sube on storage.objects
  for insert with check (
    bucket_id = 'profes'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (public.es_instructora() or public.es_staff())
  );

drop policy if exists profes_foto_borra on storage.objects;
create policy profes_foto_borra on storage.objects
  for delete using (
    bucket_id = 'profes'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (public.es_instructora() or public.es_staff())
  );

drop policy if exists profes_foto_actualiza on storage.objects;
create policy profes_foto_actualiza on storage.objects
  for update using (
    bucket_id = 'profes'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (public.es_instructora() or public.es_staff())
  ) with check (
    bucket_id = 'profes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================================
-- 7. Funciones de negocio
-- ============================================================================

-- Lugares ocupados de un turno: alumnas con reserva confirmada + personas sin
-- cuenta que sumó la profesora. Es lo que se compara contra el cupo.
create or replace function public.ocupados_turno(p_turno_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from public.reservas r
       where r.turno_id = p_turno_id and r.estado = 'reservada')
    + (select count(*) from public.reservas_invitadas i
         where i.turno_id = p_turno_id);
$$;

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
  if (v_turno.fecha + v_turno.hora) < (now() at time zone 'America/Argentina/Buenos_Aires') then
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

  v_ocupados := public.ocupados_turno(p_turno_id);

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
  v_turno         public.turnos;
  v_estado_previo text;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.';
  end if;

  -- Bloqueamos el turno para serializar la promoción de la lista de espera.
  select * into v_turno from public.turnos where id = p_turno_id for update;
  if not found then
    raise exception 'El turno no existe.';
  end if;

  select estado into v_estado_previo
  from public.reservas
  where turno_id = p_turno_id and alumno_id = auth.uid();

  if v_estado_previo is null or v_estado_previo not in ('reservada', 'lista_espera') then
    raise exception 'No tenías una reserva activa en ese turno.';
  end if;

  -- Un lugar confirmado se puede cancelar o cambiar hasta 2 horas antes
  -- (hora de Argentina: fecha+hora del turno son hora local, sin zona). La
  -- lista de espera se puede dejar siempre, porque no ocupa lugar. Si cambiás
  -- este margen, cambiá también HORAS_LIMITE_CANCELAR en src/servicios/turnos.ts.
  if v_estado_previo = 'reservada'
     and (v_turno.fecha + v_turno.hora) - interval '2 hours'
         < (now() at time zone 'America/Argentina/Buenos_Aires') then
    raise exception 'Ya no se puede cancelar: faltan menos de 2 horas para el turno. Escribile al estudio.';
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
drop function if exists public.listar_turnos(date, date);
create function public.listar_turnos(p_desde date, p_hasta date)
returns table (
  id           uuid,
  fecha        date,
  hora         time,
  duracion_min smallint,
  cupo         smallint,
  instructor   text,
  instructora_id uuid,
  nota         text,
  ocupados     bigint,
  mi_estado    text
)
language sql
security definer
set search_path = public
as $$
  select
    t.id, t.fecha, t.hora, t.duracion_min, t.cupo, t.instructor, t.instructora_id, t.nota,
    public.ocupados_turno(t.id) as ocupados,
    (select r.estado from public.reservas r
       where r.turno_id = t.id and r.alumno_id = auth.uid()
       and r.estado in ('reservada', 'lista_espera')) as mi_estado
  from public.turnos t
  where t.cancelado = false
    and t.fecha between p_desde and p_hasta
  order by t.fecha, t.hora;
$$;

-- --- Profesoras: perfil público ----------------------------------------------
-- Las alumnas no pueden leer perfiles ajenos, así que lo que se muestra de
-- una profesora (nombre, foto, descripción) sale por acá y nada más.
drop function if exists public.listar_profesoras();
create function public.listar_profesoras()
returns table (
  id uuid,
  nombre text,
  bio text,
  foto_url text,
  formacion text,
  especialidades text,
  experiencia text,
  frase text,
  instagram text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, btrim(p.nombre || ' ' || p.apellido), p.bio, p.foto_url,
         p.formacion, p.especialidades, p.experiencia, p.frase, p.instagram
  from public.perfiles p
  where p.rol = 'instructora'
  order by p.nombre;
$$;

-- --- Clientes para profesoras ---------------------------------------------------
-- Lo que una profesora ve de las alumnas: datos y ficha, SIN estado de cuenta
-- ni nada de pagos (eso es solo del staff).
create or replace function public.clientes_para_instructora()
returns table (
  id uuid,
  nombre text,
  apellido text,
  dni text,
  telefono text,
  nivel text,
  lesiones text,
  contacto_emergencia_nombre text,
  contacto_emergencia_telefono text,
  creado_en timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.es_instructora() or public.es_staff()) then
    raise exception 'Sin permiso.';
  end if;

  return query
  select p.id, p.nombre, p.apellido, p.dni, p.telefono, p.nivel, p.lesiones,
         p.contacto_emergencia_nombre, p.contacto_emergencia_telefono, p.creado_en
  from public.perfiles p
  where p.rol = 'alumno'
  order by p.nombre;
end;
$$;

-- --- Anotar a una alumna registrada en un turno (profesora dueña o staff) -----
-- Saltea las reglas de pago (la anota quien maneja el turno) pero respeta el
-- cupo: si está completo, hay que subirlo antes.
create or replace function public.agregar_alumna_a_turno(p_turno_id uuid, p_alumna_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turno         public.turnos;
  v_estado_actual text;
begin
  if not public.puede_gestionar_turno(p_turno_id) then
    raise exception 'No podés agregar alumnas a este turno.';
  end if;

  select * into v_turno from public.turnos where id = p_turno_id for update;
  if not found then
    raise exception 'El turno no existe.';
  end if;
  if v_turno.cancelado then
    raise exception 'Ese turno fue cancelado.';
  end if;
  if (v_turno.fecha + v_turno.hora) < (now() at time zone 'America/Argentina/Buenos_Aires') then
    raise exception 'Ese turno ya pasó.';
  end if;

  if not exists (select 1 from public.perfiles where id = p_alumna_id and rol = 'alumno') then
    raise exception 'No encontramos a esa alumna.';
  end if;

  select estado into v_estado_actual
  from public.reservas
  where turno_id = p_turno_id and alumno_id = p_alumna_id;
  if v_estado_actual in ('reservada', 'lista_espera') then
    raise exception 'Ya está anotada en este turno.';
  end if;

  if public.ocupados_turno(p_turno_id) >= v_turno.cupo then
    raise exception 'El turno está completo. Subí el cupo para sumar más alumnas.';
  end if;

  insert into public.reservas (turno_id, alumno_id, estado)
  values (p_turno_id, p_alumna_id, 'reservada')
  on conflict (turno_id, alumno_id)
    do update set estado = 'reservada', creado_en = now();
end;
$$;

-- --- Anotar en un turno a alguien que todavía no tiene cuenta -------------------
-- Pide como mínimo nombre, apellido y teléfono. Si ese teléfono ya es de una
-- alumna registrada, avisa para no duplicar a la persona.
create or replace function public.agregar_invitada_a_turno(
  p_turno_id uuid,
  p_nombre text,
  p_apellido text,
  p_telefono text,
  p_email text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turno    public.turnos;
  v_digitos  text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  v_existente text;
  v_id       uuid;
begin
  if not public.puede_gestionar_turno(p_turno_id) then
    raise exception 'No podés agregar alumnas a este turno.';
  end if;

  if length(btrim(coalesce(p_nombre, ''))) = 0 or length(btrim(coalesce(p_apellido, ''))) = 0 then
    raise exception 'Hacen falta el nombre y el apellido.';
  end if;
  if length(v_digitos) < 8 then
    raise exception 'El teléfono no parece válido (con código de área, sin 0 ni 15).';
  end if;
  if length(btrim(coalesce(p_email, ''))) > 0 and position('@' in p_email) = 0 then
    raise exception 'El mail no parece válido.';
  end if;

  select * into v_turno from public.turnos where id = p_turno_id for update;
  if not found then
    raise exception 'El turno no existe.';
  end if;
  if v_turno.cancelado then
    raise exception 'Ese turno fue cancelado.';
  end if;
  if (v_turno.fecha + v_turno.hora) < (now() at time zone 'America/Argentina/Buenos_Aires') then
    raise exception 'Ese turno ya pasó.';
  end if;

  select btrim(nombre || ' ' || apellido) into v_existente
  from public.perfiles
  where rol = 'alumno' and right(regexp_replace(telefono, '\D', '', 'g'), 8) = right(v_digitos, 8)
  limit 1;
  if v_existente is not null then
    raise exception 'Ese teléfono ya es de una alumna registrada (%). Buscala en "Ya registrada".', v_existente;
  end if;

  if exists (
    select 1 from public.reservas_invitadas
    where turno_id = p_turno_id
      and right(regexp_replace(telefono, '\D', '', 'g'), 8) = right(v_digitos, 8)
  ) then
    raise exception 'Ya está anotada en este turno.';
  end if;

  if public.ocupados_turno(p_turno_id) >= v_turno.cupo then
    raise exception 'El turno está completo. Subí el cupo para sumar más alumnas.';
  end if;

  insert into public.reservas_invitadas (turno_id, nombre, apellido, telefono, email)
  values (
    p_turno_id,
    btrim(p_nombre),
    btrim(p_apellido),
    btrim(p_telefono),
    nullif(btrim(coalesce(p_email, '')), '')
  )
  returning id into v_id;

  return v_id;
end;
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
  select * into v_pl from public.plantillas_turno where id = p_plantilla_id;
  if not found then
    raise exception 'La plantilla no existe.';
  end if;

  -- Staff genera cualquiera; una instructora, solo los turnos fijos suyos.
  if not public.es_staff()
     and not (public.es_instructora() and v_pl.instructora_id = auth.uid()) then
    raise exception 'No tenés permiso para generar turnos de este turno fijo.';
  end if;

  v_fecha := p_desde;
  while v_fecha <= p_hasta loop
    if extract(dow from v_fecha)::int = v_pl.dia_semana then
      insert into public.turnos
        (fecha, hora, duracion_min, cupo, instructor, instructora_id, plantilla_id)
      values
        (v_fecha, v_pl.hora, v_pl.duracion_min, v_pl.cupo, v_pl.instructor, v_pl.instructora_id, v_pl.id)
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
        and (fecha + hora) < (now() at time zone 'America/Argentina/Buenos_Aires')
    ),
    'cupo_total', (
      select coalesce(sum(cupo), 0) from turnos
      where fecha between p_desde and p_hasta and cancelado = false
        and (fecha + hora) < (now() at time zone 'America/Argentina/Buenos_Aires')
    ),
    'reservas_totales', (
      select count(*) from reservas r
      join turnos t on t.id = r.turno_id
      where t.fecha between p_desde and p_hasta and t.cancelado = false
        and (t.fecha + t.hora) < (now() at time zone 'America/Argentina/Buenos_Aires')
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
            and (t.fecha + t.hora) < (now() at time zone 'America/Argentina/Buenos_Aires')
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
grant execute on function public.listar_profesoras()           to authenticated;
grant execute on function public.ocupados_turno(uuid)          to authenticated;
grant execute on function public.agregar_alumna_a_turno(uuid, uuid) to authenticated;
grant execute on function public.agregar_invitada_a_turno(uuid, text, text, text, text) to authenticated;
grant execute on function public.clientes_para_instructora()   to authenticated;
