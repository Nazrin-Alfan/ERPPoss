import { describe, expect, it } from 'vitest'
import { getPayrollPeriod } from '../staffHelpers'

describe('Payroll cut-off 16–15', () => {
  it.each([
    [2026, 9, 31, '2026-10-16', '2026-11-15'],
    [2026, 0, 31, '2026-01-16', '2026-02-15'],
    [2026, 2, 31, '2026-03-16', '2026-04-15'],
    [2026, 11, 31, '2026-12-16', '2027-01-15'],
    [2026, 0, 1, '2025-12-16', '2026-01-15'],
    [2026, 9, 15, '2026-09-16', '2026-10-15'],
    [2026, 9, 16, '2026-10-16', '2026-11-15'],
    [2024, 1, 29, '2024-02-16', '2024-03-15'],
    [2025, 1, 28, '2025-02-16', '2025-03-15'],
  ])('uses correct interval for %i/%i/%i', (year, month, day, start, end) => {
    const date = new Date(year, month, day, 23, 59)
    const original = date.getTime()
    expect(getPayrollPeriod(date)).toEqual({ start, end })
    expect(date.getTime()).toBe(original)
  })
})
