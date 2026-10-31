import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ signUp: vi.fn(), profile: vi.fn() }))
vi.mock('../../supabaseClient', () => ({
  isCloudBackend: true,
  supabase: {
    auth: { signUp: mocks.signUp },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.profile }) }) }),
  },
}))
import { api } from '../apiAdapter'

const input = { email: ' owner@example.com ', password: 'secure-password', nama: ' Owner ', tenantName: ' My Store ', businessType: 'CAFE' }

describe('Cloud owner registration', () => {
  beforeEach(() => vi.clearAllMocks())

  it('waits for email confirmation without querying an inaccessible profile', async () => {
    mocks.signUp.mockResolvedValue({ data: { user: { id: 'owner' }, session: null }, error: null })
    const result = await api.auth.registerOwner(input)
    expect(result.requiresEmailConfirmation).toBe(true)
    expect(result.profile).toBeNull()
    expect(mocks.profile).not.toHaveBeenCalled()
  })

  it('requires the server-provisioned owner tenant before reporting a signed-in registration', async () => {
    const profile = { id: 'owner', tenant_id: 'tenant', branch_id: 'branch', role: 'Owner' }
    mocks.signUp.mockResolvedValue({ data: { user: { id: 'owner' }, session: { access_token: 'session' } }, error: null })
    mocks.profile.mockResolvedValue({ data: profile, error: null })
    const result = await api.auth.registerOwner(input)
    expect(result.profile).toEqual(profile)
    expect(result.requiresEmailConfirmation).toBe(false)
    expect(mocks.signUp).toHaveBeenCalledWith(expect.objectContaining({ email: 'owner@example.com', options: { data: { nama: 'Owner', role: 'Owner', tenant_name: 'My Store', business_type: 'CAFE' } } }))
  })

  it('does not report success if authenticated signup has no provisioned tenant', async () => {
    mocks.signUp.mockResolvedValue({ data: { user: { id: 'owner' }, session: {} }, error: null })
    mocks.profile.mockResolvedValue({ data: null, error: null })
    await expect(api.auth.registerOwner(input)).rejects.toThrow(/profil|tenant/i)
  })

  it.each([
    { id: 'other-owner', tenant_id: 'tenant', branch_id: 'branch', role: 'Owner' },
    { id: 'owner', tenant_id: 'tenant', branch_id: 'branch', role: 'Owner', is_active: false },
  ])('rejects a mismatched or inactive server profile', async profile => {
    mocks.signUp.mockResolvedValue({ data: { user: { id: 'owner' }, session: {} }, error: null })
    mocks.profile.mockResolvedValue({ data: profile, error: null })
    await expect(api.auth.registerOwner(input)).rejects.toThrow(/profil/i)
  })

  it('propagates server-side provisioning failure', async () => {
    mocks.signUp.mockResolvedValue({ data: null, error: new Error('provisioning failed') })
    await expect(api.auth.registerOwner(input)).rejects.toThrow('provisioning failed')
    expect(mocks.profile).not.toHaveBeenCalled()
  })
})
