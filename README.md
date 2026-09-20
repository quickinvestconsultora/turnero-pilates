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

**Authentication → URL Configuration**:

- **Site URL**: `https://tu-dominio/app/` (con `/app/`, no la raíz — ahí vive el login, la raíz es la presentación pública).
- **Redirect URLs**: agregá `https://tu-dominio/app/**`.

Ahí es a donde vuelven los links de confirmación de registro y de **"Olvidé mi contraseña"**. Si esto queda mal (o en un `localhost` de otra compu, que es el valor por defecto), el link no lleva a ningún lado.

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
| `perfiles` | 1 fila por usuario. `rol`: `alumno` \| `staff`. Identidad, obligatoria desde el registro: `apellido`, `dni`. Ficha (opcional, se completa desde "Mis datos"): `nivel`, `lesiones`, `contacto_emergencia_nombre`, `contacto_emergencia_telefono`. Las lesiones se muestran al staff en la lista de anotadas de cada turno. `estado_cuenta`: `prueba` \| `al_dia` \| `pendiente` — lo cambia el staff a mano desde **Clientes**, nunca la propia alumna. `deslinde_aceptado_en` / `deslinde_pdf_subido`: ver más abajo. |
| `plantillas_turno` | Turno fijo semanal (día, hora, cupo, instructor). |
| `turnos` | Turno concreto en una fecha. Se crea a mano o generado desde una plantilla. |
| `reservas` | 1 fila por (turno, alumno). `estado`: `reservada` \| `lista_espera` \| `cancelada`. `asistencia`: `asistio` \| `ausente` \| null (se carga después de la clase, la pone el staff). |

Funciones: `reservar_turno`, `cancelar_reserva`, `listar_turnos` (alumno), `generar_turnos` (staff), `estadisticas` (staff — ocupación, ausentismo y ranking de faltas de los últimos 30 días).

## Clientes y estado de cuenta

Pestaña **Clientes** (staff): lista todas las alumnas registradas, con su nivel, teléfono, fecha de alta y **estado de cuenta** (`Prueba` / `Al día` / `Debe`), que el staff cambia a mano con tres botones. Toda alumna nueva arranca en `Prueba` — no hay cobro ni vencimiento automático, es un criterio que aplica el staff.

**Regla de reserva ligada al estado de cuenta** (la aplica `reservar_turno` en el servidor, no se puede saltear desde el navegador):

- `Prueba`: la **primera** reserva (la que sea) es gratis. De la segunda en adelante, se bloquea y le aparece una ventana pidiendo que abone.
- `Debe`: siempre bloqueada, misma ventana.
- `Al día`: sin límite, reserva lo que quiera.

El staff pasa a una alumna a `Al día` desde **Clientes** cuando confirma que pagó el mes, y eso le desbloquea la agenda. Si en algún momento deja de pagar, se la vuelve a pasar a `Debe`.

Cuando queda bloqueada (`Debe`, o `Prueba` después de la primera clase), la alumna ve las formas de pago que estén cargadas en **`src/config/pagos.ts`**, tanto en el cartel permanente (`Debe`) como en la ventana que aparece al intentar reservar:

```ts
export const LINK_MERCADO_PAGO = ''       // tu link de pago (mpago.la/...)
export const TRANSFERENCIA_ALIAS = ''     // alias o CBU
export const TRANSFERENCIA_TITULAR = ''   // a nombre de quién
export const WHATSAPP_NUMERO = ''         // con código de país, ej. 5492291234567
```

Cada botón aparece solo si su dato está cargado — no hay nada inventado ni de relleno. No es un cobro automático (no hay integración con la API de Mercado Pago ni webhooks): la alumna paga por su cuenta y el staff la pasa a `Al día` desde Clientes cuando lo confirma.

La misma ventana muestra la lista de precios cargada en **`src/config/precios.ts`** (clase suelta y los abonos mensuales por cantidad de clases por semana) — se edita ahí, sin tocar código.

## Registro y deslinde de responsabilidad

El registro pide **nombre, apellido, DNI y teléfono**, y obliga a tildar "Leí y acepto el deslinde de responsabilidad" (texto en **`src/config/deslinde.ts`**) para poder crear la cuenta.

⚠️ **El texto del deslinde es un borrador mío, no de un abogado.** Sirve como punto de partida razonable, pero antes de confiar en él como protección legal real hace falta que lo revise un abogado y lo ajuste a la situación puntual del estudio.

Al aceptar, la app genera un **PDF** (datos + texto del deslinde + fecha de aceptación) y lo sube a un bucket privado de Supabase Storage (`deslindes`, un archivo por alumna en `<id>/deslinde.pdf`). Si en ese momento todavía no hay sesión activa (falta confirmar el mail), queda pendiente y se sube solo la primera vez que la alumna entra con sesión ya confirmada — ver el efecto en `App.tsx`.

El staff lo descarga por cada alumna desde **Clientes → Ver deslinde firmado**. No hay envío automático por mail (no hay backend ni SMTP confiable para adjuntar archivos todavía).

La generación de PDF usa `jsPDF`, cargado en un chunk aparte (no suma peso al resto de la app: solo se descarga cuando hace falta generar un PDF).

## Pendiente (fuera del MVP)

- Bonos / paquetes de clases con vencimiento (por ahora el estado de cuenta es binario: al día o debe, sin "cuántas clases le quedan").
- Cobro real con Mercado Pago (API + webhook) en vez del link manual.

**En pausa hasta tener mail propio del estudio** (dominio + cuenta en Resend/Brevo con API key — ver "Correos de confirmación de registro" más arriba). Ninguna de las tres se puede armar con lo que manda Supabase hoy, porque necesitan mandar contenido propio (adjuntos, disparadas por eventos), no solo los mails fijos de login:

- Mandar el PDF del deslinde por mail a la administradora apenas se registra una alumna (hoy se descarga a demanda desde Clientes → Ver deslinde firmado).
- Recordatorio por mail antes de cada clase (baja el ausentismo).
- Avisar por mail a la alumna cuando se libera un lugar de la lista de espera (hoy sube sola en el sistema pero no se entera hasta que entra a mirar).
