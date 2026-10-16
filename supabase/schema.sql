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

-- El abono "al día" no se renueva solo: cubre turnos hasta esta fecha
-- (por defecto, fin del mes en que se marcó). Pasada la fecha hay que volver
-- a confirmar el pago desde Clientes. Las cuentas que ya estaban "al día"
-- quedan cubiertas hasta fin del mes actual.
alter table public.perfiles
  add column if not exists al_dia_hasta date;

-- Avisos automáticos por mail: para qué vencimiento ya se avisó que el abono
-- está por vencer (así se avisa una sola vez por período), y cuándo se mandó el
-- deslinde firmado a la administradora.
alter table public.perfiles
  add column if not exists aviso_vencimiento_para date,
  add column if not exists deslinde_mail_enviado_en timestamptz;

-- Reactivación: cuándo se le escribió por última vez a una alumna que dejó de
-- venir (para no insistir). Cumpleaños: el año del último saludo por mail (así
-- se manda uno solo por año).
alter table public.perfiles
  add column if not exists reactivacion_avisada_en timestamptz,
  add column if not exists aviso_cumple_anio int;

update public.perfiles
set al_dia_hasta = (
  date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires')
  + interval '1 month - 1 day'
)::date
where estado_cuenta = 'al_dia' and al_dia_hasta is null;

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

-- Ficha de la alumna (la completa ella desde "Mis datos"; la ven el estudio y
-- las profesoras): fecha de nacimiento, objetivo, experiencia previa y foto
-- opcional. La foto está en el bucket PRIVADO "fichas"; acá queda solo la ruta.
alter table public.perfiles
  add column if not exists fecha_nacimiento date,
  add column if not exists objetivo text,
  add column if not exists experiencia_previa text,
  add column if not exists foto_ruta text;

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

  -- Si la profesora ya la había anotado en turnos como "sin registrar", acá
  -- esas reservas pasan a su cuenta (coincide el mail, o los últimos 8 dígitos
  -- del celular). Si algo falla, el registro igual sigue: es un extra.
  begin
    with coinciden as (
      select i.*
      from public.reservas_invitadas i
      where (
        nullif(btrim(coalesce(i.email, '')), '') is not null
        and lower(btrim(i.email)) = lower(coalesce(new.email, ''))
      )
      or (
        length(regexp_replace(i.telefono, '\D', '', 'g')) >= 8
        and length(regexp_replace(coalesce(new.raw_user_meta_data ->> 'telefono', ''), '\D', '', 'g')) >= 8
        and right(regexp_replace(i.telefono, '\D', '', 'g'), 8)
          = right(regexp_replace(new.raw_user_meta_data ->> 'telefono', '\D', '', 'g'), 8)
      )
    ), nuevas as (
      insert into public.reservas (turno_id, alumno_id, estado, asistencia)
      select c.turno_id, new.id, 'reservada', c.asistencia from coinciden c
      on conflict (turno_id, alumno_id) do nothing
      returning 1
    )
    delete from public.reservas_invitadas
    where id in (select id from coinciden);
  exception when others then
    null;
  end;

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

-- Marca de "ya se mandó el recordatorio de 2 horas antes" (una sola vez).
alter table public.reservas
  add column if not exists recordatorio_enviado_en timestamptz;

-- Cuando una alumna estaba en lista de espera y se libera un lugar, la base la
-- sube sola: promovida_en guarda cuándo, y aviso_promocion_visto_en cuándo vio
-- el aviso en pantalla (así se le muestra una sola vez).
alter table public.reservas
  add column if not exists promovida_en timestamptz,
  add column if not exists aviso_promocion_visto_en timestamptz;

-- Marca de "ya se mandó el mail de que subió de la lista de espera".
alter table public.reservas
  add column if not exists promocion_mail_enviado_en timestamptz;

-- true si la propia alumna canceló un lugar que tenía confirmado. Sirve para
-- que la clase de prueba no se pueda "reciclar" cancelando y reservando otra.
alter table public.reservas
  add column if not exists cancelada_por_alumna boolean not null default false;

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

-- Registro de cada cobro que el estudio confirma: cuánto, cómo y hasta cuándo
-- cubre. Lo carga el staff al marcar "Al día" o "+1 mes" desde Clientes. Es un
-- historial para contabilidad; el estado de la alumna sigue en perfiles.
create table if not exists public.pagos_clientes (
  id             uuid primary key default gen_random_uuid(),
  alumna_id      uuid not null references public.perfiles (id) on delete cascade,
  monto          numeric(12, 2) check (monto is null or monto >= 0),
  medio          text not null default 'transferencia'
                 check (medio in ('transferencia', 'mercado_pago', 'efectivo', 'otro')),
  nota           text,
  abono_hasta    date,
  registrado_por uuid references auth.users (id) on delete set null default auth.uid(),
  creado_en      timestamptz not null default now()
);

create index if not exists pagos_clientes_alumna_idx
  on public.pagos_clientes (alumna_id, creado_en desc);

-- Qué se pagó: el mes, una clase suelta u otra cosa (los pagos viejos son "mes").
alter table public.pagos_clientes
  add column if not exists concepto text not null default 'mes'
  check (concepto in ('mes', 'clase', 'otro'));

-- Número correlativo para el recibo que se descarga de cada pago.
alter table public.pagos_clientes
  add column if not exists numero bigint generated by default as identity;

-- Comprobantes de pago que sube la alumna (foto o PDF de la transferencia) para
-- que el estudio los confirme. El archivo está en el bucket privado
-- "comprobantes"; acá queda la fila y su estado. Aprobarlo (y registrar el pago)
-- lo hace el staff desde Clientes.
create table if not exists public.comprobantes_pago (
  id           uuid primary key default gen_random_uuid(),
  alumna_id    uuid not null references public.perfiles (id) on delete cascade default auth.uid(),
  ruta         text not null,
  nota         text,
  estado       text not null default 'pendiente'
               check (estado in ('pendiente', 'aprobado', 'rechazado')),
  creado_en    timestamptz not null default now(),
  resuelto_en  timestamptz,
  resuelto_por uuid references auth.users (id) on delete set null
);

create index if not exists comprobantes_estado_idx
  on public.comprobantes_pago (estado, creado_en);

-- Tope de 5 comprobantes pendientes por alumna, para evitar el spam.
create or replace function public.limitar_comprobantes_pendientes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.comprobantes_pago
      where alumna_id = new.alumna_id and estado = 'pendiente') >= 5 then
    raise exception 'Ya tenés comprobantes esperando confirmación. Cuando el estudio los revise podés mandar otro.';
  end if;
  return new;
end;
$$;

drop trigger if exists limitar_comprobantes on public.comprobantes_pago;
create trigger limitar_comprobantes
  before insert on public.comprobantes_pago
  for each row execute function public.limitar_comprobantes_pendientes();

-- Ajustes del sistema que el staff puede cambiar (por ahora, el interruptor de
-- los recordatorios automáticos). Una fila por ajuste, con su valor en JSON.
create table if not exists public.configuracion (
  clave           text primary key,
  valor           jsonb not null,
  actualizado_en  timestamptz not null default now(),
  actualizado_por uuid references auth.users (id) on delete set null
);

-- Desde cuándo valen los avisos automáticos de deslinde: se fija una sola vez, la
-- primera vez que se corre este archivo, para no mandarle a la administradora
-- el deslinde de todas las alumnas que ya estaban registradas.
insert into public.configuracion (clave, valor)
values ('avisos_desde', to_jsonb(now()))
on conflict (clave) do nothing;

-- Documentos de la alumna (certificado médico, estudios, etc.): los sube ella o
-- el estudio. Los archivos están en el bucket privado "fichas".
create table if not exists public.documentos_alumnas (
  id          uuid primary key default gen_random_uuid(),
  alumna_id   uuid not null references public.perfiles (id) on delete cascade default auth.uid(),
  nombre      text not null check (length(btrim(nombre)) > 0),
  categoria   text not null default 'otro'
              check (categoria in ('certificado', 'estudio', 'otro')),
  ruta        text not null,
  subido_por  uuid references auth.users (id) on delete set null default auth.uid(),
  creado_en   timestamptz not null default now()
);

