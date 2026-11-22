/**
 * Rule-based Bank Mandiri Outgoing Notification Email Parser (Livin' by Mandiri & Kopra)
 * - Understands HTML table rows and colon-delimited label pairs first (never guesses via a single wild regex).
 * - Preserves null for unmentioned fields (e.g., fee_amount stays null if no admin fee line exists).
 * - Never double-adds fee when Total Debet is explicitly stated in the email.
 * - Formats all monetary amounts as exact 4-decimal strings ("352500.0000") matching Postgres NUMERIC(18,4).
 */

const MANDIRI_TRUSTED_SENDER_DOMAINS = ['bankmandiri.co.id', 'mandiri.co.id']

const MONTH_MAP = {
  jan: '01', januari: '01',
  feb: '02', februari: '02',
  mar: '03', maret: '03',
  apr: '04', april: '04',
  mei: '05', may: '05',
  jun: '06', juni: '06',
  jul: '07', juli: '07',
  agu: '08', agustus: '08', aug: '08',
  sep: '09', september: '09',
  okt: '10', oktober: '10', oct: '10',
  nov: '11', november: '11',
  des: '12', desember: '12', dec: '12',
}

export function normalizeEmailIdentity(email = '') {
  const clean = String(email || '').trim().toLowerCase()
  if (!clean.includes('@')) return clean
  const [localPart, rawDomain] = clean.split('@')
  if (rawDomain === 'gmail.com' || rawDomain === 'googlemail.com') {
    const beforePlus = localPart.split('+')[0]
    const withoutDots = beforePlus.replace(/\./g, '')
    return `${withoutDots}@gmail.com`
  }
  return `${localPart}@${rawDomain}`
}

export function isTrustedMandiriSender(fromHeader = '') {
  const clean = String(fromHeader || '').trim().toLowerCase()
  const emailMatch = clean.match(/([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i)
  const email = emailMatch ? emailMatch[1] : clean
  const domain = email.split('@')[1] || ''
  return MANDIRI_TRUSTED_SENDER_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))
}

