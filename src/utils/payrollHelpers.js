import { calculateCarwashWorkerWage } from './staffHelpers.js'

const PAYROLL_CATEGORY_KEYWORDS = [
  'casbon',
  'kasbon',
  'gaji',
  'upah',
  'payroll',
  'komisi',
  'pinjaman',
]

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isUuid(val) {
  return typeof val === 'string' && UUID_REGEX.test(val)
}

/**
 * Returns true only when an expense/cashflow category or jenis relates to
 * employee payroll, kasbon, or commission advances.
 */
export function isPayrollDeductionCategory(kategori, jenis) {
  const combined = `${kategori || ''} ${jenis || ''}`.toLowerCase()
  return PAYROLL_CATEGORY_KEYWORDS.some((kw) => combined.includes(kw))
}

function getWorkerAliases(name) {
  const n = (name || '').toUpperCase().trim()
  if (!n) return []
  const list = [n]
  if (n.includes('Y')) list.push(n.replace(/Y/g, 'I'))
  if (n.includes('I')) list.push(n.replace(/I/g, 'Y'))
  if (n.includes('P')) list.push(n.replace(/P/g, 'V'))
  if (n.includes('V')) list.push(n.replace(/V/g, 'P'))
  return Array.from(new Set(list))
}

function findExactWordMatchIndex(descText, workerName) {
  const clean = (workerName || '').toUpperCase().trim()
  if (!clean) return -1
  const desc = String(descText || '').toUpperCase()
  const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`(^|[^A-Z0-9])${escaped}([^A-Z0-9]|$)`).exec(desc)
  return match ? match.index + (match[1] ? match[1].length : 0) : -1
}

/**
 * Matches worker name (plus Y/I and P/V typo aliases) on non-alphanumeric word
 * boundaries so short names do not match substrings inside unrelated words.
 */