create index if not exists documentos_alumna_idx
  on public.documentos_alumnas (alumna_id, creado_en desc);

-- Tope de 20 documentos por alumna.
create or replace function public.limitar_documentos_alumna()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.documentos_alumnas where alumna_id = new.alumna_id) >= 20 then
    raise exception 'Se llegó al máximo de 20 documentos. Borrá alguno para subir otro.';
  end if;
  return new;
end;
$$;

drop trigger if exists limitar_documentos on public.documentos_alumnas;
create trigger limitar_documentos
  before insert on public.documentos_alumnas
  for each row execute function public.limitar_documentos_alumna();

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
-- tienen cuenta. Alcanza con el nombre (por si pasan el turno y todavía no
-- tienen más datos); apellido, teléfono y mail son opcionales y se completan
-- después. El mail sirve para, más adelante, avisarles ("te agregaron a este
-- turno, ¿querés registrarte con un click?"). Cuentan para el cupo.
create table if not exists public.reservas_invitadas (
  id                uuid primary key default gen_random_uuid(),
  turno_id          uuid not null references public.turnos (id) on delete cascade,
  nombre            text not null check (length(btrim(nombre)) > 0),
  apellido          text not null default '',
  telefono          text not null default '',
  email             text,
  agregada_por      uuid references auth.users (id) on delete set null default auth.uid(),
  asistencia        text check (asistencia in ('asistio', 'ausente')),
  aviso_enviado_en  timestamptz,
  creado_en         timestamptz not null default now()
);

create index if not exists reservas_invitadas_turno_idx
  on public.reservas_invitadas (turno_id);

alter table public.reservas_invitadas
  add column if not exists recordatorio_enviado_en timestamptz;

-- Para instalaciones que ya tenían apellido y teléfono obligatorios.
alter table public.reservas_invitadas drop constraint if exists reservas_invitadas_apellido_check;
alter table public.reservas_invitadas drop constraint if exists reservas_invitadas_telefono_check;
alter table public.reservas_invitadas
  alter column apellido set default '',
  alter column telefono set default '';

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
alter table public.pagos_clientes enable row level security;

-- Pagos: solo el staff los ve y los maneja (ni la alumna ni las profesoras).
drop policy if exists pagos_staff on public.pagos_clientes;
create policy pagos_staff on public.pagos_clientes
  for all using (public.es_staff()) with check (public.es_staff());

-- Configuración: solo el staff la ve; se cambia por funciones (ver
-- cambiar_recordatorios), no se escribe directo.
alter table public.configuracion enable row level security;

drop policy if exists configuracion_staff_ve on public.configuracion;
create policy configuracion_staff_ve on public.configuracion
  for select using (public.es_staff());

-- Documentos de la alumna: los ve ella, el staff y las profesoras (igual que sus
-- lesiones); los sube y borra ella o el staff. Una profesora no los modifica.
alter table public.documentos_alumnas enable row level security;

drop policy if exists documentos_ver on public.documentos_alumnas;
create policy documentos_ver on public.documentos_alumnas
  for select using (alumna_id = auth.uid() or public.es_staff() or public.es_instructora());

drop policy if exists documentos_crea on public.documentos_alumnas;
create policy documentos_crea on public.documentos_alumnas
  for insert with check (alumna_id = auth.uid() or public.es_staff());

drop policy if exists documentos_borra on public.documentos_alumnas;
create policy documentos_borra on public.documentos_alumnas
  for delete using (alumna_id = auth.uid() or public.es_staff());

-- Comprobantes: la alumna sube y ve los suyos; el staff ve y resuelve todos.
alter table public.comprobantes_pago enable row level security;

drop policy if exists comprobantes_ver on public.comprobantes_pago;
create policy comprobantes_ver on public.comprobantes_pago
  for select using (alumna_id = auth.uid() or public.es_staff());

drop policy if exists comprobantes_crea on public.comprobantes_pago;
create policy comprobantes_crea on public.comprobantes_pago
  for insert with check (alumna_id = auth.uid() and estado = 'pendiente');

drop policy if exists comprobantes_staff_resuelve on public.comprobantes_pago;
create policy comprobantes_staff_resuelve on public.comprobantes_pago
  for update using (public.es_staff()) with check (public.es_staff());

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
    if new.al_dia_hasta is distinct from old.al_dia_hasta then
      new.al_dia_hasta := old.al_dia_hasta;
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

-- Ficha de la alumna (foto y documentos): bucket PRIVADO, máximo 8 MB, solo
-- imágenes y PDF. Cada archivo va en la carpeta "<id de la alumna>/..."; lo
-- sube ella o el staff, y lo ven ella, el staff y las profesoras.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fichas', 'fichas', false, 8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists fichas_bucket_visible on storage.buckets;
create policy fichas_bucket_visible on storage.buckets
  for select using (id = 'fichas');

drop policy if exists fichas_sube on storage.objects;
create policy fichas_sube on storage.objects
  for insert with check (
    bucket_id = 'fichas'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.es_staff())
  );

drop policy if exists fichas_ver_objeto on storage.objects;
create policy fichas_ver_objeto on storage.objects
  for select using (
    bucket_id = 'fichas'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.es_staff()
      or public.es_instructora()
    )
  );

drop policy if exists fichas_actualiza_objeto on storage.objects;
create policy fichas_actualiza_objeto on storage.objects
  for update using (
    bucket_id = 'fichas'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.es_staff())
  ) with check (
    bucket_id = 'fichas'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.es_staff())
  );

drop policy if exists fichas_borra_objeto on storage.objects;
create policy fichas_borra_objeto on storage.objects
  for delete using (
    bucket_id = 'fichas'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.es_staff())
  );

-- Comprobantes de pago: bucket PRIVADO, máximo 5 MB, solo imágenes y PDF. Cada
-- alumna sube a su carpeta "<id>/..."; ella y el staff pueden verlos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comprobantes', 'comprobantes', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists comprobantes_bucket_visible on storage.buckets;
create policy comprobantes_bucket_visible on storage.buckets
  for select using (id = 'comprobantes');

