import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // Falla temprano y claro: sin esto, los errores aparecen recién al primer
  // fetch y son confusos ("Failed to fetch").
  throw new Error(
    'Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY. Copiá .env.example a .env y completalos.',
  )
}

export const supabase = createClient(url, anonKey)
