/**
 * Prepare Real Seed Data for SaaS ERP Engine
 * Reads from ./pulled_supabase_data and outputs src/services/realSeedData.json
 * with tenant_id and branch_id mapping.
 */

import fs from 'fs'
import path from 'path'

const PULLED_DIR = path.resolve(process.cwd(), 'pulled_supabase_data')
const OUTPUT_FILE = path.resolve(process.cwd(), 'src/services/realSeedData.json')

const DEFAULT_TENANT_ID = 'tenant_jb_enterprise'
const DEFAULT_BRANCH_ID = 'branch_medan_main'

const tables = [
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

const result = {}

tables.forEach(table => {
  const filePath = path.join(PULLED_DIR, `${table}.json`)
  if (fs.existsSync(filePath)) {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    result[table] = raw.map(item => ({
      ...item,
      tenant_id: item.tenant_id || DEFAULT_TENANT_ID,
      branch_id: item.branch_id || DEFAULT_BRANCH_ID
    }))
    console.log(`Mapped ${table}: ${result[table].length} records`);
  } else {
    result[table] = []
  }
})

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result), 'utf8')
console.log(`\nReal seed data written to ${OUTPUT_FILE}`);
const stat = fs.statSync(OUTPUT_FILE);
console.log(`Size: ${(stat.size / 1024 / 1024).toFixed(2)} MB`);
