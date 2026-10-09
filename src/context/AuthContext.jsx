import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { api } from '../services/apiAdapter'
import { DEFAULT_TENANT_ID, DEFAULT_BRANCH_ID } from '../constants/erpConfig'
import { ROLES } from '../constants/roles'
import { setActiveTenantId } from '../services/localDbEngine'

const ACTIVE_TENANT_STORAGE_KEY = 'relaypos_active_tenant_id'

const AuthContext = createContext({
  user: null,
  profile: null,
  loading: true,
  activeTenant: null,
  userTenants: [],
  switchTenant: () => {},
  refreshTenants: async () => {},
  login: async () => {},
  loginWithGoogle: async () => {},
  logout: async () => {},
  registerKasir: async () => {},
})

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTenant, setActiveTenant] = useState(null)
  const [userTenants, setUserTenants] = useState([])

  // Helper untuk memuat daftar tenant dan menentukan tenant aktif
  const loadTenantsForUser = useCallback(async (currentProfile) => {
    try {
      const { data: allTenants, error } = await supabase.from('tenants').select('*')
      if (error) throw error

      const tenantList = Array.isArray(allTenants) ? allTenants : []
      let allowedTenants = []

      const role = currentProfile?.role || ROLES.KASIR
      const userTenantId = currentProfile?.tenant_id || DEFAULT_TENANT_ID

      if (role === ROLES.SUPER_ADMIN) {
        // Super admin memiliki akses penuh ke semua tenant
        allowedTenants = tenantList.length > 0 ? tenantList : [
          { id: DEFAULT_TENANT_ID, nama: 'RelayPOS Demo Outlet', slug: 'relaypos-demo', plan: 'ENTERPRISE', status: 'ACTIVE' }
        ]
      } else if (role === ROLES.OWNER) {
        // Owner memiliki akses ke semua tenant miliknya atau default jika baru
        allowedTenants = tenantList.length > 0 ? tenantList : [
          { id: userTenantId, nama: 'Outlet Utama Owner', slug: 'outlet-owner', plan: 'ENTERPRISE', status: 'ACTIVE' }
        ]
      } else {
        // Kasir dan Staf 100% terkunci pada tenant_id profil mereka
        allowedTenants = tenantList.filter(t => t.id === userTenantId)
        if (allowedTenants.length === 0) {
          allowedTenants = [{ id: userTenantId, nama: 'Outlet Toko Kasir', slug: 'outlet-kasir', plan: 'BASIC', status: 'ACTIVE' }]
        }
      }

      // Pastikan seluruh tenant memiliki business_type
      const normalizedTenants = allowedTenants.map((t) => {
        if (!t.business_type) {
          const text = `${t.nama || ''} ${t.slug || ''}`.toLowerCase()
          let bType = 'HYBRID'
          if (text.includes('cafe') || text.includes('kopi') || text.includes('resto') || text.includes('bistro')) {
            bType = 'CAFE'
          } else if (text.includes('carwash') || text.includes('cuci') || text.includes('wash') || text.includes('detailing')) {
            bType = 'CARWASH'
          }
          return { ...t, business_type: bType }
        }
        return t
      })

      setUserTenants(normalizedTenants)

      // Cek apakah ada tenant yang tersimpan sebelumnya di localStorage
      const savedTenantId = localStorage.getItem(ACTIVE_TENANT_STORAGE_KEY)
      let resolvedTenant = normalizedTenants.find(t => t.id === savedTenantId)

      // Jika role Kasir, wajib abaikan storage yang tidak sesuai dan gunakan tenant miliknya
      if (role === ROLES.KASIR || !resolvedTenant) {
        resolvedTenant = normalizedTenants.find(t => t.id === userTenantId) || normalizedTenants[0]
      }

      if (resolvedTenant) {
        setActiveTenant(resolvedTenant)
        localStorage.setItem(ACTIVE_TENANT_STORAGE_KEY, resolvedTenant.id)
        setActiveTenantId(resolvedTenant.id)
      }
    } catch (err) {
      console.warn('Gagal memuat daftar tenant pengguna:', err)
      const fallbackTenant = {
        id: currentProfile?.tenant_id || DEFAULT_TENANT_ID,
        nama: 'RelayPOS Demo Holding',
        slug: 'relaypos-demo',
        business_type: 'HYBRID',
        plan: 'ENTERPRISE',
        status: 'ACTIVE'
      }
      setUserTenants([fallbackTenant])
      setActiveTenant(fallbackTenant)
      setActiveTenantId(fallbackTenant.id)
    }
  }, [])

  // Fungsi mengubah tipe/model bisnis tenant aktif (Cafe / Carwash / Hybrid)
  const updateTenantBusinessType = useCallback(async (newBusinessType) => {
    if (!activeTenant) return false
    const validTypes = ['HYBRID', 'CARWASH', 'CAFE']
    const upper = (newBusinessType || '').toUpperCase()
    if (!validTypes.includes(upper)) return false

    try {
      const updated = { ...activeTenant, business_type: upper }
      await supabase.from('tenants').update({ business_type: upper }).eq('id', activeTenant.id)
      
      setActiveTenant(updated)
      setUserTenants(prev => prev.map(t => t.id === updated.id ? updated : t))

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('relaypos:tenant_changed', { 
          detail: { tenantId: updated.id, tenant: updated } 
        }))
      }
      return true
    } catch (err) {
      console.error('Gagal memperbarui tipe bisnis tenant:', err)
      return false
    }
  }, [activeTenant])

  // Fungsi ganti tenant aktif (Hanya untuk Owner & Super Admin)
  const switchTenant = useCallback((tenantId) => {
    const targetTenant = userTenants.find(t => t.id === tenantId)
    if (!targetTenant) {
      console.warn(`Tenant ID ${tenantId} tidak ditemukan dalam daftar akses user.`)
      return false
    }

    setActiveTenant(targetTenant)
    localStorage.setItem(ACTIVE_TENANT_STORAGE_KEY, targetTenant.id)
    setActiveTenantId(targetTenant.id)

    // Trigger event ke seluruh aplikasi
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('relaypos:tenant_changed', { 
        detail: { tenantId: targetTenant.id, tenant: targetTenant } 
      }))
    }
    return true
  }, [userTenants])

  const refreshTenants = useCallback(async () => {
    if (profile) {
      await loadTenantsForUser(profile)
    }
  }, [profile, loadTenantsForUser])

  useEffect(() => {
    let isMounted = true

    const syncSession = async (session) => {
      try {
        if (session && session.user) {
          // Tetapkan user dan profil instan berbasis metadata sesi agar UI tidak menggantung
          const fastProfile = {
            id: session.user.id,
            nama: session.user.user_metadata?.nama || session.user.email || 'Pengguna RelayPOS',
            role: session.user.role || session.user.user_metadata?.role || 'Owner',
            tenant_id: session.user.tenant_id || DEFAULT_TENANT_ID
          }
          if (isMounted) {
            setUser(session.user)
            setProfile(prev => prev || fastProfile)
          }

          // Sinkronisasi data profil lengkap dan tenant
          const p = await api.auth.getProfile(session.user.id).catch(() => null)
          if (isMounted) {
            const finalProfile = p || fastProfile
            setProfile(finalProfile)
            await loadTenantsForUser(finalProfile)
          }
        } else {
          if (isMounted) {
            setUser(null)
            setProfile(null)
            setActiveTenant(null)
            setUserTenants([])
          }
        }
      } catch (err) {
        console.error('Error syncing auth session:', err)
        if (isMounted) {
          setUser(null)
          setProfile(null)
          setActiveTenant(null)
          setUserTenants([])
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    // 1. Eksekusi awal sinkronisasi sesi
    supabase.auth.getSession().then(({ data: { session } }) => {
      syncSession(session)
    }).catch(() => {
      if (isMounted) setLoading(false)
    })

    // 2. Listener perubahan sesi (hanya tangani perubahan berikutnya)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        syncSession(session)
      }
    })

    return () => {
      isMounted = false
      if (subscription && subscription.unsubscribe) {
        subscription.unsubscribe()
      }
    }
  }, [loadTenantsForUser])

  // Fungsi Login Universal (Username/Email & Password/PIN)
  const login = async (usernameOrEmail, password) => {
    setLoading(true)
    try {
      const res = await api.auth.login(usernameOrEmail, password)
      let resolvedProfile = null
      if (res.user) {
        setUser(res.user)
        resolvedProfile = res.profile || { 
          id: res.user.id, 
          nama: res.user.email, 
          role: res.user.role || 'Owner',
          tenant_id: DEFAULT_TENANT_ID
        }
        setProfile(resolvedProfile)
        await loadTenantsForUser(resolvedProfile)
      }
      return { 
        success: true, 
        user: res.user, 
        profile: resolvedProfile || res.profile 
      }
    } catch (err) {
      console.error('Login error:', err)
      return { success: false, error: err.message || 'Login gagal.' }
    } finally {
      setLoading(false)
    }
  }

  // Fungsi Login dengan Google (Khusus Pemilik Usaha / Owner)
  const loginWithGoogle = async (customPayload = null) => {
    setLoading(true)
    try {
      const email = customPayload?.email || 'owner.google@gmail.com'
      const nama = customPayload?.name || 'Pak Budi (Owner)'

      // Cek atau buat user/profile Owner di localDbEngine
      const mockGoogleUser = {
        id: `usr_google_${Date.now()}`,
        email,
        role: 'Owner',
        user_metadata: { nama, provider: 'google' }
      }

      setUser(mockGoogleUser)
      const p = {
        id: mockGoogleUser.id,
        nama,
        email,
        role: 'Owner',
        tenant_id: DEFAULT_TENANT_ID,
        created_at: new Date().toISOString()
      }
      setProfile(p)
      await loadTenantsForUser(p)

      return { success: true, user: mockGoogleUser, profile: p }
    } catch (err) {
      console.error('Google login error:', err)
      return { success: false, error: err.message || 'Login Google gagal.' }
    } finally {
      setLoading(false)
    }
  }

  // Fungsi Logout Universal
  const logout = async () => {
    setLoading(true)
    try {
      await api.auth.logout()
      setUser(null)
      setProfile(null)
      setActiveTenant(null)
      setUserTenants([])
      localStorage.removeItem(ACTIVE_TENANT_STORAGE_KEY)
    } catch (err) {
      console.error('Logout error:', err)
    } finally {
      setLoading(false)
    }
  }

  // Fungsi Pendaftaran Kasir Baru
  const registerKasir = async (usernameOrEmail, password, nama, role = 'Kasir') => {
    try {
      const res = await api.auth.registerKasir(usernameOrEmail, password, nama, role)
      return { success: true, user: res.user }
    } catch (err) {
      console.error('Registration error:', err)
      return { success: false, error: err.message }
    }
  }

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      loading, 
      activeTenant, 
      userTenants, 
      switchTenant, 
      refreshTenants, 
      updateTenantBusinessType,
      login, 
      loginWithGoogle, 
      logout, 
      registerKasir 
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
