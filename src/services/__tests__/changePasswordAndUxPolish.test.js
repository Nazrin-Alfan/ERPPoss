import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import ChangePasswordModal from '../../components/auth/ChangePasswordModal'
import { supabase } from '../../supabaseClient'

describe('Change Password & Auth Security Suite', () => {
  beforeEach(() => {
    // Reset local database state for testing
    if (supabase.erp && typeof supabase.erp.resetDatabase === 'function') {
      supabase.erp.resetDatabase()
    }
  })

  it('TC_01: changePassword successfully updates user password when old password is correct', async () => {
    // Login as default demo owner first
    const loginRes = await supabase.auth.signInWithPassword({
      email: 'owner@relaypos.com',
      password: 'password123'
    })
    expect(loginRes.error).toBeNull()

    // Test change password method
    const changeRes = await supabase.auth.changePassword({
      currentPassword: 'password123',
      newPassword: 'MySecureNewPassword2026!'
    })
    expect(changeRes.success).toBe(true)

    // Verify login with OLD password now fails
    const failLogin = await supabase.auth.signInWithPassword({
      email: 'owner@relaypos.com',
      password: 'password123'
    })
    expect(failLogin.error).not.toBeNull()

    // Verify login with NEW password succeeds
    const successLogin = await supabase.auth.signInWithPassword({
      email: 'owner@relaypos.com',
      password: 'MySecureNewPassword2026!'
    })
    expect(successLogin.error).toBeNull()
    expect(successLogin.data.user.email).toBe('owner@relaypos.com')
  })

  it('TC_02: changePassword rejects incorrect current password', async () => {
    await supabase.auth.signInWithPassword({
      email: 'owner@relaypos.com',
      password: 'password123'
    })

    const changeRes = await supabase.auth.changePassword({
      currentPassword: 'wrongPasswordHere',
      newPassword: 'ValidNewPassword123'
    })

    expect(changeRes.success).toBe(false)
    expect(changeRes.error).toContain('Kata sandi saat ini salah')
  })

  it('TC_03: changePassword rejects passwords shorter than 6 characters', async () => {
    await supabase.auth.signInWithPassword({
      email: 'owner@relaypos.com',
      password: 'password123'
    })

    const changeRes = await supabase.auth.changePassword({
      currentPassword: 'password123',
      newPassword: '123'
    })

    expect(changeRes.success).toBe(false)
    expect(changeRes.error).toContain('minimal 6 karakter')
  })

  it('TC_04: ChangePasswordModal renders clean form with password fields and submit button', () => {
    const html = renderToString(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(ChangePasswordModal, {
          isOpen: true,
          onClose: () => {}
        })
      )
    )

    expect(html).toContain('Ganti Kata Sandi')
    expect(html).toContain('Kata Sandi Saat Ini')
    expect(html).toContain('Kata Sandi Baru')
    expect(html).toContain('Ulangi Kata Sandi Baru')
    expect(html).toContain('Simpan Kata Sandi')
  })
})
