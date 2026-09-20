# FORTEVA Studio — turnero

App de reservas para FORTEVA Studio (Pilates & Strength).

- **Alumno**: se registra, ve los turnos de los próximos 14 días y se anota (o se pone en lista de espera si está completo). Puede cancelar.
- **Staff**: arma la agenda con turnos sueltos y/o turnos fijos semanales, ve quién se anotó en cada turno y puede cancelar un turno o sacar a alguien.

Stack: React + Vite + TypeScript + Supabase (auth + Postgres + RLS). No hay backend propio: toda la lógica sensible (reservar sin sobrecupo, generar turnos) vive en funciones de Postgres.

## Rutas

Es un sitio de dos páginas:

- **`/`** — sitio público del estudio (estático, sin React): `index.html` en la raíz del proyecto. Habla de Pilates & Strength y de FORTEVA, para quien piensa en anotarse — nada de features de la app ni de lo que ve el staff.
- **`/app`** — la aplicación (login, reservas, agenda): `app/index.html`, que carga `src/main.tsx`.

`vite.config.ts` declara los dos como entradas del build. `public/presentacion.html` quedó como un redirect a `/` por si alguien tiene guardado el link viejo.

## Puesta en marcha

### 1. Crear el proyecto de Supabase

1. Entrá a [supabase.com](https://supabase.com) → **New project**. El nombre es libre (ej. `turnero-pilates`).
2. Cuando termine de aprovisionar, andá a **Project Settings → API** y copiá:
   - **Project URL**
   - **anon public** key

### 2. Cargar el esquema

En Supabase: **SQL Editor → New query**, pegá todo el contenido de [`supabase/schema.sql`](supabase/schema.sql) y ejecutá (**Run**). Crea las tablas, las políticas de seguridad y las funciones. Se puede volver a correr sin romper nada.

### 3. Variables de entorno

```bash
cp .env.example .env
```

Completá `.env` con la URL y la anon key del paso 1.

### 4. Instalar y levantar

```bash
npm install
npm run dev
```

Abrí **`/app`** (no la raíz, que es la presentación) para llegar al login.

### 5. Crear el primer usuario staff

1. Registrate desde la app con el mail del estudio (queda como `alumno`).
2. En Supabase: **Table Editor → `perfiles`**, buscá esa fila y cambiá `rol` de `alumno` a `staff`.
3. Recargá la app: ahora entrás al panel de administración.

### (Opcional) Desactivar confirmación de correo

Para que los alumnos entren sin tener que confirmar el mail:
**Supabase → Authentication → Providers → Email → desactivar "Confirm email"**.

## Cambiar el logo

Los archivos de marca salen del kit oficial (`REDES/LOGOTIPO` y `REDES/ISOTIPORESUMIDO`, PNG con transparencia real), recortados al contenido:

- **`src/assets/forteva-logo.png`** — logotipo + isotipo completo, en el login.
- **`src/assets/forteva-marca.png`** — isotipo resumido (solo la flor, sin hojas), en la cabecera de la app (`src/componentes/CabeceraApp.tsx`).
- **`public/favicon.png`**, **`public/icon-512.png`**, **`public/apple-touch-icon.png`** — ícono de pestaña, PWA y iOS.
- La presentación (`index.html`, raíz del sitio) lleva su propia copia embebida en base64 del logotipo, en color y en blanco (para el pie en modo oscuro).

Como ahora son PNG con canal alfa de verdad, no hace falta ningún truco de `mix-blend-mode`: cualquier reemplazo solo necesita fondo transparente. El color de marca es **`#948077`** (taupe), documentado en `FORTEVAMUESTRA.jpg` del kit. El nombre se cambia en `NOMBRE_ESTUDIO` de `src/componentes/Auth.tsx`.

## Correos de confirmación de registro

Por defecto Supabase manda los mails con su servidor propio, limitado a ~3 por hora — sirve para probar, no para producción. Para dejarlo bien:

### 1. SMTP propio

**Authentication → Emails → SMTP Settings** (o Project Settings → Auth). Cargá un proveedor con capa gratis:

| Proveedor | Gratis | Host / usuario |
|---|---|---|
| [Resend](https://resend.com) | 3.000/mes | host `smtp.resend.com`, puerto `465`, usuario `resend`, contraseña = API key |
| [Brevo](https://brevo.com) | 300/día | host `smtp-relay.brevo.com`, puerto `587` |

Necesitás un dominio para el remitente (`turnos@tudominio.com`) y cargar los registros DNS (SPF/DKIM) que te da el proveedor, si no los mails caen en spam.

### 2. Site URL y redirect

**Authentication → URL Configuration**: poné en *Site URL* la dirección donde publiques la app (ej. `https://turnos-pilates.vercel.app`). Es a donde vuelve el link de confirmación.

### 3. Plantilla del mail

**Authentication → Email Templates → Confirm signup**: editá asunto y cuerpo con el nombre y los colores del estudio. Variables disponibles: `{{ .ConfirmationURL }}`, `{{ .SiteURL }}`.

### 4. Subir el límite

**Authentication → Rate Limits**: con SMTP propio ya podés subir el límite de correos por hora.

> Alternativa rápida sin nada de esto: desactivar **Confirm email** en Authentication → Providers → Email. Los alumnos entran sin confirmar.

## Nombrar un administrador

Un usuario no puede autoascenderse. Para nombrar al primer staff, en **SQL Editor**:

```sql
update public.perfiles p
set rol = 'staff'
from auth.users u
where u.id = p.id and u.email = 'MAIL@EJEMPLO.COM';
```

## Modelo de datos

| Tabla | Qué guarda |
|---|---|
| `perfiles` | 1 fila por usuario. `rol`: `alumno` \| `staff`. |
| `plantillas_turno` | Turno fijo semanal (día, hora, cupo, instructor). |
| `turnos` | Turno concreto en una fecha. Se crea a mano o generado desde una plantilla. |
| `reservas` | 1 fila por (turno, alumno). `estado`: `reservada` \| `lista_espera` \| `cancelada`. `asistencia`: `asistio` \| `ausente` \| null (se carga después de la clase, la pone el staff). |

Funciones: `reservar_turno`, `cancelar_reserva`, `listar_turnos` (alumno), `generar_turnos` (staff).

## Pendiente (fuera del MVP)

- Estadísticas por mes (ocupación, alumnos activos, ausencias) — ya con datos de asistencia para alimentarlas.
- Bonos / paquetes de clases y pagos.
- Avisos automáticos por WhatsApp/mail cuando se cancela un turno.
- Ficha de alumna (lesiones, nivel, contacto de emergencia).
