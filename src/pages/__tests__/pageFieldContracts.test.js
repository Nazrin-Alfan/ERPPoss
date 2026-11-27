import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PAGE_FIELD_CONTRACTS, SUBCOMPONENT_FIELD_CONTRACTS } from '../../constants/pageFieldContracts'
import { validateContractWithAst } from '../../utils/astContractValidator'

const ROOT = process.cwd()

function loadContractEntries(contract) {
  const files = [contract.file, ...(contract.companionFiles || [])]
  return files.map((relPath) => ({
    file: relPath,
    code: fs.readFileSync(path.join(ROOT, relPath), 'utf-8')
  }))
}

function discoverDomainInteractiveComponents() {
  const componentsRoot = path.join(ROOT, 'src/components')
  const ignoredDirs = new Set(['common', 'ui', 'layout', '__tests__'])
  const pattern = /(Modal|Manager|Customizer|InboxTab|Studio|Catalog|Lockout|Calculator|InviteCard|GeneralLedgerView)\.jsx$/
  const found = []

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!ignoredDirs.has(entry.name)) {
          walk(path.join(dir, entry.name))
        }
      } else if (entry.isFile() && pattern.test(entry.name)) {
        const rel = path.relative(ROOT, path.join(dir, entry.name)).replace(/\\/g, '/')
        found.push(rel)
      }
    }
  }

  walk(componentsRoot)
  return found.sort()
}

