/**
 * Supabase Client (Dual-Mode: Cloud PostgreSQL vs Local Offline Sandbox)
 * - Cloud: Menggunakan @supabase/supabase-js resmi dengan Row-Level Security (RLS).
 * - Local: Menggunakan In-Memory / LocalStorage engine untuk demo aman tanpa network.
 */
import { createClient } from '@supabase/supabase-js'

const envUrl = import.meta.env?.VITE_SUPABASE_URL || ''
const envAnonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY || ''
const defaultProvider = import.meta.env?.PROD ? 'cloud' : 'local'
const provider = (import.meta.env.VITE_BACKEND_PROVIDER || defaultProvider).toLowerCase()

const hasCloudConfig = Boolean(envUrl && envAnonKey && envUrl.startsWith('http'))
export const isCloudBackend = provider === 'cloud' && hasCloudConfig

let clientInstance = null

if (provider === 'cloud') {
  if (!hasCloudConfig) {
    throw new Error(
      'Konfigurasi Supabase Cloud (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) wajib diisi saat VITE_BACKEND_PROVIDER=cloud.'
    )
  }
  clientInstance = createClient(envUrl, envAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
  console.info('⚡ RelayPOS tersambung ke Supabase Cloud Backend:', envUrl)
} else {
  const { localSupabase } = await import('./services/localDbEngine')
  clientInstance = localSupabase
}

export const supabase = clientInstance
export default supabase
