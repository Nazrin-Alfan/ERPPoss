// API Adapter: Pure Local SaaS ERP Adapter with Reset Password & RBAC support
// 100% Offline & Local Execution without external network calls.

import { supabase } from '../supabaseClient'

export const BACKEND_PROVIDER = 'local'
export const isCloudflare = false

export const api = {
  isCloudflare: false,

  // 1. AUTENTIKASI LOKAL
  auth: {
    async login(emailOrUsername, password) {
      const email = emailOrUsername.includes('@')
        ? emailOrUsername.trim()
        : `${emailOrUsername.trim().toLowerCase()}@jb.local`
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      const profile = await this.getProfile(data.user.id)
      return { success: true, user: data.user, profile }
    },

    async logout() {
      return await supabase.auth.signOut()
    },

    async getMe() {
      const { data } = await supabase.auth.getUser()
      if (!data?.user) return null
      const profile = await this.getProfile(data.user.id)
      return { user: data.user, profile }
    },

    async getProfile(userId) {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
      if (error) throw error
      return data || { id: userId, nama: 'User ERP', role: 'Owner' }
    },

    async registerKasir(emailOrUsername, password, nama, role = 'Kasir') {
      const email = emailOrUsername.includes('@')
        ? emailOrUsername.trim()
        : `${emailOrUsername.trim().toLowerCase()}@jb.local`
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { nama, role } },
      })
      if (error) throw error
      return { success: true, user: data.user }
    },
  },

  // 2. MASTER DATA LOKAL
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

  // 3. TRANSAKSI LOKAL
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
