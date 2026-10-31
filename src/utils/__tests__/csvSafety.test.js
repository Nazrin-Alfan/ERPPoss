import { describe, expect, it } from 'vitest'
import { generateCSVString } from '../financeHelpers'

const exportValue = value => generateCSVString([{ label: 'Value', key: 'value' }], [{ value }]).split('\r\n')[1]
describe('CSV formula neutralization', () => {
  it.each(['=1+1', '+SUM(A1:A2)', '-1+2', '@SUM(A1)', '  =1+1', '\t=1+1', '\r=1+1', '\n=1+1', '\uFEFF=1+1', '\ttext', '\rtext'])('exports untrusted %j as inert text', value => {
    expect(exportValue(value)).toBe(`"'${value}"`)
  })
  it('neutralizes formula-capable headers and accessor output', () => {
    expect(generateCSVString([{ label: '=HEADER()', accessor: () => '+1' }], [{}])).toBe('\uFEFF"\'=HEADER()"\r\n"\'+1"')
  })
  it('preserves actual numeric amounts, safe text, quotes, null and BOM', () => {
    expect(exportValue(-1250.5)).toBe('"-1250.5"')
    expect(exportValue(1250)).toBe('"1250"')
    expect(exportValue('Kopi "Arabika"')).toBe('"Kopi ""Arabika"""')
    expect(exportValue(null)).toBe('""')
    expect(generateCSVString([], [])).toBe('\uFEFF')
  })
})
