// Edge Function de Supabase: borra a las clientas desactivadas que llevan 6 meses sin entrar
// a la app. Se va su cuenta de acceso, sus datos, su ficha, sus documentos y sus reservas;
// sus pagos quedan en las finanzas con su nombre. Los archivos (ficha, deslinde, comprobantes)
// se borran del almacenamiento antes que la cuenta.
//
// La llama la tarea programada una vez por dia, con el encabezado x-cron-secret igual al
// secreto CRON_SECRET (el mismo que usa enviar-recordatorios). Dejala SIN "Verify JWT".
// Cuerpo opcional: {"prueba": true} solo lista a quien borraria, sin borrar nada.
//
// Nota: este archivo no usa acentos graves ni plantillas de texto a proposito, para que se
// pueda copiar y pegar en el editor de Supabase sin que se rompa.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BUCKETS = ['fichas', 'deslindes', 'comprobantes']

function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

// Borra todo lo que haya bajo la carpeta de la clienta en un bucket (con subcarpetas).
async function borrarCarpeta(admin: any, bucket: string, carpeta: string, nivel = 0): Promise<number> {
  if (nivel > 4) return 0
  const { data, error } = await admin.storage.from(bucket).list(carpeta, { limit: 1000 })
  if (error || !data) return 0
  let borrados = 0
  const archivos: string[] = []
  for (const item of data) {
    if (item.id === null || item.id === undefined) {
      borrados += await borrarCarpeta(admin, bucket, carpeta + '/' + item.name, nivel + 1)
    } else {
      archivos.push(carpeta + '/' + item.name)
    }
  }
  if (archivos.length > 0) {
    const { error: errorBorrado } = await admin.storage.from(bucket).remove(archivos)
    if (!errorBorrado) borrados += archivos.length
  }
  return borrados
}

Deno.serve(async (req) => {
  const secreto = Deno.env.get('CRON_SECRET')
  if (!secreto || req.headers.get('x-cron-secret') !== secreto) {
    return json({ error: 'No autorizado.' }, 401)
  }

  let prueba = false
  try {
    const cuerpo = await req.json()
    prueba = cuerpo && cuerpo.prueba === true
  } catch (_e) {
    prueba = false
  }

  const url = Deno.env.get('SUPABASE_URL')
  const clave = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !clave) return json({ error: 'Falta configurar el servidor.' }, 500)
  const admin = createClient(url, clave, { auth: { persistSession: false } })

  const { data: lista, error } = await admin.rpc('alumnas_a_borrar')
  if (error) return json({ error: error.message }, 500)

  const aBorrar = (lista ?? []) as { id: string; nombre: string }[]
  if (prueba) return json({ prueba: true, borraria: aBorrar })

  const borradas: string[] = []
  const fallidas: { id: string; motivo: string }[] = []
  for (const a of aBorrar) {
    try {
      const { error: errorPrep } = await admin.rpc('preparar_borrado_alumna', { p_alumna_id: a.id })
      if (errorPrep) throw new Error(errorPrep.message)
      for (const bucket of BUCKETS) await borrarCarpeta(admin, bucket, a.id)
      const { error: errorUsuario } = await admin.auth.admin.deleteUser(a.id)
      if (errorUsuario) throw new Error(errorUsuario.message)
      borradas.push(a.id)
    } catch (e) {
      fallidas.push({ id: a.id, motivo: e instanceof Error ? e.message : String(e) })
    }
  }
  return json({ borradas: borradas.length, fallidas })
})
