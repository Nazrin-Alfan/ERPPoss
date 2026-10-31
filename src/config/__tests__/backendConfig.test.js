import { describe, expect, it, vi } from 'vitest'
import { resolveBackendConfig, initializeBackendClient } from '../backendConfig.js'

const cloud = { VITE_BACKEND_PROVIDER: 'cloud', VITE_SUPABASE_URL: 'https://qa-project.supabase.co', VITE_SUPABASE_ANON_KEY: 'sb_publishable_test_public_key_12345' }
const jwt = role => `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ role }))}.test-signature`

describe('Backend mode separation', () => {
  it('keeps local mock available by default in development/tests', () => {
    expect(resolveBackendConfig({}).provider).toBe('local')
  })
  it('does not default production builds to local mock', () => {
    expect(() => resolveBackendConfig({}, { production: true })).toThrow(/VITE_SUPABASE/)
  })
  it('rejects a local production build without explicit sandbox opt-in', () => {
    expect(() => resolveBackendConfig({ VITE_BACKEND_PROVIDER: 'local' }, { production: true })).toThrow(/VITE_ALLOW_LOCAL_SANDBOX/)
  })
  it('permits an explicitly marked local demo build', () => {
    expect(resolveBackendConfig({ VITE_BACKEND_PROVIDER: 'local', VITE_ALLOW_LOCAL_SANDBOX: 'true' }, { production: true }).provider).toBe('local')
  })
  it('rejects unsupported backend modes rather than selecting mock', () => {
    expect(() => resolveBackendConfig({ VITE_BACKEND_PROVIDER: 'cluod' })).toThrow(/VITE_BACKEND_PROVIDER/)
  })
  it.each(['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'])('rejects missing %s in explicit cloud mode', name => {
    expect(() => resolveBackendConfig({ ...cloud, [name]: '' })).toThrow(name)
  })
  it('rejects placeholder settings without leaking them', () => {
    expect(() => resolveBackendConfig({ ...cloud, VITE_SUPABASE_URL: 'https://your-project.supabase.co' })).toThrow(/placeholder/i)
    expect(() => resolveBackendConfig({ ...cloud, VITE_SUPABASE_ANON_KEY: 'your-anon-key-here' })).toThrow(/VITE_SUPABASE_ANON_KEY/)
  })
  it('requires HTTPS on deployed cloud builds', () => {
    expect(() => resolveBackendConfig({ ...cloud, VITE_SUPABASE_URL: 'http://localhost:54321' }, { production: true })).toThrow(/HTTPS/)
    expect(resolveBackendConfig({ ...cloud, VITE_SUPABASE_URL: 'http://127.0.0.1:54321' }).provider).toBe('cloud')
    expect(() => resolveBackendConfig({ ...cloud, VITE_SUPABASE_URL: 'http://remote.example.com' })).toThrow(/HTTPS/)
  })
  it.each(['sb_secret_must_not_enter_browser', jwt('service_role')])('rejects server credentials without echoing their values', key => {
    let error
    try { resolveBackendConfig({ ...cloud, VITE_SUPABASE_ANON_KEY: key }) } catch (e) { error = e }
    expect(error).toBeInstanceOf(Error)
    expect(error.message).not.toContain(key)
  })
  it('accepts an anon JWT and publishable browser key', () => {
    expect(resolveBackendConfig({ ...cloud, VITE_SUPABASE_ANON_KEY: jwt('anon') }).provider).toBe('cloud')
    expect(resolveBackendConfig(cloud, { production: true }).provider).toBe('cloud')
  })
  it('uses only the cloud client for valid cloud configuration', () => {
    const localClient = {}; const expected = {}; const createCloudClient = vi.fn(() => expected)
    expect(initializeBackendClient(resolveBackendConfig(cloud), { localClient, createCloudClient })).toBe(expected)
    expect(createCloudClient).toHaveBeenCalledWith(cloud.VITE_SUPABASE_URL, cloud.VITE_SUPABASE_ANON_KEY, expect.any(Object))
  })
  it('fails closed when cloud initialization throws instead of returning local mock', () => {
    const secret = 'private-constructor-error-detail'
    expect(() => initializeBackendClient(resolveBackendConfig(cloud), { localClient: {}, createCloudClient: () => { throw Error(secret) } })).toThrow(/inisialisasi/i)
    try { initializeBackendClient(resolveBackendConfig(cloud), { localClient: {}, createCloudClient: () => { throw Error(secret) } }) } catch (e) { expect(e.message).not.toContain(secret) }
  })
})
