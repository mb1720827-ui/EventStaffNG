import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase =
  supabaseUrl && supabaseAnonKey && supabaseUrl !== 'https://your-project.supabase.co'
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null

export const uploadFile = supabase
  ? async (bucket, path, file) => {
      const { error, data } = await supabase.storage.from(bucket).upload(path, file, { upsert: true })
      return { data, error }
    }
  : async () => ({ data: null, error: { message: 'Supabase is not configured.' } })

export const publicUrl = supabase
  ? (bucket, path) => {
      const { data } = supabase.storage.from(bucket).getPublicUrl(path)
      return data?.publicUrl || ''
    }
  : () => ''
