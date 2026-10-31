/** Shared browser/build configuration policy. Never include supplied values in errors. */
export function resolveBackendConfig(env = {}, { production = false } = {}) {
  const provider = String(env.VITE_BACKEND_PROVIDER || (production ? 'cloud' : 'local')).trim().toLowerCase()
  if (!['cloud', 'local'].includes(provider)) {
    throw new Error('VITE_BACKEND_PROVIDER harus cloud atau local.')
  }
  const allowLocalSandbox = env.VITE_ALLOW_LOCAL_SANDBOX === 'true'
  if (provider === 'local') {
    if (production && !allowLocalSandbox) {
      throw new Error('Build lokal hanya untuk sandbox: set VITE_ALLOW_LOCAL_SANDBOX=true secara eksplisit, atau gunakan backend cloud.')
    }
    return { provider, allowLocalSandbox, url: '', key: '' }
  }

  const url = String(env.VITE_SUPABASE_URL || '').trim()
  const key = String(env.VITE_SUPABASE_ANON_KEY || '').trim()
  if (!url) throw new Error('VITE_SUPABASE_URL wajib diisi untuk backend cloud.')
  if (!key) throw new Error('VITE_SUPABASE_ANON_KEY wajib diisi dengan publishable key atau anon key untuk backend cloud.')
  let parsed
  try { parsed = new URL(url) } catch { throw new Error('VITE_SUPABASE_URL tidak valid.') }
  if (parsed.username || parsed.password || parsed.search || parsed.hash || (parsed.pathname && parsed.pathname !== '/')) {
    throw new Error('VITE_SUPABASE_URL harus berupa origin proyek, tanpa kredensial, path, atau query.')
  }
  if (parsed.hostname === 'your-project.supabase.co' || parsed.hostname === 'example.com') {
    throw new Error('VITE_SUPABASE_URL masih placeholder; gunakan proyek staging/produksi yang benar.')
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback && !production)) {
    throw new Error('VITE_SUPABASE_URL wajib HTTPS; HTTP loopback hanya diizinkan saat development.')
  }

  // Only public browser credentials belong in VITE_* variables. This checks key
  // type, not its signature/authorization; the real service must validate those.
  let publicKey = /^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(key)
  if (!publicKey && !key.startsWith('sb_secret_')) {
    try {
      const parts = key.split('.')
      if (parts.length === 3) {
        const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
        const claims = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')))
        publicKey = claims.role === 'anon'
      }
    } catch { /* Do not expose key contents or decoder errors. */ }
  }
  if (!publicKey) {
    throw new Error('VITE_SUPABASE_ANON_KEY harus publishable key atau JWT anon; placeholder, secret key dan service-role key dilarang pada frontend.')
  }
  return { provider, allowLocalSandbox, url: parsed.origin, key }
}

export function initializeBackendClient(config, { localClient, createCloudClient }) {
  if (config.provider === 'local') return localClient
  try {
    return createCloudClient(config.url, config.key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  } catch {
    // A broken cloud setup must never authenticate the user as a demo Owner.
    throw new Error('Gagal inisialisasi backend cloud. Periksa konfigurasi Supabase; fallback sandbox dinonaktifkan.')
  }
}
