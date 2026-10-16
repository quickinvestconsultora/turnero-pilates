# FORTEVA Studio — turnero

App de reservas para FORTEVA Studio (Pilates & Strength).

- **Alumno**: se registra, ve los turnos publicados hasta el fin del mes que viene y se anota (o se pone en lista de espera si está completo). Puede cancelar o cambiar un lugar confirmado hasta **2 horas antes** del turno (lo hace cumplir `cancelar_reserva` en la base; la lista de espera se puede dejar siempre). Pasado ese límite, solo el staff puede sacarla.
- **Staff**: la navegación tiene cinco pestañas (**Hoy**, **Agenda**, **Semana**, **Turnos fijos** y **Administración**); dentro de Administración hay tres solapas: **Clientes**, **Profesores** y **Estadísticas**. Arma la agenda con turnos sueltos y/o turnos fijos semanales, ve quién se anotó en cada turno y puede cancelar un turno o sacar a alguien. Con **Editar** en un turno cambia la profesora y el cupo, y si el turno viene de un turno fijo puede aplicar el cambio a todos los siguientes del mismo horario. En **Clientes** hay filtros de cobro (vencen esta semana, vencidas, deben, prueba, al día) con la cantidad de cada uno. Con **Cancelar todo el día** (junto al título de cada fecha) cancela de una vez todos los turnos que faltan de ese día (feriado, ausencia) y muestra la lista de anotadas con un botón de WhatsApp por cada una, con el aviso y el motivo ya escritos. La alumna ve arriba de sus turnos hasta cuándo cubre su abono, y un cartel para instalar el turnero en la pantalla de inicio del celular (botón en Android, instrucciones en iPhone; se cierra con "Ahora no").
- **Profesora** (`rol = instructora`): se registra como cualquier alumna y el staff la convierte desde **Clientes → Ver ficha → Más opciones → Convertir en profesora** (escondido a propósito para no tocarlo sin querer). Su pantalla tiene: **Mis turnos** (ve toda la agenda del estudio, pero solo abre, edita y marca asistencia en los suyos), **Turnos fijos**, **Clientes** (fichas, historial y observaciones, **sin estado de cuenta, pagos ni deslinde**) y **Mi perfil** (su ficha: foto, galería de hasta 8 fotos, frase, especialidades, formación, experiencia, Instagram y descripción, con vista previa de cómo la ven las alumnas). No ve estadísticas. Al primer ingreso ve un tutorial de bienvenida (botón "Tutorial" para volver a verlo). Los turnos que crea quedan a su nombre, y en cada uno puede **sumar alumnas**: las ya registradas (buscándolas) o, si todavía no tienen cuenta, cargando solo el nombre (apellido, celular y mail son opcionales y se completan después; quedan anotadas con la marca "Sin registrar" y cuentan para el cupo); al staff, al crear un turno, le aparece un selector de profesora. Las alumnas ven "Profesora: X" debajo de cada turno y, al tocarlo, su foto y descripción. Los permisos los hace cumplir la base (RLS y funciones), no la pantalla. El staff las ve en la pestaña **Profesores**.

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
2. En Supabase: **Table Editor → `perfiles`**, buscá esa fila y cambiá `rol` de `alumno` a| `perfiles` | 1 fila por usuario. `rol`: `alumno` | `instructora` | `staff`.
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

**Authentication → Email Templates**: ya hay plantillas en español, con el logo y los colores de FORTEVA, listas para pegar en [`supabase/emails/`](supabase/emails):

| Plantilla de Supabase | Archivo | Asunto sugerido |
|---|---|---|
| **Confirm signup** | `confirmar-registro.html` | `Confirmá tu cuenta en FORTEVA Studio` |
| **Reset Password** | `recuperar-contrasena.html` | `Elegí tu contraseña nueva - FORTEVA Studio` |