function decodeHtmlEntities(str = '') {
  return String(str)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

function extractStructuredPairs(rawBody = '') {
  const pairs = new Map()
  const html = decodeHtmlEntities(String(rawBody || ''))

  // 1. Parse HTML table two-column rows: <tr><td>Label</td><td>Value</td></tr>
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let trMatch
  while ((trMatch = trRegex.exec(html)) !== null) {
    const rowHtml = trMatch[1]
    const cells = []
    const tdRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi
    let tdMatch
    while ((tdMatch = tdRegex.exec(rowHtml)) !== null) {
      const cellText = tdMatch[1]
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^:\s*/, '')
      if (cellText) cells.push(cellText)
    }
    if (cells.length >= 2) {
      const key = cells[0].toLowerCase().replace(/\s*:\s*$/, '').trim()
      const val = cells[cells.length - 1].trim()
      if (key && val && !pairs.has(key)) {
        pairs.set(key, val)
      }
    }
  }

  // 2. Parse line-by-line "Label : Value" from plain text / stripped HTML
  const plainLines = html
    .replace(/<\/(tr|p|div|li|br|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .split(/\r?\n/)

  for (const rawLine of plainLines) {
    const line = rawLine.replace(/\s+/g, ' ').trim()
    if (!line) continue
    const colonIdx = line.indexOf(':')
    if (colonIdx > 1 && colonIdx < 45) {
      const key = line.slice(0, colonIdx).toLowerCase().trim()
      const val = line.slice(colonIdx + 1).trim()
      if (key && val && !pairs.has(key)) {
        pairs.set(key, val)
      }
    }
  }

  const plainText = plainLines.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n')
  return { pairs, plainText }
}

function findLabelValue(pairs, candidateLabels = []) {
  for (const label of candidateLabels) {
    const target = label.toLowerCase()
    for (const [k, v] of pairs.entries()) {
      if (k === target || k.includes(target)) {
        return v
      }
    }
  }
  return null
}

/**
 * Parses Indonesian/English currency strings ("Rp 350.000,00", "IDR 125.000", "352500")
 * into exact 4-decimal string ("350000.0000") using integer BigInt arithmetic (zero float drift).
 */
export function parseIdrDecimal4(rawVal) {
  if (rawVal === null || rawVal === undefined) return null
  const str = String(rawVal).trim()
  if (!str) return null

  const cleaned = str.replace(/[^0-9.,-]/g, '').trim()
  if (!cleaned || !/\d/.test(cleaned)) return null

  let intPartStr = cleaned
  let fracPartStr = ''

  if (cleaned.includes(',') && cleaned.includes('.')) {
    const lastComma = cleaned.lastIndexOf(',')
    const lastDot = cleaned.lastIndexOf('.')
    if (lastComma > lastDot) {
      // Indonesian format: 350.000,50
      intPartStr = cleaned.slice(0, lastComma).replace(/\./g, '')
      fracPartStr = cleaned.slice(lastComma + 1)
    } else {
      // English format: 350,000.50
      intPartStr = cleaned.slice(0, lastDot).replace(/,/g, '')
      fracPartStr = cleaned.slice(lastDot + 1)
    }
  } else if (cleaned.includes(',')) {
    const parts = cleaned.split(',')
    if (parts.length === 2 && parts[1].length <= 4 && parts[1].length !== 3) {
      intPartStr = parts[0]
      fracPartStr = parts[1]
    } else {
      intPartStr = cleaned.replace(/,/g, '')
    }
  } else if (cleaned.includes('.')) {
    const parts = cleaned.split('.')
    // In IDR, "Rp 125.000" or "Rp 1.000.000" uses dots as thousand separators
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      intPartStr = cleaned.replace(/\./g, '')
    } else {
      intPartStr = parts[0]
      fracPartStr = parts[1] || ''
    }
  }

  intPartStr = intPartStr.replace(/[^0-9]/g, '') || '0'
  fracPartStr = (fracPartStr.replace(/[^0-9]/g, '') + '0000').slice(0, 4)
  return `${BigInt(intPartStr).toString()}.${fracPartStr}`
}

function addDecimal4Strings(aStr, bStr) {
  const toScaled = (s) => {
    if (!s) return 0n
    const [i, f = '0000'] = String(s).split('.')
    return BigInt(i || '0') * 10000n + BigInt((f + '0000').slice(0, 4))
  }
  const total = toScaled(aStr) + toScaled(bStr)
  const intPart = total / 10000n
  const fracPart = (total % 10000n).toString().padStart(4, '0')
  return `${intPart.toString()}.${fracPart}`
}

export function extractAccountLast4(rawHint) {
  if (!rawHint) return null
  const matches = String(rawHint).match(/(\d{4})(?!.*\d)/)
  return matches ? matches[1] : null
}

function parseMandiriTimestamp(rawDateStr, fallbackIso = null) {
  if (!rawDateStr) {
    const fb = fallbackIso ? new Date(fallbackIso) : new Date()
    const iso = fb.toISOString()
    return { occurred_at: iso, book_date: iso.slice(0, 10) }
  }
  const s = String(rawDateStr).trim()

  // Pattern 1: "22 Nov 2026 10:15:30 WIB" or "22 November 2026, 10:15"
  const m1 = s.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})(?:[\s,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/i)
  if (m1) {
    const day = m1[1].padStart(2, '0')
    const month = MONTH_MAP[m1[2].toLowerCase().slice(0, 3)] || MONTH_MAP[m1[2].toLowerCase()]
    const year = m1[3]
    const hh = (m1[4] || '00').padStart(2, '0')
    const mm = (m1[5] || '00').padStart(2, '0')
    const ss = (m1[6] || '00').padStart(2, '0')
    if (month) {
      const book_date = `${year}-${month}-${day}`
      return {
        occurred_at: `${book_date}T${hh}:${mm}:${ss}+07:00`,
        book_date,
      }
    }
  }

  // Pattern 2: "22/11/2026 14:20:00" or "22-11-2026 14:20"
  const m2 = s.match(/(\d{2})[/-](\d{2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  if (m2) {
    const [, dd, mm, yyyy, hh = '00', min = '00', ss = '00'] = m2
    const book_date = `${yyyy}-${mm}-${dd}`
    return {
      occurred_at: `${book_date}T${hh.padStart(2, '0')}:${min}:${ss}+07:00`,
      book_date,
    }
  }

  const parsed = new Date(s)
  if (!isNaN(parsed.getTime())) {
    const iso = parsed.toISOString()
    return { occurred_at: iso, book_date: iso.slice(0, 10) }
  }

  const fb = fallbackIso ? new Date(fallbackIso) : new Date()
  const iso = fb.toISOString()
  return { occurred_at: iso, book_date: iso.slice(0, 10) }
}

function suggestCategoryFromCounterparty(counterparty = '', txType = 'TRANSFER') {
  const text = `${counterparty} ${txType}`.toLowerCase()
  if (/pln|listrik|pdam|air|indihome|telkom|internet|wifi/.test(text)) {
    return { jenis: 'Pengeluaran Bersama', kategori: 'Listrik, Air & Utilitas' }
  }
  if (/kopi|susu|syrup|cup|bahan|sabun|shampoo|wax|supplier|toko/.test(text)) {
    return { jenis: 'Pengeluaran Bersama', kategori: 'Pembelian Bahan Baku' }
  }
  if (/gaji|upah|komisi|thr|bonus/.test(text)) {
    return { jenis: 'Pengeluaran Bersama', kategori: 'Gaji & Komisi Karyawan' }
  }
  return { jenis: 'Pengeluaran Bersama', kategori: 'Biaya Operasional Lainnya' }
}

export function parseMandiriNotificationEmail({ subject = '', from = '', body = '', receivedAt = null } = {}) {
  const { pairs, plainText } = extractStructuredPairs(body)
  const combinedHeaderAndBody = `${subject}\n${plainText}`.toLowerCase()

  // 1. Determine Transaction Status
  const rawStatus = findLabelValue(pairs, ['status transaksi', 'status']) || ''
  let transaction_status = 'SUCCESS'
  if (/gagal|failed|ditolak|rejected|batal/i.test(rawStatus) || /\btransaksi\s+gagal\b/i.test(combinedHeaderAndBody)) {
    transaction_status = 'FAILED'
  } else if (/pending|diproses|menunggu|in progress/i.test(rawStatus)) {
    transaction_status = 'PENDING'
  }

  // 2. Extract Source Account & Last 4 Digits
  const rawSourceAccount = findLabelValue(pairs, [
    'sumber dana',
    'rekening sumber',
    'rekening asal',
    'dari rekening',
    'nomor rekening sumber',
  ])
  const account_last4 = extractAccountLast4(rawSourceAccount)

  // 3. Extract Principal, Fee, and Total Debit strictly from labeled fields
  const rawPrincipal = findLabelValue(pairs, [
    'nominal transfer',
    'nominal transaksi',
    'jumlah transfer',
    'nominal pembayaran',
    'nominal top up',
    'nominal',
    'jumlah',
  ])
  const rawFee = findLabelValue(pairs, [
    'biaya transaksi',
    'biaya admin',
    'biaya layanan',
    'biaya transfer',
  ])
  const rawTotal = findLabelValue(pairs, [
    'total debet',
    'total debit',
    'total transaksi',
    'total pembayaran',
    'total bayar',
  ])

  const principal_amount = parseIdrDecimal4(rawPrincipal)
  const fee_amount = rawFee !== null ? parseIdrDecimal4(rawFee) : null
  const explicit_total = rawTotal !== null ? parseIdrDecimal4(rawTotal) : null

  // If transaction failed/pending, return early as non-postable
  if (transaction_status !== 'SUCCESS') {
    return {
      recognized: Boolean(principal_amount || rawSourceAccount),
      postable: false,
      parse_status: 'IGNORED_NON_OUTGOING',
      bank: 'MANDIRI',
      bank_code: 'MANDIRI',
      direction: 'OUT',
      transaction_status,
      currency: 'IDR',
      principal_amount,
      fee_amount,
      total_debit: explicit_total || principal_amount,
      account_hint: rawSourceAccount || null,
      account_last4,
      parser_version: 'mandiri_non_postable_v1',
    }
  }

  // 4. Reject incoming money notifications ("uang masuk" / "kredit")
  if (/\buang masuk\b|\btransaksi masuk\b|\bkredit rekening\b/i.test(combinedHeaderAndBody)) {
    return {
      recognized: false,
      postable: false,
      parse_status: 'IGNORED_NON_OUTGOING',
      bank: 'MANDIRI',
      bank_code: 'MANDIRI',
      direction: 'IN',
      transaction_status,
    }
  }

  // 5. Require at least a valid amount and either source account or transaction context
  if (!principal_amount && !explicit_total) {
    return {
      recognized: false,
      postable: false,
      parse_status: 'NEEDS_MANUAL_REVIEW',
      bank: 'MANDIRI',
      bank_code: 'MANDIRI',
      error: 'Format email Mandiri tidak dikenali atau nominal transaksi tidak ditemukan.',
    }
  }

  // Rule: Never add fee again if explicit Total Debet is already provided in the email
  const effectivePrincipal = principal_amount || explicit_total
  const total_debit = explicit_total
    ? explicit_total
    : fee_amount
      ? addDecimal4Strings(effectivePrincipal, fee_amount)
      : effectivePrincipal

  // 6. Determine Parser Version & Transaction Type
  const rawJenis = findLabelValue(pairs, ['jenis transaksi', 'layanan']) || ''
  let parser_version = 'mandiri_transfer_v1'
  let tx_type = 'TRANSFER'

  if (/qris/i.test(subject) || /qris/i.test(rawJenis) || /pembayaran qris/i.test(combinedHeaderAndBody)) {
    parser_version = 'mandiri_qris_payment_v1'
    tx_type = 'QRIS'
  } else if (
    /virtual account|\bva\b|tagihan|multipayment|top[\s-]?up|pln|bpjs|pdam|pajak/i.test(subject) ||
    /virtual account|\bva\b|tagihan|multipayment|top[\s-]?up/i.test(rawJenis)
  ) {
    parser_version = 'mandiri_bill_va_v1'
    tx_type = 'BILL_PAYMENT'
  }

  // 7. Extract Counterparty, Reference, and Timestamp
  const counterparty_name =
    findLabelValue(pairs, [
      'penerima',
      'nama penerima',
      'nama merchant',
      'merchant',
      'penyedia jasa',
      'institusi',
      'tujuan',
    ]) || null

  const bank_reference =
    findLabelValue(pairs, ['no. referensi', 'nomor referensi', 'no referensi', 'no. struk', 'id transaksi']) || null

  const rawDate = findLabelValue(pairs, ['tanggal & waktu', 'tanggal transaksi', 'tanggal', 'waktu'])
  const { occurred_at, book_date } = parseMandiriTimestamp(rawDate, receivedAt)
  const suggestion = suggestCategoryFromCounterparty(counterparty_name || subject, tx_type)

  return {
    recognized: true,
    postable: true,
    parse_status: 'PARSED',
    bank: 'MANDIRI',
    bank_code: 'MANDIRI',
    direction: 'OUT',
    transaction_status: 'SUCCESS',
    tx_type,
    currency: 'IDR',
    principal_amount: effectivePrincipal,
    fee_amount,
    total_debit,
    occurred_at,
    book_date,
    bank_reference,
    counterparty_name,
    account_hint: rawSourceAccount ? `****${account_last4 || ''}` : null,
    account_last4,
    parser_version,
    sender_verified: isTrustedMandiriSender(from),
    suggested_jenis: suggestion.jenis,
    suggested_kategori: suggestion.kategori,
  }
}

export const SAMPLE_MANDIRI_EMAIL_TEMPLATES = {
  TRANSFER_BIFAST: {
    subject: "Bukti Transaksi Transfer BI-FAST - Livin' by Mandiri",
    from: 'noreply.livin@bankmandiri.co.id',
     getBody: (last4 = '1122') => `<table>
  <tr><td>Status Transaksi</td><td>Berhasil</td></tr>
  <tr><td>Jenis Transaksi</td><td>Transfer BI-FAST</td></tr>
  <tr><td>Tanggal & Waktu</td><td>${new Date().toLocaleDateString('en-GB')} 10:15:30</td></tr>
  <tr><td>Sumber Dana</td><td>13700****${last4}</td></tr>
  <tr><td>Penerima</td><td>PT SUPPLIER SHAMPOO CARWASH</td></tr>
  <tr><td>Bank Tujuan</td><td>BCA</td></tr>
  <tr><td>Nominal Transfer</td><td>Rp 350.000,00</td></tr>
  <tr><td>Biaya Transaksi</td><td>Rp 2.500,00</td></tr>
  <tr><td>Total Debet</td><td>Rp 352.500,00</td></tr>
  <tr><td>No. Referensi</td><td>MND-TF-${Date.now().toString().slice(-8)}</td></tr>
</table>`,
  },
  QRIS_PAYMENT: {
    subject: "Pembayaran QRIS Berhasil - Livin' by Mandiri",
    from: 'noreply.livin@bankmandiri.co.id',
    getBody: (last4 = '1122') => `<table>
  <tr><td>Status Transaksi</td><td>Berhasil</td></tr>
  <tr><td>Jenis Transaksi</td><td>Pembayaran QRIS</td></tr>
  <tr><td>Tanggal & Waktu</td><td>${new Date().toLocaleDateString('en-GB')} 14:20:00</td></tr>
  <tr><td>Rekening Sumber</td><td>13700****${last4}</td></tr>
  <tr><td>Nama Merchant</td><td>GROSIR KOPI & SUSU NUSANTARA</td></tr>
  <tr><td>Nominal Transaksi</td><td>Rp 125.000,00</td></tr>
  <tr><td>No. Referensi</td><td>MND-QRIS-${Date.now().toString().slice(-8)}</td></tr>
</table>`,
  },
  BILL_VA: {
    subject: "Bukti Pembayaran Tagihan PLN - Livin' by Mandiri",
    from: 'noreply.livin@bankmandiri.co.id',
    getBody: (last4 = '1122') => `<table>
  <tr><td>Status Transaksi</td><td>Berhasil</td></tr>
  <tr><td>Jenis Transaksi</td><td>Multipayment / Tagihan</td></tr>
  <tr><td>Tanggal & Waktu</td><td>${new Date().toLocaleDateString('en-GB')} 16:45:00</td></tr>
  <tr><td>Sumber Dana</td><td>13700****${last4}</td></tr>
  <tr><td>Penyedia Jasa</td><td>PLN POSTPAID / LISTRIK</td></tr>
  <tr><td>Nominal Pembayaran</td><td>Rp 480.000,00</td></tr>
  <tr><td>Biaya Admin</td><td>Rp 3.000,00</td></tr>
  <tr><td>Total Debet</td><td>Rp 483.000,00</td></tr>
  <tr><td>No. Referensi</td><td>MND-PLN-${Date.now().toString().slice(-8)}</td></tr>
</table>`,
  },
}
