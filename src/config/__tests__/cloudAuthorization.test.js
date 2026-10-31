import { describe, expect, it, vi } from 'vitest'
import { authorizeCloudSession, requireCloudProfile } from '../cloudAuthorization.js'
const session = { user: { id: 'user-a', role: 'authenticated', user_metadata: { role: 'Super Admin', tenant_id: 'foreign' } } }
const profile = { id: 'user-a', tenant_id: 'tenant-a', role: 'Kasir', is_active: true }
const tenants = [{ id: 'tenant-a', nama: 'Real outlet', status: 'active' }, { id: 'foreign', nama: 'Foreign outlet', status: 'active' }]
function deps(overrides = {}) { return { getProfile: vi.fn().mockResolvedValue(profile), listTenants: vi.fn().mockResolvedValue(tenants), commit: vi.fn(), clear: vi.fn(), ...overrides } }

describe('Authoritative cloud authorization bootstrap', () => {
  it('ignores session metadata and commits only own authoritative tenant', async () => {
    const d=deps();const identity=await authorizeCloudSession(session,d)
    expect(identity.profile).toEqual(profile)
    expect(identity.tenants).toEqual([tenants[0]])
    expect(identity.activeTenant.id).toBe('tenant-a')
    expect(d.commit).toHaveBeenCalledOnce()
  })
  it('does not expose any signed-in state until both profile and membership finish', async () => {
    let resolve;const pending=new Promise(r=>{resolve=r});const d=deps({listTenants:()=>pending});const task=authorizeCloudSession(session,d)
    await Promise.resolve();expect(d.commit).not.toHaveBeenCalled();resolve(tenants);await task;expect(d.commit).toHaveBeenCalledOnce()
  })
  it.each([null,{...profile,id:'other'},{...profile,role:'authenticated'},{...profile,tenant_id:null},{...profile,is_active:false}])('rejects unusable authoritative profiles and clears prior state', async invalid => {
    const d=deps({getProfile:vi.fn().mockResolvedValue(invalid)})
    await expect(authorizeCloudSession(session,d)).rejects.toThrow()
    expect(d.commit).not.toHaveBeenCalled();expect(d.clear).toHaveBeenCalledOnce()
  })
  it.each([[],[tenants[1]],null])('does not invent a demo tenant when membership is missing', async list => {
    const d=deps({listTenants:vi.fn().mockResolvedValue(list)})
    await expect(authorizeCloudSession(session,d)).rejects.toThrow()
    expect(d.commit).not.toHaveBeenCalled();expect(d.clear).toHaveBeenCalledOnce()
  })
  it('clears prior identity when profile query fails', async () => {
    const d=deps({getProfile:vi.fn().mockRejectedValue(new Error('database unavailable'))})
    await expect(authorizeCloudSession(session,d)).rejects.toThrow('database unavailable')
    expect(d.clear).toHaveBeenCalledOnce();expect(d.commit).not.toHaveBeenCalled()
  })
  it('clears prior identity when tenant query fails', async () => {
    const d=deps({listTenants:vi.fn().mockRejectedValue(new Error('RLS denied'))})
    await expect(authorizeCloudSession(session,d)).rejects.toThrow('RLS denied')
    expect(d.clear).toHaveBeenCalledOnce();expect(d.commit).not.toHaveBeenCalled()
  })
  it('clears state for absent session without calling data services', async () => {
    const d=deps();await expect(authorizeCloudSession(null,d)).resolves.toBeNull();expect(d.clear).toHaveBeenCalledOnce();expect(d.getProfile).not.toHaveBeenCalled()
  })
  it('ignores stale async results after logout or a newer auth event', async () => {
    const d=deps({isCurrent:()=>false});await authorizeCloudSession(session,d);expect(d.commit).not.toHaveBeenCalled();expect(d.clear).not.toHaveBeenCalled()
  })
  it('rejects missing profile when adapter requests an authoritative identity', () => {
    expect(()=>requireCloudProfile(null,session.user.id)).toThrow()
  })
})
