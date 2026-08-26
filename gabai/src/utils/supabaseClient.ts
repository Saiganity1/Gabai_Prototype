import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-supabase-project.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-supabase-anon-key'

export const isSupabaseConfigured = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
)

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
})

/**
 * Upload disaster report photo directly to Supabase Storage Bucket ('disaster-reports')
 */
export async function uploadReportPhoto(file: File | Blob, filename?: string): Promise<string | null> {
  if (!isSupabaseConfigured) return null

  try {
    const ext = file.type.split('/')[1] || 'jpg'
    const name = filename || `report_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`
    const path = `photos/${name}`

    const { data, error } = await supabase.storage
      .from('disaster-reports')
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      })

    if (error) {
      console.warn('Supabase storage upload error:', error.message)
      return null
    }

    const { data: publicUrlData } = supabase.storage
      .from('disaster-reports')
      .getPublicUrl(data.path)

    return publicUrlData.publicUrl
  } catch (err) {
    console.warn('Failed to upload photo to Supabase storage:', err)
    return null
  }
}
