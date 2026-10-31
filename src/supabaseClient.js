/** Explicit local sandbox or fail-closed Supabase cloud client. */
import { createClient } from '@supabase/supabase-js'
import { localSupabase } from './services/localDbEngine'
import { resolveBackendConfig, initializeBackendClient } from './config/backendConfig.js'

const config = resolveBackendConfig(import.meta.env, { production: import.meta.env.PROD || ['staging', 'production'].includes(import.meta.env.MODE) })
export const isCloudBackend = config.provider === 'cloud'
export const supabase = initializeBackendClient(config, {
  localClient: localSupabase,
  createCloudClient: createClient,
})
export default supabase