drop policy if exists comprobantes_sube on storage.objects;
create policy comprobantes_sube on storage.objects
  for insert with check (
    bucket_id = 'comprobantes' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists comprobantes_ver_objeto on storage.objects;
create policy comprobantes_ver_objeto on storage.objects
  for select using (
    bucket_id = 'comprobantes'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.es_staff())
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
  v_al_dia_hasta  date;
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
  select rol, estado_cuenta, al_dia_hasta into v_rol, v_estado_cuenta, v_al_dia_hasta
  from public.perfiles where id = auth.uid();

  if v_rol = 'alumno' then
    if v_estado_cuenta = 'pendiente' then
      raise exception 'PAGO_REQUERIDO';
    end if;

    -- "Al día" cubre turnos hasta al_dia_hasta; uno posterior necesita que el
    -- estudio confirme un nuevo pago (el abono no se renueva solo).
    if v_estado_cuenta = 'al_dia'
       and v_al_dia_hasta is not null
       and v_turno.fecha > v_al_dia_hasta then
      raise exception 'PAGO_REQUERIDO';
    end if;

    if v_estado_cuenta = 'prueba' then
      -- La clase de prueba se usa una sola vez: cuentan las reservas vigentes y
      -- también las que la propia alumna canceló estando confirmadas. No
      -- cuentan las de turnos que canceló el estudio, ni las de lista de espera,
      -- ni este mismo turno (puede volver a anotarse si se arrepintió).
      select count(*) into v_reservas_previas
      from public.reservas r
      join public.turnos t on t.id = r.turno_id
      where r.alumno_id = auth.uid()
        and r.turno_id <> p_turno_id
        and not t.cancelado
        and (r.estado <> 'cancelada' or r.cancelada_por_alumna);

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

-- --- Reservar todo el mes de un turno fijo -----------------------------------
-- Para alumnas con abono "al día": las anota en TODOS los turnos del mismo
-- turno fijo dentro del mes del turno elegido que todavía no pasaron. Se
-- saltea los que ya tienen (ya_anotada), los que están completos (sin_lugar,
-- no se anota en espera) y los posteriores al fin de su abono
-- (sin_cobertura). Devuelve el resumen para mostrárselo.
create or replace function public.reservar_serie(p_turno_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref            public.turnos;
  v_rol            text;
  v_estado_cuenta  text;
  v_hasta          date;
  v_ahora          timestamp := (now() at time zone 'America/Argentina/Buenos_Aires');
  t                public.turnos;
  v_estado_actual  text;
  v_reservadas     int := 0;
  v_ya             int := 0;
  v_sin_lugar      date[] := '{}';
  v_sin_cobertura  date[] := '{}';
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.';
  end if;

  select * into v_ref from public.turnos where id = p_turno_id;
  if not found then
    raise exception 'El turno no existe.';
  end if;
  if v_ref.plantilla_id is null then
    raise exception 'Este turno no es parte de un turno fijo.';
  end if;

  select rol, estado_cuenta, al_dia_hasta into v_rol, v_estado_cuenta, v_hasta
  from public.perfiles where id = auth.uid();

  if v_rol <> 'alumno' then
    raise exception 'Solo las alumnas pueden reservar turnos.';
  end if;
  if v_estado_cuenta <> 'al_dia' or v_hasta is null or v_hasta < v_ahora::date then
    raise exception 'PAGO_REQUERIDO';
  end if;

  for t in
    select * from public.turnos
    where plantilla_id = v_ref.plantilla_id
      and not cancelado
      and date_trunc('month', fecha) = date_trunc('month', v_ref.fecha)
      and (fecha + hora) >= v_ahora
    order by fecha, hora
    for update
  loop
    select estado into v_estado_actual
    from public.reservas
    where turno_id = t.id and alumno_id = auth.uid();

    if v_estado_actual in ('reservada', 'lista_espera') then
      v_ya := v_ya + 1;
    elsif t.fecha > v_hasta then
      v_sin_cobertura := v_sin_cobertura || t.fecha;
    elsif public.ocupados_turno(t.id) >= t.cupo then
      v_sin_lugar := v_sin_lugar || t.fecha;
    else
      insert into public.reservas (turno_id, alumno_id, estado)
      values (t.id, auth.uid(), 'reservada')
      on conflict (turno_id, alumno_id)
        do update set estado = 'reservada', creado_en = now();
      v_reservadas := v_reservadas + 1;
    end if;
  end loop;

  return json_build_object(
    'reservadas', v_reservadas,
    'ya_anotada', v_ya,
    'sin_lugar', to_json(v_sin_lugar),
    'sin_cobertura', to_json(v_sin_cobertura)
  );
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

  -- Si liberó un lugar "de verdad", el trigger promover_lista_espera sube
  -- solo a la primera de la lista de espera.
  update public.reservas
    set estado = 'cancelada',
        cancelada_por_alumna = (v_estado_previo = 'reservada')
  where turno_id = p_turno_id and alumno_id = auth.uid();
end;
$$;

-- --- Lista de espera: subir a la primera cuando se libera un lugar ---------------
-- Lo dispara cualquier baja de un lugar confirmado: la alumna que cancela, el
-- staff o la profesora que la sacan, o una persona "sin registrar" que se borra.
-- La promovida queda marcada (promovida_en) para avisarle en pantalla.
create or replace function public.promover_siguiente_en_espera(p_turno_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turno public.turnos;
  v_id    uuid;
begin
  select * into v_turno from public.turnos where id = p_turno_id for update;
  if not found or v_turno.cancelado then
    return;
  end if;
  if (v_turno.fecha + v_turno.hora) < (now() at time zone 'America/Argentina/Buenos_Aires') then
    return;
  end if;
  if public.ocupados_turno(p_turno_id) >= v_turno.cupo then
    return;
  end if;

  select id into v_id
  from public.reservas
  where turno_id = p_turno_id and estado = 'lista_espera'
  order by creado_en asc
  limit 1
  for update skip locked;

  if v_id is not null then
    update public.reservas
      set estado = 'reservada',
          promovida_en = now(),
          aviso_promocion_visto_en = null
    where id = v_id;
  end if;
end;
$$;

create or replace function public.trg_reserva_liberada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.promover_siguiente_en_espera(new.turno_id);
  return new;
end;
$$;

drop trigger if exists reserva_liberada on public.reservas;
create trigger reserva_liberada
  after update of estado on public.reservas
  for each row
  when (old.estado = 'reservada' and new.estado = 'cancelada')
  execute function public.trg_reserva_liberada();

create or replace function public.trg_invitada_borrada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.promover_siguiente_en_espera(old.turno_id);
  return old;
end;
$$;

drop trigger if exists invitada_borrada on public.reservas_invitadas;
create trigger invitada_borrada
  after delete on public.reservas_invitadas
  for each row execute function public.trg_invitada_borrada();

-- La alumna marca que ya vio el aviso de "se liberó un lugar y te anotamos".
create or replace function public.marcar_promocion_vista(p_turno_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.reservas
    set aviso_promocion_visto_en = now()
  where turno_id = p_turno_id
    and alumno_id = auth.uid()
    and promovida_en is not null;
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
  plantilla_id uuid,
  nota         text,
  ocupados     bigint,
  mi_estado    text,
  promovida_sin_ver boolean
)
language sql
security definer
set search_path = public
as $$
  select
    t.id, t.fecha, t.hora, t.duracion_min, t.cupo, t.instructor, t.instructora_id,
    t.plantilla_id, t.nota,
    public.ocupados_turno(t.id) as ocupados,
    (select r.estado from public.reservas r
       where r.turno_id = t.id and r.alumno_id = auth.uid()
       and r.estado in ('reservada', 'lista_espera')) as mi_estado,
    coalesce((select r.promovida_en is not null and r.aviso_promocion_visto_en is null
       from public.reservas r
       where r.turno_id = t.id and r.alumno_id = auth.uid()
       and r.estado = 'reservada'), false) as promovida_sin_ver
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
drop function if exists public.clientes_para_instructora();
create function public.clientes_para_instructora()
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
  fecha_nacimiento date,
  objetivo text,
  experiencia_previa text,
  foto_ruta text,
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
         p.contacto_emergencia_nombre, p.contacto_emergencia_telefono,
         p.fecha_nacimiento, p.objetivo, p.experiencia_previa, p.foto_ruta, p.creado_en
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
-- Pide solo el nombre; apellido, teléfono y mail son opcionales. Si se carga
-- el teléfono y ya es de una alumna registrada, avisa para no duplicar a la
-- persona.
drop function if exists public.agregar_invitada_a_turno(uuid, text, text, text, text);
create function public.agregar_invitada_a_turno(
  p_turno_id uuid,
  p_nombre text,
  p_apellido text default '',
  p_telefono text default '',
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

  if length(btrim(coalesce(p_nombre, ''))) = 0 then
    raise exception 'Hace falta al menos el nombre.';
  end if;
  if length(v_digitos) > 0 and length(v_digitos) < 8 then
    raise exception 'El teléfono no parece válido (con código de área, sin 0 ni 15). Podés dejarlo vacío.';
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

  if length(v_digitos) >= 8 then
    select btrim(nombre || ' ' || apellido) into v_existente
    from public.perfiles
    where rol = 'alumno' and right(regexp_replace(telefono, '\D', '', 'g'), 8) = right(v_digitos, 8)
    limit 1;
    if v_existente is not null then
      raise exception 'Ese teléfono ya es de una alumna registrada (%). Buscala en "Ya registrada".', v_existente;
    end if;
  end if;

  -- Misma persona dos veces en el turno: por teléfono si lo hay, si no por nombre.
  if exists (
    select 1 from public.reservas_invitadas
    where turno_id = p_turno_id
      and (
        (length(v_digitos) >= 8
          and right(regexp_replace(telefono, '\D', '', 'g'), 8) = right(v_digitos, 8))
        or (length(v_digitos) < 8
          and lower(btrim(nombre || ' ' || apellido)) = lower(btrim(p_nombre || ' ' || coalesce(p_apellido, ''))))
      )
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
    btrim(coalesce(p_apellido, '')),
    btrim(coalesce(p_telefono, '')),
    nullif(btrim(coalesce(p_email, '')), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- --- Vincular a una persona "sin registrar" con una cuenta existente --------------
-- Para cuando la profesora la anotó solo con el nombre y después se sabe quién
-- es: su reserva pasa a la cuenta de la alumna (con la asistencia que tuviera)
-- y se borra la anotación suelta. El cupo no cambia: una reemplaza a la otra.
create or replace function public.vincular_invitada(p_invitada_id uuid, p_alumna_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  i public.reservas_invitadas;
begin
  select * into i from public.reservas_invitadas where id = p_invitada_id;
  if not found then
    raise exception 'Esa persona ya no está anotada en el turno.';
  end if;
  if not public.puede_gestionar_turno(i.turno_id) then
    raise exception 'No podés modificar este turno.';
  end if;
  if not exists (select 1 from public.perfiles where id = p_alumna_id and rol = 'alumno') then
    raise exception 'No encontramos a esa alumna.';
  end if;

  if not exists (
    select 1 from public.reservas
    where turno_id = i.turno_id and alumno_id = p_alumna_id
      and estado in ('reservada', 'lista_espera')
  ) then
    insert into public.reservas (turno_id, alumno_id, estado, asistencia)
    values (i.turno_id, p_alumna_id, 'reservada', i.asistencia)
    on conflict (turno_id, alumno_id)
      do update set estado = 'reservada',
                    asistencia = coalesce(excluded.asistencia, public.reservas.asistencia),
                    creado_en = now();
  end if;

  delete from public.reservas_invitadas where id = i.id;
end;
$$;

-- --- Registrar un pago y dejar a la alumna "al día" ----------------------------
-- En un solo paso (atómico): guarda el cobro en el historial y actualiza el
-- estado de la alumna con la fecha hasta la que queda cubierta.
create or replace function public.registrar_pago(
  p_alumna_id uuid,
  p_monto numeric,
  p_medio text,
  p_nota text,
  p_hasta date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_staff() then
    raise exception 'Solo el staff puede registrar pagos.';
  end if;
  if not exists (select 1 from public.perfiles where id = p_alumna_id and rol = 'alumno') then
    raise exception 'No encontramos a esa alumna.';
  end if;
  if p_hasta is null then
    raise exception 'Falta la fecha hasta la que cubre el pago.';
  end if;

  insert into public.pagos_clientes (alumna_id, monto, medio, nota, abono_hasta)
  values (
    p_alumna_id,
    p_monto,
    coalesce(nullif(p_medio, ''), 'transferencia'),
    nullif(btrim(coalesce(p_nota, '')), ''),
    p_hasta
  );

  update public.perfiles
    set estado_cuenta = 'al_dia',
        al_dia_hasta = p_hasta,
        pago_actualizado_en = now()
  where id = p_alumna_id;
end;
$$;

-- --- Mi cuenta (alumna) -----------------------------------------------------------
-- Lo que la alumna puede ver de sí misma: sus clases ya dadas con la asistencia
-- y sus pagos (sin las notas internas del estudio).
create or replace function public.mi_historial()
returns table (fecha date, hora time, instructor text, asistencia text)
language sql
stable
security definer
set search_path = public
as $$
  select t.fecha, t.hora, t.instructor, r.asistencia
  from public.reservas r
  join public.turnos t on t.id = r.turno_id
  where r.alumno_id = auth.uid()
    and r.estado = 'reservada'
    and not t.cancelado
    and (t.fecha + t.hora) < (now() at time zone 'America/Argentina/Buenos_Aires')
  order by t.fecha desc, t.hora desc
  limit 60;
$$;

drop function if exists public.mis_pagos();
create function public.mis_pagos()
returns table (
  numero bigint,
  fecha timestamptz,
  monto numeric,
  medio text,
  concepto text,
  abono_hasta date
)
language sql
stable
security definer
set search_path = public
as $$
  select p.numero, p.creado_en, p.monto, p.medio, p.concepto, p.abono_hasta
  from public.pagos_clientes p
  where p.alumna_id = auth.uid()
  order by p.creado_en desc
  limit 24;
$$;

-- --- Copia de seguridad (staff) -----------------------------------------------------
-- Todos los perfiles con su mail (que vive en auth.users y la app no puede leer
-- directo), para descargarlos desde Administración.
create or replace function public.respaldo_perfiles()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.es_staff() then
    raise exception 'Solo el staff puede descargar la copia de seguridad.';
  end if;

  return (
    select coalesce(json_agg(row_to_json(x)), '[]'::json)
    from (
      select p.*, u.email
      from public.perfiles p
      left join auth.users u on u.id = p.id
      order by p.creado_en
    ) x
  );
end;
$$;

-- --- Informe por profesora (staff) ---------------------------------------------
-- Por cada profesora (y los turnos sin asignar o con nombre escrito a mano) y
-- dentro del período: clases ya dadas, anotadas, y cuántas asistieron o
-- faltaron según lo que se cargó. Solo cuenta turnos que ya empezaron y no
-- fueron cancelados; incluye a las personas "sin registrar".
create or replace function public.informe_profesoras(p_desde date, p_hasta date)
returns table (
  clave      text,
  nombre     text,
  clases     bigint,
  anotadas   bigint,
  asistieron bigint,
  ausentes   bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.es_staff() then
    raise exception 'Solo el staff puede ver el informe.';
  end if;

  return query
  with tt as (
    select t.id, t.instructora_id, t.instructor
    from public.turnos t
    where t.fecha between p_desde and p_hasta
      and not t.cancelado
      and (t.fecha + t.hora) < (now() at time zone 'America/Argentina/Buenos_Aires')
  ),
  de_alumnas as (
    select r.turno_id,
           count(*) as anot,
           count(*) filter (where r.asistencia = 'asistio') as asis,
           count(*) filter (where r.asistencia = 'ausente') as aus
    from public.reservas r
    join tt on tt.id = r.turno_id
    where r.estado = 'reservada'
    group by r.turno_id
  ),
  de_invitadas as (
    select i.turno_id,
           count(*) as anot,
           count(*) filter (where i.asistencia = 'asistio') as asis,
           count(*) filter (where i.asistencia = 'ausente') as aus
    from public.reservas_invitadas i
    join tt on tt.id = i.turno_id
    group by i.turno_id
  )
  select
    coalesce(tt.instructora_id::text, 'txt:' || coalesce(tt.instructor, '')),
    coalesce(
      nullif(btrim(max(p.nombre || ' ' || p.apellido)), ''),
      nullif(max(tt.instructor), ''),
      'Sin asignar'
    ),
    count(*)::bigint,
    coalesce(sum(coalesce(da.anot, 0) + coalesce(di.anot, 0)), 0)::bigint,
    coalesce(sum(coalesce(da.asis, 0) + coalesce(di.asis, 0)), 0)::bigint,
    coalesce(sum(coalesce(da.aus, 0) + coalesce(di.aus, 0)), 0)::bigint
  from tt
  left join public.perfiles p on p.id = tt.instructora_id
  left join de_alumnas da on da.turno_id = tt.id
  left join de_invitadas di on di.turno_id = tt.id
  group by 1
  order by 2;
end;
$$;

-- --- Interruptor de los recordatorios automáticos -------------------------------
-- Con los recordatorios pausados, recordatorios_pendientes() no devuelve a nadie
-- y la función programada simplemente no manda nada. Se maneja desde Clientes.
create or replace function public.recordatorios_activos()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select valor = 'true'::jsonb from public.configuracion where clave = 'recordatorios_activos'),
    true
  );
$$;

create or replace function public.cambiar_recordatorios(p_activos boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_staff() then
    raise exception 'Solo el staff puede pausar o reanudar los recordatorios.';
  end if;

  insert into public.configuracion (clave, valor, actualizado_por)
  values ('recordatorios_activos', to_jsonb(p_activos), auth.uid())
  on conflict (clave) do update
    set valor = excluded.valor,
        actualizado_en = now(),
        actualizado_por = auth.uid();
end;
$$;

-- --- Registrar un pago a mano (staff) -------------------------------------------
-- Para cargar cobros con la fecha real (aunque sea de otro día), el concepto
-- (mes, clase suelta u otro) y hasta cuándo cubre. Opcionalmente deja a la
-- alumna "al día" hasta esa fecha; si no, solo queda en el historial y el
-- estado de la alumna no cambia.
create or replace function public.registrar_pago_manual(
  p_alumna_id uuid,
  p_monto numeric,
  p_medio text,
  p_concepto text,
  p_nota text,
  p_fecha date,
  p_hasta date,
  p_dejar_al_dia boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fecha date := coalesce(p_fecha, (now() at time zone 'America/Argentina/Buenos_Aires')::date);
begin
  if not public.es_staff() then
    raise exception 'Solo el staff puede registrar pagos.';
  end if;
  if not exists (select 1 from public.perfiles where id = p_alumna_id and rol = 'alumno') then
    raise exception 'No encontramos a esa alumna.';
  end if;
  if p_concepto not in ('mes', 'clase', 'otro') then
    raise exception 'El concepto tiene que ser mes, clase u otro.';
  end if;
  if p_dejar_al_dia and p_hasta is null then
    raise exception 'Para dejarla al día hay que indicar hasta cuándo cubre el pago.';
  end if;

  insert into public.pagos_clientes (alumna_id, monto, medio, concepto, nota, abono_hasta, creado_en)
  values (
    p_alumna_id,
    p_monto,
    coalesce(nullif(p_medio, ''), 'transferencia'),
    p_concepto,
    nullif(btrim(coalesce(p_nota, '')), ''),
    p_hasta,
    ((v_fecha + time '12:00') at time zone 'America/Argentina/Buenos_Aires')
  );

  if p_dejar_al_dia then
    update public.perfiles
      set estado_cuenta = 'al_dia',
          al_dia_hasta = p_hasta,
          pago_actualizado_en = now()
    where id = p_alumna_id;
  end if;
end;
$$;

-- --- Cuántas horas antes se avisa (1, 2 o 3) -------------------------------------
-- Se cambia desde Clientes. Por defecto, 2 horas.
create or replace function public.recordatorio_horas()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select (valor #>> '{}')::int from public.configuracion where clave = 'recordatorio_horas'),
    2
  );
$$;

create or replace function public.cambiar_recordatorio_horas(p_horas int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_staff() then
    raise exception 'Solo el staff puede cambiar cuándo se avisa.';
  end if;
  if p_horas not in (1, 2, 3) then
    raise exception 'Se puede avisar 1, 2 o 3 horas antes.';
  end if;

  insert into public.configuracion (clave, valor, actualizado_por)
  values ('recordatorio_horas', to_jsonb(p_horas), auth.uid())
  on conflict (clave) do update
    set valor = excluded.valor,
        actualizado_en = now(),
        actualizado_por = auth.uid();
end;
$$;

-- --- Recordatorio de la clase ----------------------------------------------------
-- Las usa SOLO la Edge Function "enviar-recordatorios" (con la clave de
-- servicio), que corre cada 10 minutos. Devuelve a quién hay que avisar: los
-- turnos que empiezan dentro de las próximas N horas (N = recordatorio_horas(),
-- por defecto 2; hora argentina), con reserva confirmada (o invitada con mail)
-- que todavía no recibió el aviso. No avisa a quien reservó dentro de esas
-- últimas N horas: recién se anotó. Si los avisos están pausados, no devuelve a
-- nadie. "horas" va en cada fila para que el mail diga la cantidad correcta.
drop function if exists public.recordatorios_pendientes();
create function public.recordatorios_pendientes()
returns table (
  tipo       text,
  reserva_id uuid,
  nombre     text,
  email      text,
  fecha      date,
  hora       time,
  profesora  text,
  horas      int
)
language sql
stable
security definer
set search_path = public
as $$
  with h as (select public.recordatorio_horas() as n)
  select 'alumna'::text, r.id, p.nombre, u.email::text, t.fecha, t.hora, t.instructor, h.n
  from h
  cross join public.reservas r
  join public.turnos t on t.id = r.turno_id
  join public.perfiles p on p.id = r.alumno_id
  join auth.users u on u.id = r.alumno_id
  where public.recordatorios_activos()
    and r.estado = 'reservada'
    and r.recordatorio_enviado_en is null
    and not t.cancelado
    and u.email is not null
    and ((t.fecha + t.hora) at time zone 'America/Argentina/Buenos_Aires') > now()
    and ((t.fecha + t.hora) at time zone 'America/Argentina/Buenos_Aires') <= now() + make_interval(hours => h.n)
    and r.creado_en <= ((t.fecha + t.hora) at time zone 'America/Argentina/Buenos_Aires') - make_interval(hours => h.n)
  union all
  select 'invitada'::text, i.id, i.nombre, i.email, t.fecha, t.hora, t.instructor, h.n
  from h
  cross join public.reservas_invitadas i
  join public.turnos t on t.id = i.turno_id
  where public.recordatorios_activos()
    and i.recordatorio_enviado_en is null
    and i.email is not null
    and not t.cancelado
    and ((t.fecha + t.hora) at time zone 'America/Argentina/Buenos_Aires') > now()
    and ((t.fecha + t.hora) at time zone 'America/Argentina/Buenos_Aires') <= now() + make_interval(hours => h.n)
    and i.creado_en <= ((t.fecha + t.hora) at time zone 'America/Argentina/Buenos_Aires') - make_interval(hours => h.n);
$$;

create or replace function public.marcar_recordatorios(p_reservas uuid[], p_invitadas uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  update public.reservas
    set recordatorio_enviado_en = now()
  where id = any(p_reservas);

  update public.reservas_invitadas
    set recordatorio_enviado_en = now()
  where id = any(p_invitadas);
$$;

-- --- Otros avisos automáticos por mail ---------------------------------------------
-- Los usa la misma Edge Function de los recordatorios (clave de servicio). Todos
-- respetan el interruptor de pausa de Clientes.

-- Abono por vencer: alumnas "al día" cuyo abono vence en los próximos 3 días y a
-- las que todavía no se les avisó por ese vencimiento.
create or replace function public.avisos_vencimiento_pendientes()
returns table (alumna_id uuid, nombre text, email text, al_dia_hasta date)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.nombre, u.email::text, p.al_dia_hasta
  from public.perfiles p
  join auth.users u on u.id = p.id
  where public.recordatorios_activos()
    and p.rol = 'alumno'
    and p.estado_cuenta = 'al_dia'
    and p.al_dia_hasta is not null
    and u.email is not null
    and p.al_dia_hasta >= (now() at time zone 'America/Argentina/Buenos_Aires')::date
    and p.al_dia_hasta <= (now() at time zone 'America/Argentina/Buenos_Aires')::date + 3
    and p.aviso_vencimiento_para is distinct from p.al_dia_hasta;
$$;

-- Subió de la lista de espera: alumnas promovidas en las últimas 24 horas a un
-- turno que todavía no pasó, a las que no se les mandó el mail.
create or replace function public.avisos_promocion_pendientes()
returns table (reserva_id uuid, nombre text, email text, fecha date, hora time, profesora text)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, p.nombre, u.email::text, t.fecha, t.hora, t.instructor
  from public.reservas r
  join public.turnos t on t.id = r.turno_id
  join public.perfiles p on p.id = r.alumno_id
  join auth.users u on u.id = r.alumno_id
  where public.recordatorios_activos()
    and r.estado = 'reservada'
    and r.promovida_en is not null
    and r.promocion_mail_enviado_en is null
    and r.promovida_en > now() - interval '1 day'
    and not t.cancelado
    and u.email is not null
    and ((t.fecha + t.hora) at time zone 'America/Argentina/Buenos_Aires') > now();
$$;

-- Deslinde firmado: alumnas nuevas (registradas desde que se activaron estos
-- avisos) cuyo PDF ya se subió y todavía no se le mandó a la administradora.
create or replace function public.deslindes_pendientes()
returns table (
  alumna_id uuid,
  nombre text,
  apellido text,
  dni text,
  telefono text,
  email text,
  aceptado_en timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.nombre, p.apellido, p.dni, p.telefono, u.email::text, p.deslinde_aceptado_en
  from public.perfiles p
  join auth.users u on u.id = p.id
  where public.recordatorios_activos()
    and p.rol = 'alumno'
    and p.deslinde_pdf_subido
    and p.deslinde_mail_enviado_en is null
    and p.creado_en >= coalesce(
      (select (c.valor #>> '{}')::timestamptz from public.configuracion c where c.clave = 'avisos_desde'),
      now()
    );
$$;

create or replace function public.marcar_avisos(
  p_vencimiento uuid[],
  p_promocion uuid[],
  p_deslinde uuid[]
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.perfiles
    set aviso_vencimiento_para = al_dia_hasta
  where id = any(p_vencimiento);

  update public.reservas
    set promocion_mail_enviado_en = now()
  where id = any(p_promocion);

  update public.perfiles
    set deslinde_mail_enviado_en = now()
  where id = any(p_deslinde);
$$;

-- --- Alumnas para reactivar (staff) -------------------------------------------
-- Quiénes dejaron de venir y no tienen ninguna clase por delante, para escribirles
-- con un toque. Tres motivos:
--   sin_venir    última clase hace p_dias días o más
--   vencido      el abono venció hace una semana o más y no se renovó
--   sin_empezar  se registró hace una semana o más y nunca tuvo una clase
-- Las clases en las que faltó no cuentan como "vino".
create or replace function public.alumnas_para_reactivar(p_dias int default 21)
returns table (
  alumna_id     uuid,
  nombre        text,
  apellido      text,
  telefono      text,
  estado_cuenta text,
  al_dia_hasta  date,
  ultima_clase  date,
  clases        bigint,
  motivo        text,
  avisada_en    timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ahora timestamp := now() at time zone 'America/Argentina/Buenos_Aires';
  v_hoy   date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if not public.es_staff() then
    raise exception 'Solo el staff puede ver esta lista.';
  end if;

  return query
  select x.id, x.nombre, x.apellido, x.telefono, x.estado_cuenta::text, x.al_dia_hasta,
         x.ultima, x.clases,
         case
           when x.ultima is null then 'sin_empezar'
           when x.estado_cuenta = 'al_dia' and x.al_dia_hasta is not null
                and x.al_dia_hasta <= v_hoy - 7 then 'vencido'
           else 'sin_venir'
         end,
         x.reactivacion_avisada_en
  from (
    select p.id, p.nombre, p.apellido, p.telefono, p.estado_cuenta, p.al_dia_hasta,
           p.creado_en, p.reactivacion_avisada_en,
           (select max(t.fecha)
              from public.reservas r
              join public.turnos t on t.id = r.turno_id
             where r.alumno_id = p.id and r.estado = 'reservada' and not t.cancelado
               and (t.fecha + t.hora) < v_ahora
               and r.asistencia is distinct from 'ausente') as ultima,
           (select count(*)
              from public.reservas r
              join public.turnos t on t.id = r.turno_id
             where r.alumno_id = p.id and r.estado = 'reservada' and not t.cancelado
               and (t.fecha + t.hora) < v_ahora
               and r.asistencia is distinct from 'ausente') as clases,
           exists (select 1
              from public.reservas r
              join public.turnos t on t.id = r.turno_id
             where r.alumno_id = p.id and r.estado in ('reservada', 'lista_espera')
               and not t.cancelado and (t.fecha + t.hora) >= v_ahora) as tiene_proxima
    from public.perfiles p
    where p.rol = 'alumno'
  ) x
  where not x.tiene_proxima
    and (
      (x.ultima is null and (x.creado_en at time zone 'America/Argentina/Buenos_Aires')::date <= v_hoy - 7)
      or (x.ultima is not null and x.ultima <= v_hoy - p_dias)
      or (x.estado_cuenta = 'al_dia' and x.al_dia_hasta is not null and x.al_dia_hasta <= v_hoy - 7)
    )
  order by x.ultima desc nulls last, x.nombre;
end;
$$;

-- Deja asentado que ya se le escribió a la alumna (la lista la esconde un tiempo).
create or replace function public.marcar_reactivacion(p_alumna_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_staff() then
    raise exception 'Solo el staff puede hacer esto.';
  end if;
  update public.perfiles set reactivacion_avisada_en = now() where id = p_alumna_id;
end;
$$;

-- --- Saludo de cumpleaños por mail ---------------------------------------------
-- Alumnas que cumplen años hoy (hora argentina), a partir de las 9, y a las que
-- todavía no se les saludó este año. Respeta el interruptor de pausa.
create or replace function public.avisos_cumple_pendientes()
returns table (alumna_id uuid, nombre text, email text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.nombre, u.email::text
  from public.perfiles p
  join auth.users u on u.id = p.id
  where public.recordatorios_activos()
    and p.rol = 'alumno'
    and p.fecha_nacimiento is not null
    and u.email is not null
    and extract(hour from now() at time zone 'America/Argentina/Buenos_Aires') >= 9
    and extract(month from p.fecha_nacimiento) =
        extract(month from now() at time zone 'America/Argentina/Buenos_Aires')
    and extract(day from p.fecha_nacimiento) =
        extract(day from now() at time zone 'America/Argentina/Buenos_Aires')
    and p.aviso_cumple_anio is distinct from
        extract(year from now() at time zone 'America/Argentina/Buenos_Aires')::int;
$$;

create or replace function public.marcar_avisos_cumple(p_alumnas uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  update public.perfiles
    set aviso_cumple_anio =
        extract(year from now() at time zone 'America/Argentina/Buenos_Aires')::int
  where id = any(p_alumnas);
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

-- ============================================================================
-- Gestión del estudio: egresos, liquidación de profesoras, anuncios y resumen
-- ============================================================================

-- --- Egresos --------------------------------------------------------------------
-- Gastos del estudio (alquiler, insumos, etc.). Solo el staff. Junto con los
-- cobros y los pagos a profesoras dan el resultado del mes.
create table if not exists public.gastos (
  id             uuid primary key default gen_random_uuid(),
  fecha          date not null default (now() at time zone 'America/Argentina/Buenos_Aires')::date,
  categoria      text not null default 'otro'
                 check (categoria in ('alquiler', 'servicios', 'insumos', 'sueldos', 'impuestos', 'marketing', 'otro')),
  concepto       text not null check (length(btrim(concepto)) > 0),
  monto          numeric(12, 2) not null check (monto > 0),
  nota           text,
  registrado_por uuid references auth.users (id) on delete set null default auth.uid(),
  creado_en      timestamptz not null default now()
);

create index if not exists gastos_fecha_idx on public.gastos (fecha desc);

alter table public.gastos enable row level security;

drop policy if exists gastos_staff on public.gastos;
create policy gastos_staff on public.gastos
  for all using (public.es_staff()) with check (public.es_staff());

-- --- Liquidación de profesoras ----------------------------------------------------
-- Cuánto se le paga a cada profesora por clase dada, y el registro de lo que se
-- le fue pagando mes a mes. Cada profesora ve lo suyo; solo el staff lo carga.
create table if not exists public.tarifas_profesoras (
  profesora_id   uuid primary key references public.perfiles (id) on delete cascade,
  valor_clase    numeric(12, 2) not null check (valor_clase >= 0),
  actualizado_en timestamptz not null default now()
);

create table if not exists public.pagos_profesoras (
  id             uuid primary key default gen_random_uuid(),
  profesora_id   uuid not null references public.perfiles (id) on delete cascade,
  periodo        date not null check (extract(day from periodo) = 1),
  clases         int not null default 0,
  valor_clase    numeric(12, 2),
  monto          numeric(12, 2) not null check (monto > 0),
  medio          text not null default 'transferencia'
                 check (medio in ('transferencia', 'mercado_pago', 'efectivo', 'otro')),
  fecha          date not null default (now() at time zone 'America/Argentina/Buenos_Aires')::date,
  nota           text,
  registrado_por uuid references auth.users (id) on delete set null default auth.uid(),
  creado_en      timestamptz not null default now()
);

create index if not exists pagos_profesoras_idx
  on public.pagos_profesoras (profesora_id, periodo desc);

alter table public.tarifas_profesoras enable row level security;
alter table public.pagos_profesoras enable row level security;

drop policy if exists tarifas_staff on public.tarifas_profesoras;
create policy tarifas_staff on public.tarifas_profesoras
  for all using (public.es_staff()) with check (public.es_staff());

drop policy if exists tarifas_propia on public.tarifas_profesoras;
create policy tarifas_propia on public.tarifas_profesoras
  for select using (profesora_id = auth.uid());

drop policy if exists pagos_profesoras_staff on public.pagos_profesoras;
create policy pagos_profesoras_staff on public.pagos_profesoras
  for all using (public.es_staff()) with check (public.es_staff());

drop policy if exists pagos_profesoras_propios on public.pagos_profesoras;
create policy pagos_profesoras_propios on public.pagos_profesoras
  for select using (profesora_id = auth.uid());

-- Cálculo de un mes para una profesora: clases ya dadas (sin las canceladas),
-- valor por clase actual, lo que le corresponde, lo ya pagado y el saldo. Si no
-- tiene valor por clase cargado, "a pagar" y "saldo" quedan vacíos. Función interna.
create or replace function public.liquidacion_de(p_prof uuid, p_mes date)
returns table (
  clases      bigint,
  valor_clase numeric,
  a_pagar     numeric,
  pagado      numeric,
  saldo       numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with m as (
    select date_trunc('month', p_mes)::date as ini
  ),
  c as (
    select count(*) as n
    from public.turnos t, m
    where t.instructora_id = p_prof
      and not t.cancelado
      and t.fecha >= m.ini
      and t.fecha < (m.ini + interval '1 month')::date
      and (t.fecha + t.hora) < (now() at time zone 'America/Argentina/Buenos_Aires')
  ),
  v as (
    select tp.valor_clase as valor from public.tarifas_profesoras tp where tp.profesora_id = p_prof
  ),
  g as (
    select coalesce(sum(x.monto), 0) as total
    from public.pagos_profesoras x, m
    where x.profesora_id = p_prof and x.periodo = m.ini
  )
  select c.n, v.valor, c.n * v.valor, g.total, c.n * v.valor - g.total
  from c cross join g left join v on true;
$$;

revoke execute on function public.liquidacion_de(uuid, date) from public, anon, authenticated;

-- Todas las profesoras en un mes (staff).
create or replace function public.liquidacion_mes(p_mes date)
returns table (
  profesora_id uuid,
  nombre       text,
  clases       bigint,
  valor_clase  numeric,
  a_pagar      numeric,
  pagado       numeric,
  saldo        numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ini date := date_trunc('month', p_mes)::date;
begin
  if not public.es_staff() then
    raise exception 'Solo el staff puede ver la liquidación.';
  end if;

  return query
  select p.id,
         coalesce(nullif(btrim(p.nombre || ' ' || p.apellido), ''), 'Sin nombre'),
         l.clases, l.valor_clase, l.a_pagar, l.pagado, l.saldo
  from public.perfiles p
  cross join lateral public.liquidacion_de(p.id, v_ini) l
  where p.rol = 'instructora' or l.clases > 0 or l.pagado > 0
  order by 2;
end;
$$;

-- Lo mío (profesora) en un mes.
create or replace function public.mi_liquidacion(p_mes date)
returns table (
  clases      bigint,
  valor_clase numeric,
  a_pagar     numeric,
  pagado      numeric,
  saldo       numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select * from public.liquidacion_de(auth.uid(), p_mes);
$$;

-- --- Balance del mes (staff) -------------------------------------------------------
-- Cobrado a alumnas, gastos cargados y pagos a profesoras de un mes.
create or replace function public.balance_mes(p_mes date)
returns table (cobrado numeric, gastos numeric, liquidaciones numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ini date := date_trunc('month', p_mes)::date;
  v_fin date := (date_trunc('month', p_mes) + interval '1 month')::date;
begin
  if not public.es_staff() then
    raise exception 'Solo el staff puede ver el balance.';
  end if;

  return query
  select
    coalesce((select sum(pc.monto) from public.pagos_clientes pc
              where pc.creado_en >= (v_ini::timestamp at time zone 'America/Argentina/Buenos_Aires')
                and pc.creado_en <  (v_fin::timestamp at time zone 'America/Argentina/Buenos_Aires')), 0),
    coalesce((select sum(g.monto) from public.gastos g
              where g.fecha >= v_ini and g.fecha < v_fin), 0),
    coalesce((select sum(pp.monto) from public.pagos_profesoras pp
              where pp.fecha >= v_ini and pp.fecha < v_fin), 0);
end;
$$;

-- --- Anuncios ----------------------------------------------------------------------
-- Cartel que ven todas al entrar a la app (feriados, cambios de horario,
-- novedades). Se puede mandar también por mail. Los maneja el staff.
create table if not exists public.anuncios (
  id          uuid primary key default gen_random_uuid(),
  titulo      text not null default '',
  mensaje     text not null check (length(btrim(mensaje)) > 0),
  para        text not null default 'alumnas' check (para in ('alumnas', 'profesoras', 'todas')),
  importante  boolean not null default false,
  desde       date not null default (now() at time zone 'America/Argentina/Buenos_Aires')::date,
  hasta       date,
  activo      boolean not null default true,
  enviar_mail boolean not null default false,
  creado_por  uuid references auth.users (id) on delete set null default auth.uid(),
  creado_en   timestamptz not null default now()
);

-- A quién ya se le mandó el mail de cada anuncio (para no repetir).
create table if not exists public.anuncios_envios (
  anuncio_id uuid not null references public.anuncios (id) on delete cascade,
  perfil_id  uuid not null references public.perfiles (id) on delete cascade,
  enviado_en timestamptz not null default now(),
  primary key (anuncio_id, perfil_id)
);

alter table public.anuncios enable row level security;
alter table public.anuncios_envios enable row level security;

drop policy if exists anuncios_staff on public.anuncios;
create policy anuncios_staff on public.anuncios
  for all using (public.es_staff()) with check (public.es_staff());

-- Cada quien ve los anuncios vigentes dirigidos a su rol.
drop policy if exists anuncios_vigentes on public.anuncios;
create policy anuncios_vigentes on public.anuncios
  for select to authenticated using (
    activo
    and desde <= (now() at time zone 'America/Argentina/Buenos_Aires')::date
    and (hasta is null or hasta >= (now() at time zone 'America/Argentina/Buenos_Aires')::date)
    and (
      para = 'todas'
      or (para = 'profesoras' and public.es_instructora())
      or (para = 'alumnas' and not public.es_instructora() and not public.es_staff())
    )
  );

-- Mails de anuncios pendientes (los manda la Edge Function): de a 40 por
-- corrida para no pasarse de tiempo; el resto sale en las siguientes.
create or replace function public.anuncios_mail_pendientes()
returns table (
  anuncio_id uuid,
  titulo     text,
  mensaje    text,
  importante boolean,
  perfil_id  uuid,
  nombre     text,
  email      text
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.titulo, a.mensaje, a.importante, p.id, p.nombre, u.email::text
  from public.anuncios a
  join public.perfiles p
    on (a.para in ('alumnas', 'todas') and p.rol = 'alumno')
    or (a.para in ('profesoras', 'todas') and p.rol = 'instructora')
  join auth.users u on u.id = p.id
  where public.recordatorios_activos()
    and a.activo
    and a.enviar_mail
    and a.creado_en > now() - interval '3 days'
    and a.desde <= (now() at time zone 'America/Argentina/Buenos_Aires')::date
    and (a.hasta is null or a.hasta >= (now() at time zone 'America/Argentina/Buenos_Aires')::date)
    and u.email is not null
    and not exists (
      select 1 from public.anuncios_envios e where e.anuncio_id = a.id and e.perfil_id = p.id
    )
  order by a.creado_en, p.id
  limit 40;
$$;

create or replace function public.marcar_anuncios_enviados(p_anuncios uuid[], p_perfiles uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.anuncios_envios (anuncio_id, perfil_id)
  select a, p from unnest(p_anuncios, p_perfiles) as t(a, p)
  on conflict do nothing;
$$;

-- --- Resumen del estudio (staff) ----------------------------------------------------
-- Los números clave para el tablero de Administración.
create or replace function public.resumen_estudio()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ahora timestamp := now() at time zone 'America/Argentina/Buenos_Aires';
  v_hoy   date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_mes   date := date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_ant   date := (date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires') - interval '1 month')::date;
  v_b     record;
  v_b_ant record;
  v_reservas bigint;
  v_cupo     bigint;
  v_clases   bigint;
  v_activas  bigint;
begin
  if not public.es_staff() then
    raise exception 'Solo el staff puede ver el resumen.';
  end if;

  select * into v_b from public.balance_mes(v_mes);
  select * into v_b_ant from public.balance_mes(v_ant);

  select count(*), coalesce(sum(t.cupo), 0),
         coalesce(sum(
           (select count(*) from public.reservas r where r.turno_id = t.id and r.estado = 'reservada')
           + (select count(*) from public.reservas_invitadas i where i.turno_id = t.id)
         ), 0)
    into v_clases, v_cupo, v_reservas
  from public.turnos t
  where not t.cancelado
    and (t.fecha + t.hora) < v_ahora
    and (t.fecha + t.hora) >= v_ahora - interval '30 days';

  select count(distinct r.alumno_id) into v_activas
  from public.reservas r
  join public.turnos t on t.id = r.turno_id
  where r.estado = 'reservada' and not t.cancelado
    and (t.fecha + t.hora) < v_ahora
    and (t.fecha + t.hora) >= v_ahora - interval '30 days'
    and r.asistencia is distinct from 'ausente';

  return json_build_object(
    'cobrado_mes', v_b.cobrado,
    'cobrado_mes_anterior', v_b_ant.cobrado,
    'egresos_mes', v_b.gastos + v_b.liquidaciones,
    'egresos_mes_anterior', v_b_ant.gastos + v_b_ant.liquidaciones,
    'alumnas_total', (select count(*) from public.perfiles where rol = 'alumno'),
    'alumnas_activas', v_activas,
    'altas_mes', (select count(*) from public.perfiles
                  where rol = 'alumno'
                    and (creado_en at time zone 'America/Argentina/Buenos_Aires')::date >= v_mes),
    'altas_mes_anterior', (select count(*) from public.perfiles
                           where rol = 'alumno'
                             and (creado_en at time zone 'America/Argentina/Buenos_Aires')::date >= v_ant
                             and (creado_en at time zone 'America/Argentina/Buenos_Aires')::date < v_mes),
    'al_dia', (select count(*) from public.perfiles
               where rol = 'alumno' and estado_cuenta = 'al_dia'
                 and (al_dia_hasta is null or al_dia_hasta >= v_hoy)),
    'vencen_semana', (select count(*) from public.perfiles
                      where rol = 'alumno' and estado_cuenta = 'al_dia'
                        and al_dia_hasta between v_hoy and v_hoy + 7),
    'vencidas', (select count(*) from public.perfiles
                 where rol = 'alumno' and estado_cuenta = 'al_dia' and al_dia_hasta < v_hoy),
    'deben', (select count(*) from public.perfiles
              where rol = 'alumno' and estado_cuenta = 'pendiente'),
    'en_prueba', (select count(*) from public.perfiles
                  where rol = 'alumno' and estado_cuenta = 'prueba'),
    'comprobantes_pendientes', (select count(*) from public.comprobantes_pago where estado = 'pendiente'),
    'para_reactivar', (select count(*) from public.alumnas_para_reactivar(21) x
                       where x.avisada_en is null or x.avisada_en < now() - interval '30 days'),
    'clases_30d', v_clases,
    'reservas_30d', v_reservas,
    'cupo_30d', v_cupo
  );
end;
$$;

-- Permisos de ejecución (authenticated ya puede ejecutar funciones public
-- por defecto en Supabase, pero lo dejamos explícito).
grant execute on function public.reservar_turno(uuid)          to authenticated;
grant execute on function public.cancelar_reserva(uuid)        to authenticated;
grant execute on function public.reservar_serie(uuid)          to authenticated;
grant execute on function public.listar_turnos(date, date)     to authenticated;
grant execute on function public.generar_turnos(uuid, date, date) to authenticated;
grant execute on function public.estadisticas(date, date)      to authenticated;
-- Los recordatorios los maneja solo la función programada (clave de servicio):
-- ni alumnas ni la app pueden llamarlos.
revoke execute on function public.recordatorios_pendientes() from public, anon, authenticated;
revoke execute on function public.marcar_recordatorios(uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.recordatorios_pendientes() to service_role;
grant execute on function public.marcar_recordatorios(uuid[], uuid[]) to service_role;

revoke execute on function public.avisos_vencimiento_pendientes() from public, anon, authenticated;
revoke execute on function public.avisos_promocion_pendientes() from public, anon, authenticated;
revoke execute on function public.deslindes_pendientes() from public, anon, authenticated;
revoke execute on function public.marcar_avisos(uuid[], uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.avisos_vencimiento_pendientes() to service_role;
grant execute on function public.avisos_promocion_pendientes() to service_role;
grant execute on function public.deslindes_pendientes() to service_role;
grant execute on function public.marcar_avisos(uuid[], uuid[], uuid[]) to service_role;
revoke execute on function public.avisos_cumple_pendientes() from public, anon, authenticated;
revoke execute on function public.marcar_avisos_cumple(uuid[]) from public, anon, authenticated;
grant execute on function public.avisos_cumple_pendientes() to service_role;
grant execute on function public.marcar_avisos_cumple(uuid[]) to service_role;

grant execute on function public.listar_profesoras()           to authenticated;
grant execute on function public.ocupados_turno(uuid)          to authenticated;
grant execute on function public.agregar_alumna_a_turno(uuid, uuid) to authenticated;
grant execute on function public.vincular_invitada(uuid, uuid) to authenticated;
grant execute on function public.informe_profesoras(date, date) to authenticated;
grant execute on function public.registrar_pago(uuid, numeric, text, text, date) to authenticated;
grant execute on function public.marcar_promocion_vista(uuid) to authenticated;
grant execute on function public.cambiar_recordatorios(boolean) to authenticated;
grant execute on function public.registrar_pago_manual(uuid, numeric, text, text, text, date, date, boolean) to authenticated;
grant execute on function public.cambiar_recordatorio_horas(int) to authenticated;
grant execute on function public.mi_historial() to authenticated;
grant execute on function public.mis_pagos() to authenticated;
grant execute on function public.alumnas_para_reactivar(int) to authenticated;
grant execute on function public.marcar_reactivacion(uuid) to authenticated;
grant execute on function public.respaldo_perfiles() to authenticated;
grant execute on function public.agregar_invitada_a_turno(uuid, text, text, text, text) to authenticated;
grant execute on function public.clientes_para_instructora()   to authenticated;
grant execute on function public.liquidacion_mes(date) to authenticated;
grant execute on function public.mi_liquidacion(date) to authenticated;
grant execute on function public.balance_mes(date) to authenticated;
grant execute on function public.resumen_estudio() to authenticated;

-- Los mails de anuncios los maneja solo la función programada.
revoke execute on function public.anuncios_mail_pendientes() from public, anon, authenticated;
revoke execute on function public.marcar_anuncios_enviados(uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.anuncios_mail_pendientes() to service_role;
grant execute on function public.marcar_anuncios_enviados(uuid[], uuid[]) to service_role;
