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
      const cleanUser = (emailOrUsername || '').trim()
      let email = cleanUser
      if (!cleanUser.includes('@')) {
        const knownRelayAccounts = ['superadmin', 'owner', 'admin', 'kasir']
        if (knownRelayAccounts.includes(cleanUser.toLowerCase())) {
          email = `${cleanUser.toLowerCase()}@relaypos.com`
        } else {
          email = `${cleanUser.toLowerCase()}@jb.local`
        }
      }
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

    async changePassword({ currentPassword, newPassword }) {
      if (typeof supabase.auth.changePassword === 'function') {
        return await supabase.auth.changePassword({ currentPassword, newPassword })
      }
      // Verify the old password against the authenticated account before changing it.
      // Never accept a caller-supplied email or trust a cached local session here.
      if (typeof currentPassword !== 'string' || !currentPassword) {
        throw new Error('Kata sandi saat ini wajib diisi.')
      }
      if (typeof newPassword !== 'string' || newPassword.length < 6) {
        throw new Error('Kata sandi baru minimal 6 karakter.')
      }
      const { data: currentData, error: currentError } = await supabase.auth.getUser()
      if (currentError) throw currentError
      const currentUser = currentData?.user
      if (!currentUser?.id || !currentUser.email) {
        throw new Error('Sesi tidak tersedia. Silakan masuk kembali.')
      }
      const { data: verifiedData, error: verificationError } = await supabase.auth.signInWithPassword({
        email: currentUser.email,
        password: currentPassword,
      })
      if (verificationError) throw verificationError
      if (verifiedData?.user?.id !== currentUser.id) {
        throw new Error('Verifikasi kata sandi saat ini gagal.')
      }
      const { data, error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      return { success: true, data }
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

    async registerKasir(emailOrUsername, password, nama, role = 'Kasir', tenantId = null) {
      const email = emailOrUsername.includes('@')
        ? emailOrUsername.trim()
        : `${emailOrUsername.trim().toLowerCase()}@jb.local`
      const allowedRoles = ['Kasir', 'Admin', 'Owner', 'Staff Kantor', 'Karyawan Cuci']
      const safeRole = allowedRoles.includes(role) ? role : 'Kasir'

      if (isCloudBackend) {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('fn_register_tenant_staff', {
          p_email: email,
          p_password: password,
          p_nama: nama,
          p_role: safeRole,
          p_tenant_id: tenantId || null,
          p_branch_id: null,
        })
        if (rpcErr) throw rpcErr
        return { success: true, user: rpcRes?.user || null }
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { nama, role: safeRole, ...(tenantId ? { tenant_id: tenantId } : {}) } },
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
        // Supabase may return a user without a session until email is confirmed.
        // RLS-protected profiles cannot be read before that confirmation.
        if (!data?.session) {
          return { success: true, user: data?.user || null, profile: null, requiresEmailConfirmation: true }
        }
        const profile = await this.getProfile(data.user?.id)
        if (!profile?.tenant_id || !profile?.branch_id || profile.role !== 'Owner') {
          throw new Error('Provisioning tenant belum lengkap. Hubungi administrator sebelum masuk ke toko.')
        }
        return { success: true, user: data.user, profile, requiresEmailConfirmation: false }
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

    async executeCheckout({ tenant_id, branch_id, struk_payload, cafe_items = [], carwash_payload = null }) {
      if (isCloudBackend) {
        const { data, error } = await supabase.rpc('fn_execute_checkout', {
          p_tenant_id: tenant_id,
          p_branch_id: branch_id || null,
          p_struk_payload: struk_payload,
          p_cafe_items: cafe_items,
          p_carwash_payload: carwash_payload
        })
        if (error) throw error
        return data
      } else {
        const strukRes = await supabase.from('struk').insert([struk_payload])
        if (strukRes.error) throw strukRes.error
        if (cafe_items && cafe_items.length > 0) {
          const cafeRes = await supabase.from('cafe').insert(cafe_items)
          if (cafeRes.error) throw cafeRes.error
        }
        if (carwash_payload) {
          const cwRes = await supabase.from('carwash').insert([carwash_payload])
          if (cwRes.error) throw cwRes.error
        }
        return { status: 'SUCCESS', id_struk: struk_payload.id_struk }
      }
    },

    async settlePendingBill({ tenant_id, branch_id, settle_payload }) {
      if (isCloudBackend) {
        const { data, error } = await supabase.rpc('fn_settle_pending_bill', {
          p_tenant_id: tenant_id,
          p_branch_id: branch_id || null,
          p_settle_payload: settle_payload
        })
        if (error) throw error
        return data
      } else {
        const { data, error } = await supabase.from('struk').update({
          status_bayar: 'Selesai',
          status_pembayaran: 'Selesai',
          metode_bayar: settle_payload.metode_bayar || 'CASH',
          metode_pembayaran: settle_payload.metode_bayar || 'CASH',
          total_tagihan: settle_payload.nominal_bayar,
          total: settle_payload.nominal_bayar,
          total_biaya: settle_payload.nominal_bayar,
          nominal_bayar: settle_payload.nominal_bayar,
          bayar: settle_payload.nominal_bayar,
          nominal_cash: settle_payload.nominal_cash || 0,
          nominal_qris: settle_payload.nominal_qris || 0,
          nominal_transfer: settle_payload.nominal_transfer || 0,
          uang_diterima: settle_payload.uang_diterima || settle_payload.nominal_bayar,
          kembalian: settle_payload.kembalian || 0,
          biaya_inap: settle_payload.surcharge?.enabled ? (settle_payload.surcharge?.nominal || 0) : 0,
          catatan_inap: settle_payload.surcharge?.enabled ? settle_payload.surcharge?.keterangan : null,
          waktu_dibayar: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }).eq('id_struk', settle_payload.id_struk)
        if (error) throw error

        await supabase.from('carwash').update({ status: 'Selesai' }).eq('id_struk', settle_payload.id_struk)
        await supabase.from('cafe').update({ status: 'Selesai' }).eq('id_struk', settle_payload.id_struk)

        return {
          success: true,
          status: 'COMPLETED',
          id_struk: settle_payload.id_struk,
          total_tagihan: settle_payload.nominal_bayar,
          nominal_bayar: settle_payload.nominal_bayar,
          uang_diterima: settle_payload.uang_diterima,
          kembalian: settle_payload.kembalian || 0,
          was_replayed: false
        }
      }
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