Se pega todo el contenido del archivo en el campo *Message body* (pestaña *Source*) y el asunto en *Subject*. El logo se carga desde `https://turnero-pilates.vercel.app/forteva-logo-email.png` (archivo en `public/`); si el sitio cambia de dirección, hay que actualizar esa URL en las plantillas. El botón de confirmación lleva directo al turnero: la app manda `emailRedirectTo` = `/app/` al registrarse. Variables disponibles: `{{ .ConfirmationURL }}`, `{{ .SiteURL }}`, `{{ .Email }}`.

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
| `perfiles` | 1 fila por usuario. `rol`: `alumno` | `instructora` | `staff`.\| `staff`. Identidad, obligatoria desde el registro: `apellido`, `dni`. Ficha (opcional, se completa desde "Mis datos"): `nivel`, `lesiones`, `contacto_emergencia_nombre`, `contacto_emergencia_telefono`. Las lesiones se muestran al staff en la lista de anotadas de cada turno. `estado_cuenta`: `prueba` \| `al_dia` \| `pendiente` — lo cambia el staff a mano desde **Clientes**, nunca la propia alumna. `deslinde_aceptado_en` / `deslinde_pdf_subido`: ver más abajo. |
| `plantillas_turno` | Turno fijo semanal (día, hora, cupo, instructor). |
| `turnos` | Turno concreto en una fecha. Se crea a mano o generado desde una plantilla. |
| `reservas` | 1 fila por (turno, alumno). `estado`: `reservada` \| `lista_espera` \| `cancelada`. `asistencia`: `asistio` \| `ausente` \| null (se carga después de la clase, la pone el staff). |
| `observaciones_clientes` | Notas internas con fecha sobre cada alumna, las carga el staff desde **Clientes → Ver ficha y observaciones**. Tabla aparte (no una columna de `perfiles`) y con acceso solo para staff: la alumna puede leer su propio perfil, pero nunca ve estas notas. |

Funciones: `reservar_turno`, `cancelar_reserva`, `listar_turnos` (alumno), `generar_turnos` (staff), `estadisticas` (staff — ocupación, ausentismo y ranking de faltas de los últimos 30 días).

## Clientes y estado de cuenta

Pestaña **Clientes** (staff): lista todas las alumnas registradas, con su nivel, teléfono, fecha de alta y **estado de cuenta** (`Prueba` / `Al día` / `Debe`), que el staff cambia a mano con tres botones. Toda alumna nueva arranca en `Prueba` — no hay cobro ni vencimiento automático, es un criterio que aplica el staff.

**Regla de reserva ligada al estado de cuenta** (la aplica `reservar_turno` en el servidor, no se puede saltear desde el navegador):

- `Prueba`: la **primera** reserva (la que sea) es gratis. De la segunda en adelante, se bloquea y le aparece una ventana pidiendo que abone.
- `Debe`: siempre bloqueada, misma ventana.
- `Al día`: reserva turnos **hasta la fecha en que vence su abono** (por defecto, el fin del mes en que se la marcó). Un turno posterior a esa fecha le muestra el cartel de pago. En los turnos que vienen de un turno fijo, además de "Reservar" ve **"Reservar los N lunes de octubre"**: la anota de una vez en todos los del mismo horario y mes que tengan lugar y entren en su abono (`reservar_serie`). Si alguno está completo o queda fuera del abono, la anota en el resto y le avisa cuáles se saltearon (no la pone en lista de espera).

El staff pasa a una alumna a `Al día` desde **Clientes** cuando confirma que pagó el mes. **El abono no se renueva solo**: cuando vence hay que volver a confirmar el pago (tocando "Al día" otra vez, o "+1 mes" para sumar el mes siguiente) y, si ya venció y nadie lo renovó, queda como "Venció el dd/mm" y se bloquean las reservas nuevas sin necesidad de marcarla "Debe". Si deja de pagar antes, se la pasa a `Debe`.

**Cargar un pago a mano y editar los datos (staff, en la ficha de Clientes):**

- **+ Cargar un pago** (en "Historial de pagos"): se elige la **fecha real** del pago (puede ser de días atrás; el pago cuenta en ese mes en Cobros), **qué pagó** (mes completo, clase suelta u otro), el monto (con atajos de los precios), el medio, una nota, y hasta cuándo cubre. Con la casilla "Dejarla al día" también la deja al día hasta esa fecha; destildada, el pago solo queda en el historial y su estado no cambia (sirve para anotar un cobro cualquiera). Lo hace `registrar_pago_manual`. Cada pago muestra su concepto.
- **Editar datos** (arriba de la ficha): el staff corrige o completa nombre, apellido, DNI, celular, nivel, fecha de nacimiento, objetivo, experiencia previa, lesiones, contacto de emergencia y la foto, por ejemplo de una alumna que no usa la app.

**Historial de pagos:** "Al día" y "+1 mes" ya no cambian el estado directo: abren un panel para confirmar el cobro (monto, con atajos de los precios de `config/precios.ts`; medio: transferencia, Mercado Pago, efectivo u otro; y una nota). Queda guardado en `pagos_clientes` y se ve en **la ficha de la alumna → Historial de pagos**, donde también se puede borrar un registro cargado por error (no cambia su estado). Lo ve solo el staff. `registrar_pago` hace las dos cosas de una vez en la base.

