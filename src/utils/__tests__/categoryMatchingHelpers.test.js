import { describe, it, expect } from 'vitest'
import { isCategoryMatch } from '../categoryMatchingHelpers.js'

describe('isCategoryMatch', () => {
  it('matches SEMUA or ALL', () => {
    expect(isCategoryMatch('Kopi (Coffee)', 'SEMUA')).toBe(true)
    expect(isCategoryMatch('Makanan Berat', 'ALL')).toBe(true)
    expect(isCategoryMatch('Non-Coffee & Teh', '')).toBe(true)
  })

  it('matches exact and normalized case', () => {
    expect(isCategoryMatch('Kopi (Coffee)', 'kopi (coffee)')).toBe(true)
    expect(isCategoryMatch('Makanan Berat', 'Makanan Berat')).toBe(true)
  })

  it('matches smart aliases', () => {
    expect(isCategoryMatch('Kopi (Coffee)', 'Kopi')).toBe(true)
    expect(isCategoryMatch('Non-Coffee & Teh', 'Teh')).toBe(true)
    expect(isCategoryMatch('Camilan & Snack', 'Snack')).toBe(true)
    expect(isCategoryMatch('Camilan & Snack', 'Camilan')).toBe(true)
    expect(isCategoryMatch('Dessert & Pastry', 'Dessert')).toBe(true)
  })

  it('does not match unrelated categories', () => {
    expect(isCategoryMatch('Makanan Berat', 'Kopi')).toBe(false)
    expect(isCategoryMatch('Non-Coffee & Teh', 'Makanan Berat')).toBe(false)
  })
})
