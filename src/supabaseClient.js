/**
 * Supabase Client (Local Offline / SaaS ERP Adapter)
 * 100% offline persistence, multi-tenant ready, zero cloud dependencies.
 */
import { localSupabase } from './services/localDbEngine'

export const supabase = localSupabase
export default supabase
