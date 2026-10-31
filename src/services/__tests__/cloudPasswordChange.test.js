import { beforeEach, describe, expect, it, vi } from 'vitest'

const { auth } = vi.hoisted(() => ({ auth: {
  getUser: vi.fn(), signInWithPassword: vi.fn(), updateUser: vi.fn(),
} }))
vi.mock('../../supabaseClient', () => ({ supabase: { auth }, isCloudBackend: true }))
import { api } from '../apiAdapter'

const request = { currentPassword: 'old-test-password', newPassword: 'new-test-password' }
const user = { id: 'test-owner', email: 'owner@example.test' }

describe('Cloud password change requires current-password verification', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    auth.getUser.mockResolvedValue({ data: { user }, error: null })
    auth.signInWithPassword.mockResolvedValue({ data: { user }, error: null })
    auth.updateUser.mockResolvedValue({ data: { user }, error: null })
  })

  it('reauthenticates the signed-in user before updating their password', async () => {
    await expect(api.auth.changePassword(request)).resolves.toMatchObject({ success: true })
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: user.email, password: request.currentPassword })
    expect(auth.updateUser).toHaveBeenCalledWith({ password: request.newPassword })
    expect(auth.signInWithPassword.mock.invocationCallOrder[0]).toBeLessThan(auth.updateUser.mock.invocationCallOrder[0])
  })

  it('does not update when the old password is incorrect', async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { user: null }, error: new Error('Invalid login credentials') })
    await expect(api.auth.changePassword(request)).rejects.toThrow()
    expect(auth.updateUser).not.toHaveBeenCalled()
  })

  it('requires an authenticated user', async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: null })
    await expect(api.auth.changePassword(request)).rejects.toThrow()
    expect(auth.signInWithPassword).not.toHaveBeenCalled()
    expect(auth.updateUser).not.toHaveBeenCalled()
  })

  it('propagates session validation errors without updating', async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error('Session expired') })
    await expect(api.auth.changePassword(request)).rejects.toThrow('Session expired')
    expect(auth.updateUser).not.toHaveBeenCalled()
  })

  it('fails closed if reauthentication returns no user', async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { user: null }, error: null })
    await expect(api.auth.changePassword(request)).rejects.toThrow()
    expect(auth.updateUser).not.toHaveBeenCalled()
  })

  it('fails closed if reauthentication returns a different user', async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { user: { ...user, id: 'other-user' } }, error: null })
    await expect(api.auth.changePassword(request)).rejects.toThrow()
    expect(auth.updateUser).not.toHaveBeenCalled()
  })

  it.each([{ ...request, currentPassword: '' }, { ...request, newPassword: '123' }])('rejects incomplete or short passwords before authentication', async (input) => {
    await expect(api.auth.changePassword(input)).rejects.toThrow()
    expect(auth.getUser).not.toHaveBeenCalled()
    expect(auth.updateUser).not.toHaveBeenCalled()
  })

  it('propagates password update errors after successful reauthentication', async () => {
    auth.updateUser.mockResolvedValue({ data: null, error: new Error('Password policy rejected') })
    await expect(api.auth.changePassword(request)).rejects.toThrow('Password policy rejected')
  })
})
