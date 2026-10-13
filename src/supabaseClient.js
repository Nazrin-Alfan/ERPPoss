/**
 * Supabase Client (Dual-Mode: Cloud PostgreSQL vs Local Offline Sandbox)
 * - Cloud: Menggunakan @supabase/supabase-js resmi dengan Row-Level Security (RLS).
 * - Local: Menggunakan In-Memory / LocalStorage engine untuk demo aman tanpa network.
 */
import { createClient } from '@supabase/supabase-js'
import { localSupabase } from './services/localDbEngine'

const envUrl = import.meta.env?.VITE_SUPABASE_URL || ''
const envAnonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY || ''
const provider = (import.meta.env?.VITE_BACKEND_PROVIDER || 'local').toLowerCase()

const hasCloudConfig = Boolean(envUrl && envAnonKey && envUrl.startsWith('http'))
export const isCloudBackend = provider === 'cloud' && hasCloudConfig

let clientInstance = null

if (isCloudBackend) {
  try {
    clientInstance = createClient(envUrl, envAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
    console.info('⚡ RelayPOS tersambung ke Supabase Cloud Backend:', envUrl)
  } catch (err) {
    console.warn('⚠️ Gagal inisialisasi Supabase Cloud, fallback ke Local Engine:', err.message)
    clientInstance = localSupabase
  }
} else {
  clientInstance = localSupabase
}

export const supabase = clientInstance
export default supabase