**Clase de prueba, una sola vez:** la primera reserva es gratis y muestra un aviso ("esta es tu clase de prueba; para reservar la siguiente hay que abonar la cuota o avisar en administración", con el mail de `config/pagos.ts`); el turno queda con la etiqueta "Clase de prueba". Cancelarla **no** devuelve la clase gratis (la base recuerda `cancelada_por_alumna`), salvo que el turno lo haya cancelado el estudio o se anote de nuevo en ese mismo turno.

**Pantallas de inicio del estudio:** el staff y las profesoras abren en **Hoy** (las clases del día, con anotadas, lesiones, quién viene de prueba y —solo el staff— quién debe o tiene el abono vencido) y tienen **Semana**, una grilla de la semana con colores según el lugar que queda (verde con lugar, amarillo casi lleno, rojo completo). La profesora ve el detalle de sus clases y solo el conteo de las demás.

**Comprobantes de pago:** en el cartel de pago (y en el aviso de abono vencido) la alumna tiene "Ya pagué: subir comprobante": manda la foto o el PDF de su transferencia (las fotos se achican solas; máximo 5 MB, bucket privado `comprobantes`). En **Clientes** aparece arriba "Pagos para confirmar", con la cantidad también en la pestaña: el staff abre el comprobante, y **Aprobar** abre el panel de registrar pago (la deja al día y guarda el cobro en el historial) o **Rechazar**. La alumna ve "el estudio lo está revisando" mientras tenga uno pendiente. Tope de 5 pendientes por alumna.

**Ficha completa de la alumna:** desde "Mis datos" cada alumna puede cargar, además de nombre, celular, nivel, lesiones y contacto de emergencia, su **fecha de nacimiento**, **qué quiere lograr**, su **experiencia previa**, una **foto (opcional)** y **documentos** (certificado médico, estudios u otros; foto o PDF, hasta 8 MB y 20 por alumna). La foto y los documentos van a un bucket privado (`fichas`); todo se ve con links temporales. Lo ven ella, el staff y las profesoras (igual que sus lesiones); el staff también puede subir y borrar documentos desde su ficha en Clientes, y las profesoras solo los miran. Las nuevas columnas de `perfiles` y la tabla `documentos_alumnas` están en `supabase/schema.sql`. Si en algún momento los documentos médicos deben ser solo del staff, se cambia en la política `documentos_ver` y en `fichas_ver_objeto`.

**Mi cuenta (alumna):** el botón "Mi cuenta" del encabezado muestra cómo está su abono (hasta cuándo cubre), cuántas clases asistió y faltó, sus últimas clases y sus pagos registrados (sin las notas internas del estudio). Sale de las funciones `mi_historial` y `mis_pagos`, que solo devuelven lo suyo.

**Copia de seguridad:** en **Administración → Respaldo** el staff baja los datos a archivos para Excel (personas con su mail, turnos, reservas, anotadas sin registrar, pagos, observaciones y turnos fijos), uno por uno o todos juntos. Conviene hacerlo cada tanto y guardar los archivos fuera de la app. Los mails salen por `respaldo_perfiles`, que solo funciona para el staff.

**Informe por profesora y Excel:** en la pestaña **Profesores**, "Informe del mes" muestra por profesora las clases ya dadas, anotadas, asistieron, faltaron y sin marcar (incluye a las "sin registrar"; no cuenta turnos cancelados ni los que no empezaron), con selector de mes y descarga para Excel. **Clientes** también tiene "Descargar para Excel" (respeta el filtro y la búsqueda). Los archivos son CSV con `;` y acentos correctos, que Excel en español abre directo.

**Cartel de "versión de prueba":** una franja finita arriba de toda la app invita a dejar sugerencias. El botón abre WhatsApp si cargás el número en `src/config/feedback.ts` (`WHATSAPP_FEEDBACK`); mientras esté vacío, manda un mail a la dirección de administración. Se puede cerrar y vuelve en la próxima visita.

**Lista de espera:** cuando se libera un lugar (cancela una alumna, o el staff o la profesora sacan a alguien, o se borra una "sin registrar"), la base sube sola a la primera en espera (trigger `promover_lista_espera`) y, al abrir la app, ella ve "¡Se liberó un lugar! Ya quedaste anotada en…" una sola vez.

