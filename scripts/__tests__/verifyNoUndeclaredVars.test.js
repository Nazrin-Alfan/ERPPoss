import { describe, expect, it } from 'vitest'
import { auditFileScope } from '../verifyNoUndeclaredVars.js'

describe('verifyNoUndeclaredVars AST scope auditor', () => {
  it('handles nested array/object destructuring, rest spread, and default object params without false positives', async () => {
    const validCode = `
      import React, { useState } from 'react'

      const CafePOS = ({ forcedBusinessType = null } = {}) => {
        const [items] = useState([])

        async function loadData(rawPayload) {
          const [{ data: rpcRes, error: rpcErr }, { data: activeBranches }] = await Promise.all([
            Promise.resolve({ data: {}, error: null }),
            Promise.resolve({ data: [] })
          ])
          const { id_barang, ...cleanPayload } = rawPayload || {}
          return { rpcRes, rpcErr, activeBranches, id_barang, cleanPayload, forcedBusinessType, items }
        }

        return <button onClick={() => loadData({})}>Load</button>
      }

      export default CafePOS
    `

    const undeclared = await auditFileScope(validCode, 'ValidComponent.jsx')
    expect(undeclared).toEqual([])
  })

  it('detects real undeclared identifiers inside JSX event handlers and expressions', async () => {
    const brokenCode = `
      import React from 'react'

      export default function BrokenModal() {
        const handleSafe = () => 'ok'
        return (
          <div>
            <button onClick={handleSafe}>Safe</button>
            <button onClick={missingHandler}>{missingVar}</button>
          </div>
        )
      }
    `

    const undeclared = await auditFileScope(brokenCode, 'BrokenModal.jsx')
    expect(undeclared).toContain('missingHandler')
    expect(undeclared).toContain('missingVar')
    expect(undeclared).not.toContain('handleSafe')
  })

  it('allows barrel re-exports while still catching undeclared local exports', async () => {
    const barrelCode = `export { usePosWorkspace, useFinanceLedger as financeHook } from './hooks.js'`
    expect(await auditFileScope(barrelCode, 'index.js')).toEqual([])

    const brokenExport = `export { nonexistentSymbol }`
    expect(await auditFileScope(brokenExport, 'broken.js')).toEqual(['nonexistentSymbol'])
  })
})
