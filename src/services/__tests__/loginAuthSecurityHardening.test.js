import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalClient } from '../localDbEngine'
import { formatStaffLoginHandle } from '../../utils/staffHelpers'

const { mockSupabase, mockAuth, mockMaybeSingle } = vi.hoisted(() => {
  const mockAuth = {
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
    getUser: vi.fn(),
    updateUser: vi.fn(),
  }
  const mockMaybeSingle = vi.fn()
  const mockSupabase = {
    auth: mockAuth,
    rpc: vi.fn(),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: mockMaybeSingle,
        })),
      })),
    })),
  }
  return { mockSupabase, mockAuth, mockMaybeSingle }
})

vi.mock('../../supabaseClient', () => ({
  supabase: mockSupabase,
  isCloudBackend: true,
}))

import { api } from '../apiAdapter'

describe('Login & Auth Security Hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.signOut.mockResolvedValue({ error: null })
    mockAuth.getUser.mockResolvedValue({
      data: { user: { id: 'usr-1', email: 'owner@toko-a.test' } },
      error: null,
    })
    mockAuth.updateUser.mockResolvedValue({ data: { user: { id: 'usr-1' } }, error: null })
  })

  it('1. resolves staff usernames deterministically in Cloud mode without calling fn_resolve_login_email', async () => {
    const profile = { id: 'kasir-1', tenant_id: 'tenant-a', role: 'Kasir', is_active: true }
    mockAuth.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'kasir-1', email: 'kasir1.toko-a@pos.internal' } },
      error: null,
    })
    mockMaybeSingle.mockResolvedValue({ data: profile, error: null })

    await api.auth.login('kasir1@toko-a', 'Passw0rd!')
    expect(mockAuth.signInWithPassword).toHaveBeenLastCalledWith({
      email: 'kasir1.toko-a@pos.internal',
      password: 'Passw0rd!',
    })

    await api.auth.login('kasir1.toko-a', 'Passw0rd!')
    expect(mockAuth.signInWithPassword).toHaveBeenLastCalledWith({
      email: 'kasir1.toko-a@pos.internal',
      password: 'Passw0rd!',
    })

    await api.auth.login('kasir1', 'Passw0rd!', 'Toko-A')
    expect(mockAuth.signInWithPassword).toHaveBeenLastCalledWith({
      email: 'kasir1.toko-a@pos.internal',
      password: 'Passw0rd!',
    })

    expect(mockSupabase.rpc).not.toHaveBeenCalledWith('fn_resolve_login_email', expect.anything())
  })

  it('2. preserves password whitespace, fails closed on missing profile, and signs out inactive profiles', async () => {
    // Missing profile -> fail closed + local signOut
    mockAuth.signInWithPassword.mockResolvedValueOnce({
      data: { user: { id: 'usr-orphan', email: 'orphan@test.com' } },
      error: null,
    })
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null })

    await expect(api.auth.login('orphan@test.com', ' pass with space ')).rejects.toThrow(/Profil akun tidak ditemukan/i)
    expect(mockAuth.signInWithPassword).toHaveBeenCalledWith({
      email: 'orphan@test.com',
      password: ' pass with space ',
    })
    expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: 'local' })

    // Inactive profile -> reject + signOut
    mockAuth.signInWithPassword.mockResolvedValueOnce({
      data: { user: { id: 'usr-off', email: 'off@test.com' } },
      error: null,
    })
    mockMaybeSingle.mockResolvedValueOnce({
      data: { id: 'usr-off', tenant_id: 't-1', role: 'Kasir', is_active: false },
      error: null,
    })

    await expect(api.auth.login('off@test.com', 'ValidPass123')).rejects.toThrow(/ACCOUNT_INACTIVE/i)
    expect(mockAuth.signOut).toHaveBeenCalled()
  })

  it('3. changePassword enforces min 8 chars and revokes other sessions after update', async () => {
    await expect(
      api.auth.changePassword({ currentPassword: 'OldPassword1', newPassword: '1234567' })
    ).rejects.toThrow(/minimal 8 karakter/i)
    expect(mockAuth.updateUser).not.toHaveBeenCalled()

    mockAuth.signInWithPassword.mockResolvedValueOnce({
      data: { user: { id: 'usr-1', email: 'owner@toko-a.test' } },
      error: null,
    })

    const res = await api.auth.changePassword({
      currentPassword: 'OldPassword1',
      newPassword: 'NewStrongPassword1',
    })
    expect(res.success).toBe(true)
    expect(mockAuth.updateUser).toHaveBeenCalledWith({ password: 'NewStrongPassword1' })
    expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: 'others' })
  })

  it('4. resetPassword enforces min 8 chars and revokes global sessions in Cloud mode', async () => {
    await expect(api.auth.resetPassword({ newPassword: '1234567' })).rejects.toThrow(/minimal 8 karakter/i)
    expect(mockAuth.updateUser).not.toHaveBeenCalled()

    const res = await api.auth.resetPassword({ newPassword: 'ResetStrongPassword1' })
    expect(res.success).toBe(true)
    expect(mockAuth.updateUser).toHaveBeenCalledWith({ password: 'ResetStrongPassword1' })
    expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: 'global' })
  })

  it('5. formatStaffLoginHandle preserves tenant slug on internal @pos.internal handles', () => {
    expect(formatStaffLoginHandle('kasir1.toko-a@pos.internal')).toBe('kasir1.toko-a')
    expect(formatStaffLoginHandle('budi@jb.local')).toBe('budi')
    expect(formatStaffLoginHandle('owner@gmail.com')).toBe('owner@gmail.com')
  })

  it('6. localDbEngine blocks cross-tenant Co-Owner tenant deletion and rejects inactive OAuth profiles', async () => {
    const db = createLocalClient()
    db.erp.resetDatabase()

    const victimReg = await db.auth.signUpOwner({
      email: 'victim.owner@gmail.com',
      password: 'VictimPassword123',
      nama: 'Victim Owner',
      tenantName: 'Toko Korban',
      businessType: 'CAFE',
    })
    expect(victimReg.error).toBeNull()
    const victimTenantId = victimReg.data.tenant.id

    const attackerReg = await db.auth.signUpOwner({
      email: 'attacker.owner@gmail.com',
      password: 'AttackerPassword123',
      nama: 'Attacker Owner',
      tenantName: 'Toko Penyerang',
      businessType: 'CARWASH',
    })
    expect(attackerReg.error).toBeNull()

    // Attempt cross-tenant Co-Owner hijacking by registering victim email under attacker tenant
    const hijackRes = await db.auth.signUp({
      email: 'victim.owner@gmail.com',
      password: 'AnyPassword123',
      options: {
        data: { nama: 'Hijack', role: 'Owner', tenant_id: attackerReg.data.tenant.id },
      },
    })
    expect(hijackRes.error).not.toBeNull()

    // Victim tenant and profile must remain untouched
    const tenants = db.localDb.store.getTable('tenants')
    const profiles = db.localDb.store.getTable('profiles')
    expect(tenants.find((t) => t.id === victimTenantId)).toBeDefined()
    expect(profiles.find((p) => p.email === 'victim.owner@gmail.com')?.tenant_id).toBe(victimTenantId)

    // Deactivate victim and confirm Google OAuth refuses login
    const victimProf = profiles.find((p) => p.email === 'victim.owner@gmail.com')
    victimProf.is_active = false
    db.localDb.store.saveToStorage()

    const oauthBlocked = await db.auth.signInWithOAuth({
      provider: 'google',
      options: { mode: 'login', data: { email: 'victim.owner@gmail.com' } },
    })
    expect(oauthBlocked.data.user).toBeNull()
    expect(oauthBlocked.error?.message).toMatch(/ACCOUNT_INACTIVE/i)
  })
})