**WhatsApp con un toque:** en cada alumna de **Clientes** y en cada anotada de la agenda hay un botón "WhatsApp" que abre el chat con el mensaje ya escrito (sin ninguna API: se arma un link `wa.me`, convirtiendo el celular al formato argentino `549…`, ver `src/whatsapp.ts`). En Clientes el mensaje se adapta: si el abono venció o debe, es un aviso de cobro con el link de Mercado Pago y el alias que haya en `config/pagos.ts`; si no, un saludo. La profesora lo ve con un saludo simple.

**Personas "sin registrar":** si después se registran con el **mismo mail o el mismo celular** (últimos 8 dígitos) con el que las anotó una profesora, sus turnos ya cargados pasan solos a su cuenta, con la asistencia que tuvieran. Si se las anotó solo con el nombre, desde la agenda se las pasa a mano con **"Vincular a una cuenta"**.

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

## Recordatorios por mail (2 horas antes)

**El código está listo; falta conectar la API de Brevo (pasos de abajo).** Cada 10 minutos una tarea programada le pide a la base los turnos que empiezan en las próximas 2 horas (hora argentina) y manda un mail a cada alumna anotada y a las "sin registrar" que tengan mail cargado. Una sola vez por reserva (queda marcado en `recordatorio_enviado_en`), y no avisa a quien reservó dentro de esas 2 horas.

Piezas: las funciones `recordatorios_pendientes` y `marcar_recordatorios` de `supabase/schema.sql` (solo las puede usar la clave de servicio) y la Edge Function [`supabase/functions/enviar-recordatorios/index.ts`](supabase/functions/enviar-recordatorios/index.ts).

### Conectarlo

1. **API key de Brevo**: Brevo → *SMTP & API → API Keys → Generate a new API key* (es distinta de la clave SMTP). Copiala.
2. **Secretos**: Supabase → *Edge Functions → Secrets* → agregá `BREVO_API_KEY` (la clave del paso 1) y `CRON_SECRET` (un texto largo cualquiera que inventes). Opcional: `MAIL_REMITENTE` si el remitente verificado en Brevo no es `fortevastudio@gmail.com`.
3. **Publicar la función**: Supabase → *Edge Functions → Deploy a new function → Via Editor*, nombre `enviar-recordatorios`, pegá el contenido de `index.ts` y *Deploy*.
4. **Probar sin mandar nada**: en la pestaña *Test* de la función, método POST, encabezado `x-cron-secret` con tu secreto y cuerpo `{"prueba": true}`. Devuelve quién recibiría un mail ahora.
5. **Programarla** (SQL Editor, reemplazando los dos valores entre `<>`):

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'recordatorios-turnos',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://<ID-DEL-PROYECTO>.supabase.co/functions/v1/enviar-recordatorios',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <ANON-KEY-DEL-PROYECTO>',
      'x-cron-secret', '<EL-MISMO-CRON_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Para apagarla del todo: `select cron.unschedule('recordatorios-turnos');`.

**Otros avisos por mail (misma función y misma tarea de cada 10 minutos):**

- **Abono por vencer:** a la alumna "al día" cuyo abono vence en los próximos 3 días, una sola vez por vencimiento (`aviso_vencimiento_para`). Trae los datos de pago y un botón al turnero.
- **Subió de la lista de espera:** mail de "¡Se liberó un lugar!" a la alumna promovida (en las últimas 24 horas, a un turno que no pasó). Una sola vez (`promocion_mail_enviado_en`).
- **Deslinde firmado:** a la administradora (`MAIL_ADMIN`, por defecto la dirección de Vanesa), con los datos de la alumna nueva y el PDF adjunto. Solo para alumnas registradas después de la primera vez que se corrió el SQL de estos avisos (`configuracion.avisos_desde`), para no mandar los deslindes viejos.

Las funciones SQL son `avisos_vencimiento_pendientes`, `avisos_promocion_pendientes`, `deslindes_pendientes` y `marcar_avisos` (solo clave de servicio). Cada tipo se pide por separado: si uno falla, los demás siguen. Con el cuerpo `{"prueba": true}` la función lista quién recibiría cada uno sin mandar nada. Los datos de pago del mail de vencimiento salen de los secretos opcionales `LINK_MERCADO_PAGO`, `ALIAS_TRANSFERENCIA` y `TITULAR_TRANSFERENCIA` (por defecto, los mismos de `src/config/pagos.ts`; si cambiás uno, cambiá el otro).

