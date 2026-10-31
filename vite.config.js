import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { resolveBackendConfig } from './src/config/backendConfig.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode, command }) => {
  const protectedDeployment = command === 'build' || ['staging', 'production'].includes(mode)
  // 1. Muat env standar Vite (.env, .env.local, .env.[mode])
  const env = loadEnv(mode, process.cwd(), '')

  // 2. Fallback parsing jika pengguna masih memiliki JB.env / JB_dev.env lokal
  const fallbackEnv = {}
  const devEnvPath = path.resolve(__dirname, 'JB_dev.env')
  const prodEnvPath = path.resolve(__dirname, 'JB.env')
  const envPath = fs.existsSync(devEnvPath) ? devEnvPath : prodEnvPath

  // Legacy local files remain supported for development only.
  if (!protectedDeployment && fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8')
    envContent.split(/\r?\n/).forEach((line) => {
      if (line.trim().startsWith('#') || !line.includes('=')) return
      const [key, ...valueParts] = line.split('=')
      const val = valueParts.join('=').trim()
      const cleanKey = key.trim()
      let cleanVal = val
      if (
        (cleanVal.startsWith('"') && cleanVal.endsWith('"')) ||
        (cleanVal.startsWith("'") && cleanVal.endsWith("'"))
      ) {
        cleanVal = cleanVal.slice(1, -1)
      }
      if (cleanKey.startsWith('VITE_')) {
        fallbackEnv[cleanKey] = cleanVal
      }
    })
  }

  const backend = resolveBackendConfig({ ...fallbackEnv, ...env }, { production: protectedDeployment })

  return {
    server: {
      host: '0.0.0.0',
      port: 5173,
      cors: true,
    },
    plugins: [react(), tailwindcss()],
    build: {
      chunkSizeWarningLimit: 1500,
    },
    define: {
      'import.meta.env.VITE_BACKEND_PROVIDER': JSON.stringify(backend.provider),
      'import.meta.env.VITE_ALLOW_LOCAL_SANDBOX': JSON.stringify(backend.allowLocalSandbox ? 'true' : 'false'),
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(backend.url),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(backend.key),
    },
  }
})