export function isWorkerNameMatch(descText, workerName) {
  const desc = String(descText || '').toUpperCase()
  const aliases = getWorkerAliases(workerName)
  return aliases.some((alias) => {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(^|[^A-Z0-9])${escaped}([^A-Z0-9]|$)`).test(desc)
  })
}

/**
 * Resolves at most ONE target carwash worker key for a deduction/payout row.
 * Prioritizes explicit `karyawan_id` (UUID) first so renames, colliding typos
 * (Y<->I, P<->V), or edited payout notes never lose or double-deduct money.
 */
export function resolvePayrollDeductionTarget({ row, workersById = new Map(), workersList = [] }) {
  if (!row) return null

  // 1. Explicit UUID relation wins unconditionally.
  if (row.karyawan_id) {
    const byId = workersById.get(row.karyawan_id)
    if (byId) return byId.key
    // Valid UUID belonging to a non-carwash employee (e.g., office staff): never fall back to text matching!
    if (isUuid(row.karyawan_id)) return null
  }

  // 2. Legacy fallback for historical rows missing `karyawan_id`: category must be payroll-related.
  if (!isPayrollDeductionCategory(row.kategori, row.jenis)) return null

  const desc = String(row.nama_pengeluaran || row.keterangan_transaksi || '').toUpperCase()
  const katText = String(row.kategori || '').toUpperCase()

  // Pass A: Exact word-boundary match (no fuzzy Y/I or P/V alias swaps), disambiguating multiple hits.
  const exactMatches = []
  workersList.forEach((w) => {
    const idx = findExactWordMatchIndex(desc, w.name)
    if (idx !== -1) {
      const katIdx = findExactWordMatchIndex(katText, w.name)
      exactMatches.push({ key: w.key, idx, katIdx })
    }
  })

  if (exactMatches.length === 1) return exactMatches[0].key
  if (exactMatches.length > 1) {
    const katMatch = exactMatches.find((m) => m.katIdx !== -1)
    if (katMatch) return katMatch.key
    exactMatches.sort((a, b) => a.idx - b.idx)
    return exactMatches[0].key
  }

  // Pass B: Legacy Y/I and P/V typo alias fallback, returning at most ONE match to avoid double deduction.
  const aliasKatMatch = workersList.find((w) => isWorkerNameMatch(katText, w.name))
  if (aliasKatMatch) return aliasKatMatch.key

  const aliasDescMatch = workersList.find((w) => isWorkerNameMatch(desc, w.name))
  return aliasDescMatch ? aliasDescMatch.key : null
}

/**
 * Aggregates carwash commissions, kasbon deductions, and salary payouts per worker
 * using `karyawan_cuci.id` / `anggota_*_id` / `karyawan_id` first, with safe legacy fallback.
 */
export function aggregateCarwashWages({
  karyawanCuciList = [],
  carwashWagesList = [],
  pengeluaranList = [],
  cashflowList = [],
}) {
  const summary = {}
  const workersById = new Map()
  const workersByName = new Map()
  const workersList = []

  const ensureWorkerBucket = ({ id = null, name = '' }) => {
    const cleanName = String(name || '').toUpperCase().trim()
    if (id && workersById.has(id)) return workersById.get(id)
    if (cleanName && workersByName.has(cleanName)) return workersByName.get(cleanName)

    const key = id || `name:${cleanName}`
    if (!summary[key]) {
      summary[key] = {
        key,
        id: id || null,
        name: cleanName || 'TANPA NAMA',
        totalCars: 0,
        totalWage: 0,
        totalWithdrawals: 0,
        netWage: 0,
        details: [],
        withdrawalsList: [],
      }
      workersList.push(summary[key])
      if (id) workersById.set(id, summary[key])
      if (cleanName && !workersByName.has(cleanName)) {
        workersByName.set(cleanName, summary[key])
      }
    }
    return summary[key]
  }

  ;(karyawanCuciList || []).forEach((k) => {
    ensureWorkerBucket({ id: k.id || null, name: k.nama })
  })

  // 1. Gross carwash commission per completed/non-cancelled wash
  ;(carwashWagesList || []).forEach((item) => {
    let hargaCuci = parseFloat(item.harga_cuci) || 0
    let hargaPaket = parseFloat(item.harga_paket) || 0

    if (hargaCuci === 0 && hargaPaket === 0) {
      if (!item.paket || item.paket.trim() === '') {
        hargaCuci = parseFloat(item.harga) || 0
      } else {
        const size = item.ukuran || 'Large'
        const variant = item.variant || 'Regular'
        const basicWashPrices = {
          Small: { Regular: 50000, 'Body only': 35000 },
          Medium: { Regular: 55000, 'Body only': 40000 },
          Large: { Regular: 60000, 'Body only': 45000 },
          'Extra Large': { Regular: 80000, 'Body only': 80000 },
          Custom: { Regular: 80000, 'Body only': 80000 },
        }
        const basicSize = basicWashPrices[size] ? size : 'Large'
        const basicVar = variant === 'Body only' ? 'Body only' : 'Regular'
        hargaCuci = basicWashPrices[basicSize][basicVar]
        hargaPaket = Math.max(0, (parseFloat(item.harga) || 0) - hargaCuci)
      }
    }

    const w1Name = item.anggota_1 ? item.anggota_1.trim().toUpperCase() : ''
    const w2Name = item.anggota_2 ? item.anggota_2.trim().toUpperCase() : ''
    const w1Bucket = (item.anggota_1_id || w1Name)
      ? ensureWorkerBucket({ id: item.anggota_1_id || null, name: w1Name })
      : null
    const w2Bucket = (item.anggota_2_id || w2Name)
      ? ensureWorkerBucket({ id: item.anggota_2_id || null, name: w2Name })
      : null

    const isSplit = Boolean(w2Bucket && (!w1Bucket || w2Bucket.key !== w1Bucket.key))
    const { totalSharePerPerson: share } = calculateCarwashWorkerWage({
      hargaCuci,
      hargaPaket,
      isSplit,
    })

    const buildJobDetail = () => ({
      id: item.id || item.id_transaksi,
      tanggal: item.tanggal,
      jam: item.jam,
      created_at: item.created_at,
      platNomor: item.plat || item.plat_nomor,
      paket: item.paket || item.layanan,
      variant: item.variant,
      ukuran: item.ukuran,
      totalHarga: item.harga,
      shareWage: share,
      split: isSplit ? 'Split 50%' : 'Solo 100%',
      rawItem: item,
    })

    if (w1Bucket) {
      w1Bucket.totalCars += 1
      w1Bucket.totalWage += share
      w1Bucket.details.push(buildJobDetail())
    }

    if (isSplit && w2Bucket) {
      w2Bucket.totalCars += 1
      w2Bucket.totalWage += share
      w2Bucket.details.push(buildJobDetail())
    }
  })

  // 2. Pengeluaran deductions (cashier withdrawals / kasbon)
  const processedExpIds = new Set()
  ;(pengeluaranList || []).forEach((exp) => {
    const amt = parseFloat(exp.nominal) || 0
    if (amt <= 0) return

    const targetKey = resolvePayrollDeductionTarget({ row: exp, workersById, workersList })
    if (targetKey && summary[targetKey]) {
      if (exp.id_pengeluaran) processedExpIds.add(exp.id_pengeluaran)
      if (exp.id) processedExpIds.add(exp.id)
      summary[targetKey].totalWithdrawals += amt
      summary[targetKey].withdrawalsList.push({
        id: exp.id || exp.id_pengeluaran,
        tanggal: exp.tanggal,
        keterangan: exp.nama_pengeluaran,
        nominal: amt,
        pos: 'SALDO CASH (Laci Kasir)',
      })
    }
  })

  // 3. Cashflow deductions & salary payouts (skip already-processed expenses)
  ;(cashflowList || []).forEach((cf) => {
    if (cf.id_sumber && processedExpIds.has(cf.id_sumber)) return
    const amt = parseFloat(cf.pengeluaran) || 0
    if (amt <= 0) return

    const targetKey = resolvePayrollDeductionTarget({ row: cf, workersById, workersList })
    if (targetKey && summary[targetKey]) {
      summary[targetKey].totalWithdrawals += amt
      summary[targetKey].withdrawalsList.push({
        id: cf.id || cf.id_cashflow,
        tanggal: cf.tanggal,
        keterangan: cf.keterangan_transaksi,
        nominal: amt,
        pos: cf.pos,
      })
    }
  })

  // 4. Net wages
  Object.keys(summary).forEach((k) => {
    summary[k].netWage = summary[k].totalWage - summary[k].totalWithdrawals
  })

  return Object.values(summary).sort((a, b) => b.totalWage - a.totalWage)
}