**Cobros del mes:** en **Administración → Cobros** se ve lo cobrado por mes (total, cantidad de pagos y de alumnas, por medio de pago y el detalle), con selector de mes y descarga para Excel. Sale del historial de pagos que se carga al marcar "Al día".

**Cuántas horas antes se avisa la clase:** en el mismo cuadro de **Clientes** hay tres botones, **1 hora / 2 horas / 3 horas antes** (por defecto, 2). Se guarda en `configuracion` (clave `recordatorio_horas`) y lo leen `recordatorio_horas()` y `recordatorios_pendientes()`; el mail dice la cantidad elegida. Aplica a los avisos que todavía no salieron, y sigue la regla de no avisar a quien reservó dentro de ese mismo margen. Para que el texto del mail cambie hay que tener publicada la última versión de la función (`index.ts`).

**Interruptor de emergencia:** en **Clientes**, arriba, hay un cuadro "Recordatorios por mail: activos" con el botón **Pausar** (y **Reanudar**). Pausados, la tarea sigue corriendo cada 10 minutos pero `recordatorios_pendientes` no devuelve a nadie, así que no se manda ningún mail; no hace falta tocar la función ni la tarea. El estado se guarda en la tabla `configuracion` (clave `recordatorios_activos`) y solo lo cambia el staff.

**Saludo de cumpleaños (mail):** la misma función manda un mail el día que la alumna cumple años, a partir de las 9 (hora argentina), una sola vez por año (`perfiles.aviso_cumple_anio`). Usa `avisos_cumple_pendientes` y `marcar_avisos_cumple` (solo clave de servicio) y respeta el interruptor de pausa. Además, en **Hoy** aparece la tarjeta "Cumpleaños" con quienes cumplen hoy o en los próximos 7 días y un botón **Saludar** por WhatsApp, y en la ficha se ve la etiqueta cuando falta poco.

**Para reactivar:** en **Administración → Para reactivar** (función `alumnas_para_reactivar`, solo staff) figuran las alumnas sin ninguna clase reservada que dejaron de venir hace 14/21/30/45 días, las de abono vencido hace una semana o más sin renovar, y las que se registraron y nunca tuvieron una clase. Cada una trae el mensaje de WhatsApp armado según el motivo; al tocarlo (o "Ya le escribí") se anota en `perfiles.reactivacion_avisada_en` con `marcar_reactivacion` y la lista la esconde 30 días. Las clases en las que faltó no cuentan como "vino".

**Recibo de pago:** cada pago del historial (ficha del cliente y "Mi cuenta" de la alumna) tiene **Recibo PDF**, y en el celular también **Compartir** (menú del teléfono: WhatsApp, mail…). Lleva el número correlativo (`pagos_clientes.numero`), fecha, nombre y DNI, concepto, medio, importe y hasta cuándo cubre. Es un comprobante interno: aclara que no es factura. Se genera en el navegador con jsPDF (`src/servicios/recibo.ts`).

Para ver qué pasó en las últimas corridas, en el SQL Editor: `select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;` y `select status_code, content, created from net._http_response order by created desc limit 5;`.

Antes de activarlo en serio conviene arreglar el remitente: con un Gmail, Brevo puede reescribir el "De". Lo prolijo es una dirección del dominio (`turnos@fortevastudio.com.ar`) con sus registros DNS.

## Pendiente (fuera del MVP)

- Bonos / paquetes de clases con vencimiento (por ahora el estado de cuenta es binario: al día o debe, sin "cuántas clases le quedan").
- Cobro real con Mercado Pago (API + webhook) en vez del link manual.

**En pausa hasta tener mail propio del estudio** (dominio + cuenta en Resend/Brevo con API key — ver "Correos de confirmación de registro" más arriba). Ninguna de las tres se puede armar con lo que manda Supabase hoy, porque necesitan mandar contenido propio (adjuntos, disparadas por eventos), no solo los mails fijos de login:

- Mandar el PDF del deslinde por mail a la administradora apenas se registra una alumna (hoy se descarga a demanda desde Clientes → Ver deslinde firmado).
- Avisar **por mail** a la alumna cuando sube de la lista de espera (hoy sube sola y se entera con un aviso en pantalla al abrir la app, pero no le llega nada afuera de la app).
- Mail cuando una profesora (o el staff) suma a alguien a un turno: a la que **ya tiene cuenta**, "te agregaron a este turno"; a la que **no está registrada** (las que quedan en `reservas_invitadas`, con su mail opcional y la columna `aviso_enviado_en` lista para marcar el envío), "te agregaron a un turno en FORTEVA, no estás registrada: registrate con un click".