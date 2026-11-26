import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PAGE_FIELD_CONTRACTS, SUBCOMPONENT_FIELD_CONTRACTS } from '../../constants/pageFieldContracts'

const ROOT = process.cwd()

const SQL_COLUMN_IGNORE = new Set([
  'primary',
  'foreign',
  'unique',
  'check',
  'constraint',
  'references',
  'on',
  'default',
  'not',
  'null',
  'generated',
  'if'
])

export function extractSqlSchemaFromMigrations() {
  const migDir = path.join(ROOT, 'supabase/migrations')
  const schema = {}
  const createTables = new Set()

  const files = fs.readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort()
  for (const file of files) {
    const rawSql = fs.readFileSync(path.join(migDir, file), 'utf-8')
    const sql = rawSql.replace(/--[^\n]*/g, '')

    // CREATE TABLE blocks
    for (const m of sql.matchAll(/CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:public\.)?"?([a-zA-Z0-9_]+)"?\s*\(([\s\S]*?)\)\s*;/gi)) {
      const table = m[1].toLowerCase()
      createTables.add(table)
      if (!schema[table]) schema[table] = new Set()
      for (const line of m[2].split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || /^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)\b/i.test(trimmed)) continue
        const colMatch = trimmed.match(/^"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s+[A-Za-z]/)
        if (colMatch) {
          const col = colMatch[1].toLowerCase()
          if (!SQL_COLUMN_IGNORE.has(col)) {
            schema[table].add(col)
          }
        }
      }
    }

    // ALTER TABLE ... ADD COLUMN blocks
    for (const m of sql.matchAll(/ALTER\s+TABLE(?:\s+IF\s+EXISTS)?(?:\s+ONLY)?\s+(?:public\.)?"?([a-zA-Z0-9_]+)"?\s+([\s\S]*?);/gi)) {
      const table = m[1].toLowerCase()
      if (!schema[table]) schema[table] = new Set()
      for (const am of m[2].matchAll(/ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s+[A-Za-z]/gi)) {
        const col = am[1].toLowerCase()
        if (!SQL_COLUMN_IGNORE.has(col)) {
          schema[table].add(col)
        }
      }
    }
  }

  return { schema, createTables }
}

export function validateDbColumnMappings(dbColumnsMap, schema) {
  const missingTables = []
  const missingColumns = []

  for (const [table, cols] of Object.entries(dbColumnsMap || {})) {
    const tbl = table.toLowerCase()
    const tableCols = schema[tbl]
    if (!tableCols) {
      missingTables.push(tbl)
      continue
    }
    for (const col of cols || []) {
      const c = col.toLowerCase()
      if (!tableCols.has(c)) {
        missingColumns.push(`${tbl}.${c}`)
      }
    }
  }

  return {
    passed: missingTables.length === 0 && missingColumns.length === 0,
    missingTables,
    missingColumns
  }
}

describe('Phase 1.5: DB Schema <-> Form Payload Column Parity Guard', () => {
  const { schema, createTables } = extractSqlSchemaFromMigrations()
  const allContractsWithDb = [...PAGE_FIELD_CONTRACTS, ...SUBCOMPONENT_FIELD_CONTRACTS].filter(
    (c) => c.dbColumns && Object.keys(c.dbColumns).length > 0
  )

  it('rejects any bogus or typo column in dbColumns (negative parity guard)', () => {
    const res = validateDbColumnMappings(
      {
        struk: ['id_struk', 'non_existent_typo_col_xyz'],
        unknown_table_xyz: ['id']
      },
      schema
    )
    expect(res.passed).toBe(false)
    expect(res.missingTables).toEqual(['unknown_table_xyz'])
    expect(res.missingColumns).toEqual(['struk.non_existent_typo_col_xyz'])
  })

  it('enforces tenant_id column presence across all operational & financial SQL tables', () => {
    const tenantScopedTables = [
      'struk',
      'cafe',
      'carwash',
      'cashflow',
      'pengeluaran',
      'stok_barang',
      'resep',
      'carwash_packages',
      'daftar_harga_menu',
      'master_categories',
      'pos_balances',
      'journal_entries',
      'journal_entry_lines',
      'bank_email_connections',
      'bank_account_bindings',
      'bank_transaction_drafts',
      'branches',
      'profiles',
      'tenant_invitations'
    ]

    for (const tbl of tenantScopedTables) {
      expect(createTables.has(tbl), `${tbl} should exist in SQL CREATE TABLE migrations`).toBe(true)
      expect(schema[tbl].has('tenant_id'), `${tbl} must contain tenant_id column`).toBe(true)
    }
  })

  it.each(allContractsWithDb)('$id ($file) dbColumns match PostgreSQL migration DDL', (contract) => {
    const res = validateDbColumnMappings(contract.dbColumns, schema)
    expect(res).toEqual({
      passed: true,
      missingTables: [],
      missingColumns: []
    })
  })
})
