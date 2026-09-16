import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase =
  supabaseUrl && supabaseAnonKey && supabaseUrl !== 'https://your-project.supabase.co'
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null
