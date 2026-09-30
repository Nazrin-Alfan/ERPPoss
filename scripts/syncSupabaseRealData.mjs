import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const SUPABASE_URL = 'https://grwvhsqxuypcdxxqshgs.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_odjleIHbLh469uJGvIls9g_l-dS8UBW'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function fetchAllRows(tableName) {
  let allData = []
  let from = 0
  const step = 1000
  while (true) {
    try {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .range(from, from + step - 1)

      if (error) {
        console.warn(`Table ${tableName} warning:`, error.message)
        break
      }
      if (!data || data.length === 0) break
      allData = allData.concat(data)
      if (data.length < step) break
      from += step
    } catch (e) {
      console.warn(`Fetch error on ${tableName}:`, e.message)
      break
    }
  }
  return allData
}

async function runSync() {
  console.log('🚀 Memulai sinkronisasi data riil dari Supabase Cloud...')
  
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
    'pos_balances',
    'barang_masuk',
    'barang_keluar',
    'profiles'
  ]

  const syncedData = {}

  for (const table of tables) {
    console.log(`Mengunduh tabel: ${table}...`)
    const rows = await fetchAllRows(table)
    syncedData[table] = rows
    console.log(`✓ ${table}: ${rows.length} baris berhasil diunduh`)
  }

  // Tambahkan / pastikan Akun Owner utama siap digunakan
  let profiles = syncedData.profiles || []
  
  // Cari apakah ada akun owner
  const ownerExists = profiles.some(p => p.email === 'owner@relaypos.com' || (p.role === 'Owner' && p.nama === 'Owner Utama'))
  if (!ownerExists) {
    profiles.unshift({
      id: 'usr_owner_real_01',
      tenant_id: 'default_tenant',
      nama: 'Owner RelayPOS (Real)',
      email: 'owner@relaypos.com',
      role: 'Owner',
      is_active: true,
      created_at: new Date().toISOString()
    })
  }

  // Tambahkan juga akun shortcut username: 'owner'
  profiles.unshift({
    id: 'usr_owner_shortcut',
    tenant_id: 'default_tenant',
    nama: 'Owner',
    email: 'owner@jb.local',
    role: 'Owner',
    is_active: true,
    created_at: new Date().toISOString()
  })

  syncedData.profiles = profiles

  const outputPath = path.resolve('src/services/realSeedData.json')
  fs.writeFileSync(outputPath, JSON.stringify(syncedData, null, 2), 'utf-8')
  console.log(`\n🎉 Seluruh data riil Supabase berhasil disimpan ke ${outputPath}`)
  console.log('Ringkasan Data Riil:')
  for (const [k, v] of Object.entries(syncedData)) {
    console.log(`- ${k}: ${Array.isArray(v) ? v.length : 0} records`)
  }
}

runSync().catch(err => {
  console.error('Gagal sinkronisasi:', err)
  process.exit(1)
})
