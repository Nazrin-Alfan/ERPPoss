/**
 * Safe, Read-Only Data Puller from Supabase Cloud
 * STRICT SAFETY RULE:
 * - Only uses HTTP GET requests.
 * - Zero mutation (NO POST, PATCH, PUT, DELETE).
 * - Saves snapshot locally into ./pulled_supabase_data/
 */

import fs from 'fs'
import path from 'path'
import https from 'https'

// 1. Read Environment Variables from JB.env
const envPath = path.resolve(process.cwd(), 'JB.env')
if (!fs.existsSync(envPath)) {
  console.error('Error: JB.env file not found.')
  process.exit(1)
}

const envContent = fs.readFileSync(envPath, 'utf8')
const env = {}
envContent.split('\n').forEach(line => {
  const [k, ...v] = line.split('=')
  if (k && v.length) {
    env[k.trim()] = v.join('=').trim().replace(/^['"]|['"]$/g, '')
  }
})

const supabaseUrl = env.VITE_SUPABASE_URL
const anonKey = env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !anonKey) {
  console.error('Error: Supabase URL or Anon Key missing in JB.env')
  process.exit(1)
}

const TARGET_TABLES = [
  'struk',
  'carwash',
  'cafe',
  'cashflow',
  'pengeluaran',
  'stok_barang',
  'daftar_harga_menu',
  'resep',
  'karyawan_cuci',
  'kasir',
  'metode_bayar',
  'diskon',
  'pos_balances',
  'barang_masuk',
  'barang_keluar',
  'profiles'
]

const OUTPUT_DIR = path.resolve(process.cwd(), 'pulled_supabase_data')
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
}

function fetchBatch(table, offset, limit) {
  return new Promise((resolve, reject) => {
    const from = offset
    const to = offset + limit - 1
    const targetUrl = `${supabaseUrl}/rest/v1/${table}?select=*`

    const options = {
      method: 'GET', // STRICT: READ ONLY
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
        'Range-Unit': 'items',
        'Range': `${from}-${to}`,
        'Prefer': 'count=exact'
      }
    }

    const req = https.request(targetUrl, options, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(data)
            const contentRange = res.headers['content-range'] || ''
            const total = contentRange.includes('/') ? parseInt(contentRange.split('/')[1], 10) : parsed.length
            resolve({ data: parsed, total, statusCode: res.statusCode })
          } catch (err) {
            reject(new Error(`Failed to parse JSON response for table ${table}: ${err.message}`))
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode} for ${table}: ${data}`))
        }
      })
    })

    req.on('error', reject)
    req.setTimeout(15000, () => {
      req.abort()
      reject(new Error(`Timeout fetching ${table} range ${from}-${to}`))
    })
    req.end()
  })
}

async function pullTable(table) {
  process.stdout.write(`Fetching table [${table}] (READ-ONLY)... `)
  let offset = 0
  const limit = 1000
  let allRecords = []
  let totalReported = 0

  while (true) {
    const res = await fetchBatch(table, offset, limit)
    totalReported = res.total || 0
    allRecords = allRecords.concat(res.data)

    if (res.data.length < limit || allRecords.length >= totalReported) {
      break
    }
    offset += limit
  }

  const outPath = path.join(OUTPUT_DIR, `${table}.json`)
  fs.writeFileSync(outPath, JSON.stringify(allRecords, null, 2), 'utf8')
  console.log(`✓ DONE (${allRecords.length} records saved)`)
  return { table, count: allRecords.length }
}

async function main() {
  console.log('=================================================================')
  console.log('  STARTING READ-ONLY DATA PULL FROM SUPABASE CLOUD')
  console.log('  Security Invariant: 100% GET requests, ZERO write operations')
  console.log('=================================================================')

  const summary = []
  for (const t of TARGET_TABLES) {
    try {
      const res = await pullTable(t)
      summary.push(res)
    } catch (e) {
      console.error(`✗ ERROR on table ${t}:`, e.message)
      summary.push({ table: t, count: 0, error: e.message })
    }
  }

  const metaPath = path.join(OUTPUT_DIR, 'snapshot_meta.json')
  const meta = {
    pulled_at: new Date().toISOString(),
    source_url: supabaseUrl.replace(/https?:\/\/([^.]+).*/, 'https://$1...'),
    tables: summary
  }
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8')

  console.log('=================================================================')
  console.log('  DATA PULL COMPLETED SUCCESSFULLY')
  console.log(`  All data saved to: ${OUTPUT_DIR}`)
  console.log('=================================================================')
}

main().catch(err => {
  console.error('Fatal error during pull:', err)
  process.exit(1)
})
