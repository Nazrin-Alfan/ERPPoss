const PAYROLL_CATEGORY_KEYWORDS = [
  'casbon',
  'kasbon',
  'gaji',
  'upah',
  'payroll',
  'komisi',
  'pinjaman',
]

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
