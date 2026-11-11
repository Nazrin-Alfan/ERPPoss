import { describe, it, expect } from 'vitest'
import { supabase, isCloudBackend } from '../../supabaseClient'
import { api, BACKEND_PROVIDER } from '../apiAdapter'

describe('Dual-Mode Supabase Client & API Adapter Architecture', () => {
  it('1. should resolve active backend provider and supabase client instance correctly', () => {
    expect(BACKEND_PROVIDER).toBeDefined()
    expect(['cloud', 'local']).toContain(BACKEND_PROVIDER)
    expect(typeof isCloudBackend).toBe('boolean')
    expect(supabase).toBeDefined()
    expect(typeof supabase.from).toBe('function')
    expect(typeof supabase.auth).toBe('object')
  })

  it('2. should expose standard auth and master methods on apiAdapter', () => {
    expect(typeof api.auth.login).toBe('function')
    expect(typeof api.auth.logout).toBe('function')
    expect(typeof api.auth.getProfile).toBe('function')
    expect(typeof api.auth.registerKasir).toBe('function')
    expect(typeof api.auth.registerOwner).toBe('function')

    expect(typeof api.master.getKasir).toBe('function')
    expect(typeof api.master.getMetodeBayar).toBe('function')
    expect(typeof api.master.getStokBarang).toBe('function')
    expect(typeof api.master.getDaftarMenu).toBe('function')
  })

  it('3. should query profiles table via supabase interface without errors', async () => {
    const { data, error } = await supabase.from('profiles').select('*')
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
  })

  it('4. should register multiple Kasir accounts in the same tenant without overwriting or escalating role to Owner', async () => {
    const suffix = Date.now()
    const res1 = await api.auth.registerKasir(`kasir_a_${suffix}`, 'password123', 'KASIR A', 'Kasir')
    const res2 = await api.auth.registerKasir(`kasir_b_${suffix}`, 'password123', 'KASIR B', 'Kasir')

    expect(res1.success).toBe(true)
    expect(res2.success).toBe(true)
    expect(res1.user.role).toBe('Kasir')
    expect(res2.user.role).toBe('Kasir')
    expect(res1.user.tenant_id).toBe(res2.user.tenant_id)

    const { data: profiles } = await supabase.from('profiles').select('*')
    const foundA = profiles.find((p) => p.email?.startsWith(`kasir_a_${suffix}.`) && p.email?.endsWith('@pos.internal'))
    const foundB = profiles.find((p) => p.email?.startsWith(`kasir_b_${suffix}.`) && p.email?.endsWith('@pos.internal'))

    expect(foundA).toBeDefined()
    expect(foundB).toBeDefined()
    expect(foundA.role).toBe('Kasir')
    expect(foundB.role).toBe('Kasir')
    expect(foundA.tenant_id).toBe(foundB.tenant_id)
  })
})
