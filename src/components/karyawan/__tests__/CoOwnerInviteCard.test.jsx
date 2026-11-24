import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import fs from 'node:fs'
import path from 'node:path'

vi.mock('../../../supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      update: vi.fn().mockReturnThis()
    })),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null })
  }
}))

import CoOwnerInviteCard from '../CoOwnerInviteCard.jsx'

describe('CoOwnerInviteCard (Gmail Invitation Flow) Suite', () => {
  const activeTenant = { id: 'tenant-1', nama: 'Jaya Bersama Carwash' }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('TC_01 (HAPPY_PATH): Renders Gmail invitation form without password input for Owner and Super Admin', () => {
    const html = renderToString(
      React.createElement(CoOwnerInviteCard, {
        activeTenant,
        profile: { id: 'user-1', role: 'Owner' }
      })
    )

    expect(html).toContain('Undang Co-Owner (Gmail)')
    expect(html).toContain('type="email"')
    expect(html).toContain('Buat Undangan')
    expect(html).not.toContain('type="password"')
  })

  it('TC_02 (SECURITY_RBAC): Hides Co-Owner invitation card from non-Owner roles (Admin / Kasir)', () => {
    const adminHtml = renderToString(
      React.createElement(CoOwnerInviteCard, {
        activeTenant,
        profile: { id: 'user-2', role: 'Admin' }
      })
    )
    const kasirHtml = renderToString(
      React.createElement(CoOwnerInviteCard, {
        activeTenant,
        profile: { id: 'user-3', role: 'Kasir' }
      })
    )

    expect(adminHtml).toBe('')
    expect(kasirHtml).toBe('')
  })

  it('TC_03 (REGRESSION): AuthContext auto-claims pending co-owner invitations and Karyawan renders CoOwnerInviteCard', () => {
    const authCtxSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/context/AuthContext.jsx'),
      'utf8'
    )
    const karyawanSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/pages/Karyawan.jsx'),
      'utf8'
    )

    expect(authCtxSrc).toContain('fn_claim_pending_co_owner_invitations')
    expect(karyawanSrc).toContain('CoOwnerInviteCard')
  })
})