describe('Phase 1.5: AST Page, Section, Field & Subcomponent Regression Contracts', () => {
  describe('AST anti-false-positive mutation guard invariants', () => {
    const sampleContract = {
      id: 'sample-pos',
      requiredTabs: ['carwash', 'exchange'],
      requiredRenderedComponents: ['ThermalReceiptModal'],
      requiredSections: ['showShiftClosingModal'],
      requiredFields: ['platNomor', 'noTelepon'],
      requiredHandlers: ['handleConfirmVoid'],
      requiredPrintContract: 'print-area'
    }

    it('FAILS when a modal is imported but NOT rendered inside JSX', async () => {
      const brokenCode = `
        import React, { useState } from 'react'
        import ThermalReceiptModal from './ThermalReceiptModal'
        export default function BrokenPOS() {
          const [showShiftClosingModal] = useState(false)
          const [platNomor, setPlatNomor] = useState('')
          const [noTelepon, setNoTelepon] = useState('')
          const handleConfirmVoid = () => {}
          const tabs = ['carwash', 'exchange']
          return (
            <div id="print-area" data-tab={tabs[0]} data-shift={showShiftClosingModal}>
              <input value={platNomor} onChange={(e) => setPlatNomor(e.target.value)} />
              <input value={noTelepon} onChange={(e) => setNoTelepon(e.target.value)} />
              <button onClick={handleConfirmVoid}>Void</button>
            </div>
          )
        }
      `
      const res = await validateContractWithAst(sampleContract, [{ file: 'BrokenPOS.jsx', code: brokenCode }])
      expect(res.passed).toBe(false)
      expect(res.unrenderedComponents).toEqual(['ThermalReceiptModal'])
    })

    it('FAILS when useState fields remain declared in JS but are removed from JSX inputs & payloads', async () => {
      const brokenCode = `
        import React, { useState } from 'react'
        import ThermalReceiptModal from './ThermalReceiptModal'
        export default function DeadStatePOS() {
          const [showShiftClosingModal] = useState(false)
          const [platNomor, setPlatNomor] = useState('')
          const [noTelepon, setNoTelepon] = useState('')
          const handleConfirmVoid = () => {}
          const tabs = ['carwash', 'exchange']
          return (
            <div id="print-area" data-tab={tabs[0]} data-shift={showShiftClosingModal}>
              <input value={noTelepon} onChange={(e) => setNoTelepon(e.target.value)} />
              <button onClick={handleConfirmVoid}>Void</button>
              <ThermalReceiptModal />
            </div>
          )
        }
      `
      const res = await validateContractWithAst(sampleContract, [{ file: 'DeadStatePOS.jsx', code: brokenCode }])
      expect(res.passed).toBe(false)
      expect(res.missingFields).toEqual(['platNomor'])
    })

    it('FAILS when a handler exists in JS scope but is unwired from JSX events and runtime calls', async () => {
      const brokenCode = `
        import React, { useState } from 'react'
        import ThermalReceiptModal from './ThermalReceiptModal'
        export default function UnwiredHandlerPOS() {
          const [showShiftClosingModal] = useState(false)
          const [platNomor, setPlatNomor] = useState('')
          const [noTelepon, setNoTelepon] = useState('')
          const handleConfirmVoid = () => 'never-called'
          const tabs = ['carwash', 'exchange']
          return (
            <div id="print-area" data-tab={tabs[0]} data-shift={showShiftClosingModal}>
              <input value={platNomor} onChange={(e) => setPlatNomor(e.target.value)} />
              <input value={noTelepon} onChange={(e) => setNoTelepon(e.target.value)} />
              <ThermalReceiptModal />
            </div>
          )
        }
      `
      const res = await validateContractWithAst(sampleContract, [{ file: 'UnwiredHandlerPOS.jsx', code: brokenCode }])
      expect(res.passed).toBe(false)
      expect(res.unwiredHandlers).toEqual(['handleConfirmVoid'])
    })

    it('FAILS when contract tokens only appear inside comments (comment-spoof immune)', async () => {
      const spoofedCode = `
        import React from 'react'
        export default function CommentSpoofPOS() {
          // 'carwash' 'exchange' ThermalReceiptModal showShiftClosingModal platNomor noTelepon handleConfirmVoid print-area
          return <div className="bg-[#09090B]">Empty</div>
        }
      `
      const res = await validateContractWithAst(sampleContract, [{ file: 'CommentSpoofPOS.jsx', code: spoofedCode }])
      expect(res.passed).toBe(false)
      expect(res.missingTabs).toEqual(['carwash', 'exchange'])
      expect(res.unrenderedComponents).toEqual(['ThermalReceiptModal'])
      expect(res.missingSections).toEqual(['showShiftClosingModal'])
      expect(res.missingFields).toEqual(['platNomor', 'noTelepon'])
      expect(res.unwiredHandlers).toEqual(['handleConfirmVoid'])
      expect(res.missingPrintContract).toBe(true)
    })

    it('PASSES when Tailwind styling is completely swapped to Cobalt Light / Carbon Dark D1 while keeping real AST bindings', async () => {
      const cleanCobaltCode = `
        import React, { useState } from 'react'
        import ThermalReceiptModal from './ThermalReceiptModal'
        export default function CobaltPOS() {
          const [showShiftClosingModal] = useState(false)
          const [platNomor, setPlatNomor] = useState('')
          const [noTelepon, setNoTelepon] = useState('')
          const handleConfirmVoid = () => {}
          const tabs = ['carwash', 'exchange']
          return (
            <div id="print-area" className="bg-[#F4F6FA] dark:bg-[#09090B]" data-tab={tabs[0]}>
              {showShiftClosingModal && <span>Shift</span>}
              <input value={platNomor} onChange={(e) => setPlatNomor(e.target.value)} />
              <input value={noTelepon} onChange={(e) => setNoTelepon(e.target.value)} />
              <button className="bg-[#2563EB] text-white" onClick={handleConfirmVoid}>Void</button>
              <ThermalReceiptModal />
            </div>
          )
        }
      `
      const res = await validateContractWithAst(sampleContract, [{ file: 'CobaltPOS.jsx', code: cleanCobaltCode }])
      expect(res).toEqual({
        passed: true,
        missingTabs: [],
        unrenderedComponents: [],
        missingSections: [],
        missingFields: [],
        unwiredHandlers: [],
        missingPrintContract: false
      })
    })
  })

  describe('Route and subcomponent discovery completeness', () => {
    it('covers every primary <Route path="..."> in src/App.jsx inside PAGE_FIELD_CONTRACTS', () => {
      const appSrc = fs.readFileSync(path.join(ROOT, 'src/App.jsx'), 'utf-8')
      const routePaths = Array.from(appSrc.matchAll(/<Route\s+path="([^"]+)"/g)).map((m) => m[1])
      const excludedRedirectAliases = new Set(['/', '/manual', '/inventory', '/ui-kit', '*'])
      const primaryRoutes = routePaths.filter((p) => !excludedRedirectAliases.has(p))
      const contractedRoutes = new Set(PAGE_FIELD_CONTRACTS.map((c) => c.route))

      const uncovered = primaryRoutes.filter((r) => !contractedRoutes.has(r))
      expect(uncovered).toEqual([])
      expect(PAGE_FIELD_CONTRACTS).toHaveLength(19)
    })

    it('covers all 22 domain interactive modals, managers, and views inside SUBCOMPONENT_FIELD_CONTRACTS', () => {
      const discovered = discoverDomainInteractiveComponents()
      const contracted = SUBCOMPONENT_FIELD_CONTRACTS.map((c) => c.file).sort()
      expect(contracted).toEqual(discovered)
      expect(SUBCOMPONENT_FIELD_CONTRACTS).toHaveLength(22)
    })
  })

  describe('all 18 production pages satisfy real AST JSX, tab, component, field, handler & print contracts', () => {
    it.each(PAGE_FIELD_CONTRACTS)('$id ($route) passes structural AST contract validation', async (contract) => {
      const entries = loadContractEntries(contract)
      const result = await validateContractWithAst(contract, entries)
      expect(result).toEqual({
        passed: true,
        missingTabs: [],
        unrenderedComponents: [],
        missingSections: [],
        missingFields: [],
        unwiredHandlers: [],
        missingPrintContract: false
      })
    })
  })

  describe('all 22 interactive subcomponents & modals satisfy structural AST contracts', () => {
    it.each(SUBCOMPONENT_FIELD_CONTRACTS)('$name ($file) passes structural AST contract validation', async (contract) => {
      const entries = loadContractEntries(contract)
      const result = await validateContractWithAst(contract, entries)
      expect(result).toEqual({
        passed: true,
        missingTabs: [],
        unrenderedComponents: [],
        missingSections: [],
        missingFields: [],
        unwiredHandlers: [],
        missingPrintContract: false
      })
    })
  })
})
