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
})
