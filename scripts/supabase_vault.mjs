#!/usr/bin/env node
/**
 * Local DPAPI-encrypted Supabase PAT vault & migration runner (Windows).
 * Stores ciphertext outside the git repo at %LOCALAPPDATA%\relaypos-vault\supabase.vault
 * using Windows DPAPI (CurrentUser scope) so tokens are never saved in plaintext.
 *
 * Usage:
 *   $env:SB_PAT="sbp_..."; node scripts/supabase_vault.mjs set
 *   node scripts/supabase_vault.mjs status
 *   node scripts/supabase_vault.mjs test [project_ref]
 *   node scripts/supabase_vault.mjs migrate <path/to/migration.sql> [project_ref]
 *   node scripts/supabase_vault.mjs clear
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline/promises'
import { execFileSync } from 'node:child_process'

const DEFAULT_PROJECT_REF = 'jutidxobdedygmjngmcq'
const VAULT_DIR = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.relaypos-vault'), 'relaypos-vault')
const VAULT_FILE = path.join(VAULT_DIR, 'supabase.vault')

function dpapiEncrypt(plaintext) {
  const out = execFileSync(
    'powershell',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '$s = ConvertTo-SecureString $env:VAULT_SECRET -AsPlainText -Force; ConvertFrom-SecureString $s',
    ],
    { env: { ...process.env, VAULT_SECRET: plaintext }, encoding: 'utf8' }
  )
  return out.trim()
}

function dpapiDecrypt(ciphertext) {
  const out = execFileSync(
    'powershell',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '$s = ConvertTo-SecureString $env:VAULT_CIPHER; $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); try { [Runtime.InteropServices.Marshal]::PtrToStringAuto($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }',
    ],
    { env: { ...process.env, VAULT_CIPHER: ciphertext }, encoding: 'utf8' }
  )
  return out.trim()
}

function loadToken() {
  if (!fs.existsSync(VAULT_FILE)) {
    throw new Error(`Vault tidak ditemukan di ${VAULT_FILE}. Jalankan: node scripts/supabase_vault.mjs set`)
  }
  const cipher = fs.readFileSync(VAULT_FILE, 'utf8').trim()
  if (!cipher) throw new Error('File vault kosong.')
  const token = dpapiDecrypt(cipher)
  if (!token.startsWith('sbp_')) throw new Error('Token di dalam vault tidak valid.')
  return token
}

function maskToken(token) {
  if (!token || token.length < 12) return '****'
  return `${token.slice(0, 8)}...${token.slice(-4)}`
}

async function runCloudSql(projectRef, sql, token) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Supabase Management API HTTP ${res.status}: ${text.slice(0, 1000)}`)
  }
  return text ? JSON.parse(text) : []
}

async function main() {
  const [cmd, arg1, arg2] = process.argv.slice(2)

  if (cmd === 'set') {
    let token = (process.env.SB_PAT || '').trim()
    if (!token) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
      token = (await rl.question('Masukkan Supabase PAT (sbp_...): ')).trim()
      rl.close()
    }
    if (!token.startsWith('sbp_')) {
      throw new Error('Format token harus diawali dengan "sbp_".')
    }
    fs.mkdirSync(VAULT_DIR, { recursive: true })
    const cipher = dpapiEncrypt(token)
    fs.writeFileSync(VAULT_FILE, `${cipher}\n`, { encoding: 'utf8', mode: 0o600 })
    console.log(`[OK] Token terenkripsi (Windows DPAPI) disimpan di: ${VAULT_FILE}`)
    console.log(`[OK] Preview token: ${maskToken(token)}`)
    return
  }

  if (cmd === 'status') {
    if (!fs.existsSync(VAULT_FILE)) {
      console.log(`[EMPTY] Vault belum dibuat (${VAULT_FILE}).`)
      return
    }
    const token = loadToken()
    console.log(`[ACTIVE] Vault terenkripsi siap dipakai: ${VAULT_FILE}`)
    console.log(`[ACTIVE] Token: ${maskToken(token)}`)
    return
  }

  if (cmd === 'test') {
    const projectRef = arg1 || DEFAULT_PROJECT_REF
    const token = loadToken()
    const rows = await runCloudSql(projectRef, 'SELECT current_database() AS db, NOW() AS server_time;', token)
    console.log(`[OK] Koneksi vault ke proyek ${projectRef} berhasil:`, JSON.stringify(rows))
    return
  }

  if (cmd === 'migrate') {
    if (!arg1) throw new Error('Path file migrasi SQL wajib diisi.')
    const sqlPath = path.resolve(arg1)
    if (!fs.existsSync(sqlPath)) throw new Error(`File tidak ditemukan: ${sqlPath}`)
    const projectRef = arg2 || DEFAULT_PROJECT_REF
    const token = loadToken()
    const sql = fs.readFileSync(sqlPath, 'utf8')

    await runCloudSql(projectRef, sql, token)
    console.log(`[OK] Migrasi ${path.basename(sqlPath)} berhasil dieksekusi di ${projectRef}.`)

    const match = path.basename(sqlPath).match(/^(\d{14})_(.+)\.sql$/)
    if (match) {
      const [, version, rawName] = match
      const safeName = rawName.replace(/'/g, "''")
      await runCloudSql(
        projectRef,
        `INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('${version}', '${safeName}') ON CONFLICT (version) DO NOTHING;`,
        token
      )
      console.log(`[OK] Versi ${version} (${rawName}) tercatat di supabase_migrations.schema_migrations.`)
    }
    return
  }

  if (cmd === 'clear') {
    if (fs.existsSync(VAULT_FILE)) {
      fs.unlinkSync(VAULT_FILE)
      console.log(`[OK] Vault dihapus: ${VAULT_FILE}`)
    } else {
      console.log('[INFO] Vault sudah kosong.')
    }
    return
  }

  console.log('Perintah tersedia: set | status | test [project_ref] | migrate <file.sql> [project_ref] | clear')
  process.exit(1)
}

main().catch((err) => {
  console.error('[ERROR]', err.message || err)
  process.exit(1)
})
