import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Parsing manual berkas JB.env / JB_dev.env
const customEnv = {}
const devEnvPath = path.resolve(__dirname, 'JB_dev.env')
const prodEnvPath = path.resolve(__dirname, 'JB.env')

// Gunakan JB.env jika di Vercel Production atau jika JB_dev.env tidak ada
const isVercelProd = process.env.VERCEL_ENV === 'production'
const envPath = (isVercelProd || !fs.existsSync(devEnvPath)) ? prodEnvPath : devEnvPath

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8')
  envContent.split(/\r?\n/).forEach(line => {
    // Abaikan komentar dan baris kosong
    if (line.trim().startsWith('#') || !line.includes('=')) return
    const [key, ...valueParts] = line.split('=')
    const val = valueParts.join('=').trim()
    const cleanKey = key.trim()
    let cleanVal = val
    // Hapus kutip jika ada
    if ((cleanVal.startsWith('"') && cleanVal.endsWith('"')) || 
        (cleanVal.startsWith("'") && cleanVal.endsWith("'"))) {
      cleanVal = cleanVal.slice(1, -1)
    }
    if (cleanKey.startsWith('VITE_')) {
      customEnv[cleanKey] = cleanVal
    }
  })
}

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
    cors: true,
  },
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    chunkSizeWarningLimit: 8000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('realSeedData.json')) {
            return 'real-seed-database'
          }
        },
      },
    },
  },
  define: {
    // Ekspos variabel VITE_ dengan prioritas process.env (Vercel Dashboard) -> customEnv (file)
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(process.env.VITE_SUPABASE_URL || customEnv.VITE_SUPABASE_URL || ''),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY || customEnv.VITE_SUPABASE_ANON_KEY || ''),
    'import.meta.env.VITE_WACRM_API_URL': JSON.stringify(process.env.VITE_WACRM_API_URL || customEnv.VITE_WACRM_API_URL || ''),
    'import.meta.env.VITE_WACRM_API_KEY': JSON.stringify(process.env.VITE_WACRM_API_KEY || customEnv.VITE_WACRM_API_KEY || '')
  }
})


