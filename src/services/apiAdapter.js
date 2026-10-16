// API Adapter: Unified SaaS ERP Adapter (Cloud PostgreSQL & Local Sandbox)
// Compatible with both Supabase Cloud (with RLS) and local in-memory engine.

import { supabase, isCloudBackend } from '../supabaseClient'

export const BACKEND_PROVIDER = isCloudBackend ? 'cloud' : 'local'
export const isCloudflare = false

export const api = {
  isCloudflare: false,
  isCloud: isCloudBackend,

  // 1. AUTENTIKASI (DUAL-MODE CLOUD & LOCAL)
  auth: {
    async login(emailOrUsername, password) {
      const email = emailOrUsername.includes('@')
        ? emailOrUsername.trim()
        : `${emailOrUsername.trim().toLowerCase()}@jb.local`
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      const profile = (await this.getProfile(data.user.id)) || {
        id: data.user.id,
        nama: data.user.user_metadata?.nama || data.user.email,
        role: data.user.role || data.user.user_metadata?.role || 'Kasir',
        tenant_id: data.user.tenant_id,
      }
      return { success: true, user: data.user, profile }
    },

    async logout() {
      return await supabase.auth.signOut()
    },

    async getMe() {
      const { data } = await supabase.auth.getUser()
      if (!data?.user) return null
      const profile = (await this.getProfile(data.user.id)) || {
        id: data.user.id,
        nama: data.user.user_metadata?.nama || data.user.email,
        role: data.user.role || data.user.user_metadata?.role || 'Kasir',
        tenant_id: data.user.tenant_id,
      }
      return { user: data.user, profile }
    },

    async getProfile(userId) {
      const { data, error } = await supabase
        .from('profiles')
        .select('*', { ignoreTenant: true })
        .eq('id', userId)
        .maybeSingle()
      if (error) throw error
      return data || null
    },

    async registerKasir(emailOrUsername, password, nama, role = 'Kasir') {
      const email = emailOrUsername.includes('@')
        ? emailOrUsername.trim()
        : `${emailOrUsername.trim().toLowerCase()}@jb.local`
      const safeRole = role === 'Admin' ? 'Admin' : 'Kasir'
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { nama, role: safeRole } },
      })
      if (error) throw error
      return { success: true, user: data.user }
    },

    async registerOwner({ email, password, nama, tenantName, businessType }) {
      if (isCloudBackend) {
        // Alur registrasi Cloud Supabase Auth
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              nama: nama.trim(),
              role: 'Owner',
              tenant_name: tenantName.trim(),
              business_type: businessType || 'HYBRID',
            },
          },
        })
        if (error) throw error
        const profile = await this.getProfile(data.user?.id)
        return { success: true, user: data.user, profile }
      }

      // Alur registrasi Local Sandbox Engine
      const { data, error } = await supabase.auth.signUpOwner({
        email,
        password,
        nama,
        tenantName,
        businessType,
      })
      if (error) throw error
      const profile = await this.getProfile(data.user.id)
      return { success: true, user: data.user, profile, tenant: data.tenant }
    },

    async signInWithGoogle(options = {}) {
      if (isCloudBackend) {
        // Di mode Cloud: Eksekusi Google OAuth resmi via Supabase Auth
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/konsolidasi` : undefined,
            ...options,
          },
        })
        if (error) throw error
        return { success: true, data }
      }

      // Di mode Local/Sandbox: Eksekusi mock Google OAuth engine
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options,
      })
      if (error) throw error
      const profile = await this.getProfile(data.user.id)
      return { success: true, user: data.user, profile, tenant: data.tenant }
    },
  },

  // 2. MASTER DATA
  master: {
    async getKasir() {
      const { data, error } = await supabase.from('kasir').select('*').order('nama', { ascending: true })
      if (error) throw error
      return data || []
    },

    async getMetodeBayar() {
      const { data, error } = await supabase.from('metode_bayar').select('*').order('nama', { ascending: true })
      if (error) throw error
      return data || []
    },

    async getStokBarang() {
      const { data, error } = await supabase.from('stok_barang').select('*').order('nama_produk', { ascending: true })
      if (error) throw error
      return data || []
    },

    async getDaftarMenu() {
      const { data, error } = await supabase.from('daftar_harga_menu').select('*').order('daftar_menu', { ascending: true })
      if (error) throw error
      return data || []
    },

    async getResep() {
      const { data, error } = await supabase.from('resep').select('*').order('nama_menu', { ascending: true })
      if (error) throw error
      return data || []
    },

    async getKaryawanCuci() {
      const { data, error } = await supabase.from('karyawan_cuci').select('*').order('nama', { ascending: true })
      if (error) throw error
      return data || []
    },
  },

  // 3. TRANSAKSI
  transaksi: {
    async createStruk(payload) {
      const { data, error } = await supabase.from('struk').insert(payload)
      if (error) throw error
      return data
    },

    async getCarwashQueue(tanggal) {
      let query = supabase.from('carwash').select('*').order('created_at', { ascending: false })
      if (tanggal) query = query.eq('tanggal', tanggal)
      const { data, error } = await query
      if (error) throw error
      return data || []
    },
  },
}

export default api
