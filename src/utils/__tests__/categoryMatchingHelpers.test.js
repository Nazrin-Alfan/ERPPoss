import { describe, it, expect } from 'vitest'
import { isCategoryMatch } from '../categoryMatchingHelpers.js'

describe('isCategoryMatch - Strict Coffee vs Non-Coffee Isolation', () => {
  it('matches SEMUA or ALL', () => {
    expect(isCategoryMatch('Kopi (Coffee)', 'SEMUA')).toBe(true)
    expect(isCategoryMatch('Non-Coffee & Teh', 'ALL')).toBe(true)
  })

  it('strictly isolates Kopi (Coffee) from Non-Coffee & Teh', () => {
    // When user selects 'Kopi (Coffee)', Non-Coffee items MUST NOT appear
    expect(isCategoryMatch('Non-Coffee & Teh', 'Kopi (Coffee)')).toBe(false)
    expect(isCategoryMatch('Non-Coffee', 'Kopi')).toBe(false)
    expect(isCategoryMatch('Teh Manis', 'Kopi (Coffee)')).toBe(false)

    // When user selects 'Non-Coffee & Teh', Coffee items MUST NOT appear
    expect(isCategoryMatch('Kopi (Coffee)', 'Non-Coffee & Teh')).toBe(false)
    expect(isCategoryMatch('Kopi Susu', 'Non-Coffee & Teh')).toBe(false)
    expect(isCategoryMatch('Americano', 'Non-Coffee & Teh')).toBe(false)
  })

  it('correctly matches within the same category group', () => {
    expect(isCategoryMatch('Kopi (Coffee)', 'Kopi (Coffee)')).toBe(true)
    expect(isCategoryMatch('Kopi Susu', 'Kopi (Coffee)')).toBe(true)
    expect(isCategoryMatch('Non-Coffee & Teh', 'Non-Coffee & Teh')).toBe(true)
    expect(isCategoryMatch('Teh Tarik', 'Non-Coffee & Teh')).toBe(true)
    expect(isCategoryMatch('Makanan Berat', 'Makanan Berat')).toBe(true)
    expect(isCategoryMatch('Camilan & Snack', 'Camilan & Snack')).toBe(true)
  })

  it('rejects cross-category pollution', () => {
    expect(isCategoryMatch('Makanan Berat', 'Kopi (Coffee)')).toBe(false)
    expect(isCategoryMatch('Camilan & Snack', 'Non-Coffee & Teh')).toBe(false)
  })
})
