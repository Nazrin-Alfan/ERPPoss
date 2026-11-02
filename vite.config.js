import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  // 1. Muat env standar Vite (.env, .env.local, .env.[mode])
  const env = loadEnv(mode, process.cwd(), '')

  // 2. Fallback parsing jika pengguna masih memiliki JB.env / JB_dev.env lokal
  const fallbackEnv = {}
  const devEnvPath = path.resolve(__dirname, 'JB_dev.env')
  const prodEnvPath = path.resolve(__dirname, 'JB.env')
  const envPath = fs.existsSync(devEnvPath) ? devEnvPath : prodEnvPath

  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8')
    envContent.split('\n').forEach((line) => {
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

  const supabaseUrl = env.VITE_SUPABASE_URL || fallbackEnv.VITE_SUPABASE_URL || ''
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || fallbackEnv.VITE_SUPABASE_ANON_KEY || ''
  const backendProvider = env.VITE_BACKEND_PROVIDER || fallbackEnv.VITE_BACKEND_PROVIDER || 'local'

  // Metadata build dinamis dari git commit & timestamp ISO
  let gitCommit = 'dev'
  try {
    gitCommit = execSync('git rev-parse --short HEAD').toString().trim()
  } catch (e) {
    gitCommit = process.env.CF_PAGES_COMMIT_SHA?.slice(0, 7) || 'latest'
  }
  const buildTime = new Date().toISOString()

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
      'import.meta.env.VITE_BACKEND_PROVIDER': JSON.stringify(backendProvider),
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
      'import.meta.env.VITE_BUILD_COMMIT': JSON.stringify(gitCommit),
      'import.meta.env.VITE_BUILD_TIME': JSON.stringify(buildTime),
    },
  }
})
