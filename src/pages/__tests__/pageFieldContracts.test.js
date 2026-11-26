import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PAGE_FIELD_CONTRACTS, validatePageContract } from '../../constants/pageFieldContracts'

const ROOT = process.cwd()

function loadContractSource(contract) {
  const files = [contract.file, ...(contract.companionFiles || [])]
  return files
    .map((relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf-8'))
    .join('\n')
}

describe('Phase 1.5: Page Field & Section Regression Contracts', () => {
  describe('validator guard invariants', () => {
    it('fails explicitly and names missing tab, section, field, or handler when dropped during a UI rewrite', () => {
      const sampleContract = {
        id: 'sample-pos',
        requiredTabs: ['carwash', 'exchange'],
        requiredSections: ['ThermalReceiptModal'],
        requiredFields: ['platNomor', 'noTelepon'],
        requiredHandlers: ['handleConfirmVoid']
      }

      const brokenRefactor = `
        const tabs = ['carwash']
        const fields = { noTelepon: '' }
        export default function BrokenPOS() { return <div className="bg-[#F4F6FA]" /> }
      `

      const res = validatePageContract(sampleContract, brokenRefactor)
      expect(res.passed).toBe(false)
      expect(res.missingTabs).toEqual(['exchange'])
      expect(res.missingSections).toEqual(['ThermalReceiptModal'])
      expect(res.missingFields).toEqual(['platNomor'])
      expect(res.missingHandlers).toEqual(['handleConfirmVoid'])
    })

    it('passes when Tailwind/styling classes are completely replaced while preserving all contract items', () => {
      const sampleContract = {
        id: 'sample-pos',
        requiredTabs: ['carwash', 'exchange'],
        requiredSections: ['ThermalReceiptModal'],
        requiredFields: ['platNomor', 'noTelepon'],
        requiredHandlers: ['handleConfirmVoid']
      }

      const cleanRefactor = `
        const tabs = ['carwash', 'exchange']
        const form = { platNomor: 'B 1234', noTelepon: '0812' }
        const handleConfirmVoid = () => {}
        export default function CleanCobaltPOS() {
          return (
            <div className="bg-[#09090B] text-[#FAFAFA]">
              <button onClick={handleConfirmVoid}>Void</button>
              <ThermalReceiptModal />
            </div>
          )
        }
      `

      const res = validatePageContract(sampleContract, cleanRefactor)
      expect(res.passed).toBe(true)
      expect(res.missingTabs).toEqual([])
      expect(res.missingSections).toEqual([])
      expect(res.missingFields).toEqual([])
      expect(res.missingHandlers).toEqual([])
    })
  })

  describe('App.jsx route coverage completeness', () => {
    it('covers every primary <Route path="..."> in src/App.jsx inside PAGE_FIELD_CONTRACTS', () => {
      const appSrc = fs.readFileSync(path.join(ROOT, 'src/App.jsx'), 'utf-8')
      const routePaths = Array.from(appSrc.matchAll(/<Route\s+path="([^"]+)"/g)).map((m) => m[1])
      const excludedRedirectAliases = new Set(['/', '/manual', '/inventory', '*'])
      const primaryRoutes = routePaths.filter((p) => !excludedRedirectAliases.has(p))
      const contractedRoutes = new Set(PAGE_FIELD_CONTRACTS.map((c) => c.route))

      const uncovered = primaryRoutes.filter((r) => !contractedRoutes.has(r))
      expect(uncovered).toEqual([])
      expect(PAGE_FIELD_CONTRACTS).toHaveLength(18)
    })
  })

  describe('all 18 production pages satisfy their field, tab, section, and handler contracts', () => {
    it.each(PAGE_FIELD_CONTRACTS)('$id ($route) preserves all tabs, sections, fields, and handlers', (contract) => {
      const combinedSource = loadContractSource(contract)
      const result = validatePageContract(contract, combinedSource)
      expect(result).toEqual({
        passed: true,
        missingTabs: [],
        missingSections: [],
        missingFields: [],
        missingHandlers: []
      })
    })
  })
})
