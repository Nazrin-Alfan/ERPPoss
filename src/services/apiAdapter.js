// API Adapter: Unified SaaS ERP Adapter (Cloud PostgreSQL & Local Sandbox)
// Compatible with both Supabase Cloud (with RLS) and local in-memory engine.

import { supabase, isCloudBackend } from '../supabaseClient'
import { ROLES } from '../constants/roles'

export const BACKEND_PROVIDER = isCloudBackend ? 'cloud' : 'local'
export const isCloudflare = false

export const api = {
  isCloudflare: false,
  isCloud: isCloudBackend,

  // 1. AUTENTIKASI (DUAL-MODE CLOUD & LOCAL)
  auth: {
    async login(emailOrUsername, password, tenantSlug = null) {
      const cleanUser = (emailOrUsername || '').trim().toLowerCase()
      const cleanSlug = tenantSlug ? String(tenantSlug).trim().toLowerCase().replace(/[^a-z0-9-]/g, '') : ''
      if (!cleanUser) {
        throw new Error('Username atau email wajib diisi.')
      }

      let email = cleanUser
      if (cleanUser.includes('@')) {
        const [localPart, domainPart] = cleanUser.split('@')
        email = (localPart && domainPart && !domainPart.includes('.'))
          ? `${localPart}.${domainPart}@pos.internal`
          : cleanUser
      } else if (!isCloudBackend && !cleanSlug && ['superadmin', 'owner', 'admin', 'kasir'].includes(cleanUser)) {
        email = `${cleanUser}@relaypos.com`
      } else if (cleanSlug) {
        email = `${cleanUser}.${cleanSlug}@pos.internal`
      } else if (cleanUser.includes('.')) {
        email = `${cleanUser}@pos.internal`
      } else {
        email = `${cleanUser}@jb.local`
      }

      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      const profile = await this.getProfile(data.user.id)
      if (!profile && isCloudBackend) {
        await Promise.resolve(supabase.auth.signOut?.({ scope: 'local' })).catch(() => {})
        throw new Error('Profil akun tidak ditemukan. Hubungi Owner toko.')
      }
      const resolvedProfile = profile || {
        id: data.user.id,
        nama: data.user.email,
        role: ROLES.KASIR,
        tenant_id: null,
      }
      if (resolvedProfile?.is_active === false) {
        await supabase.auth.signOut()
        throw new Error('ACCOUNT_INACTIVE: Akun staf ini telah dinonaktifkan oleh Owner.')
      }
      return { success: true, user: data.user, profile: resolvedProfile }
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
      if (typeof newPassword !== 'string' || newPassword.length < 8) {
        throw new Error('Kata sandi baru minimal 8 karakter.')
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
      if (typeof supabase.auth.signOut === 'function') {
        await Promise.resolve(supabase.auth.signOut({ scope: 'others' })).catch(() => {})
      }
      return { success: true, data }
    },

    async forgotPassword(email) {
      const cleanEmail = String(email || '').trim().toLowerCase()
      if (!cleanEmail || !cleanEmail.includes('@')) {
        throw new Error('Alamat email yang valid wajib diisi.')
      }
      if (isCloudBackend) {
        const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/reset-password` : undefined
        const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo })
        if (error) throw error
        return { success: true, emailSent: true }
      }
      if (typeof supabase.auth.forgotPassword === 'function') {
        return await supabase.auth.forgotPassword(cleanEmail)
      }
      return { success: true, emailSent: true }
    },

    async resetPassword({ newPassword, token = null }) {
      if (typeof newPassword !== 'string' || newPassword.length < 8) {
        throw new Error('Kata sandi baru minimal 8 karakter.')
      }
      if (isCloudBackend) {
        const { data, error } = await supabase.auth.updateUser({ password: newPassword })
        if (error) throw error
        if (typeof supabase.auth.signOut === 'function') {
          await Promise.resolve(supabase.auth.signOut({ scope: 'global' })).catch(() => {})
        }
        return { success: true, data }
      }
      if (typeof supabase.auth.resetPassword === 'function') {
        return await supabase.auth.resetPassword({ newPassword, token })
      }
      const { data, error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      return { success: true, data }
    },

    async getMe() {
      const { data } = await supabase.auth.getUser()
      if (!data?.user) return null
      const profile = await this.getProfile(data.user.id)
      if (!profile) {
        if (isCloudBackend) return null
        return {
          user: data.user,
          profile: {
            id: data.user.id,
            nama: data.user.email,
            role: ROLES.KASIR,
            tenant_id: null,
          },
        }
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

    async registerKasir(emailOrUsername, password, nama, role = 'Kasir', tenantId = null, branchId = null) {
      const cleanInput = String(emailOrUsername || '').trim()
      const allowedRoles = ['Kasir', 'Admin', 'Admin Pusat', 'Owner', 'Staff Kantor', 'Karyawan Cuci']
      const safeRole = allowedRoles.includes(role) ? role : 'Kasir'

      if (isCloudBackend) {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('fn_register_tenant_staff', {
          p_email: cleanInput,
          p_password: password,
          p_nama: nama,
          p_role: safeRole,
          p_tenant_id: tenantId || null,
          p_branch_id: branchId || null,
        })
        if (rpcErr) throw rpcErr
        return { success: true, user: rpcRes?.user || null }
      }

      const { data, error } = await supabase.auth.signUp({
        email: cleanInput,
        password,
        options: {
          data: {
            nama,
            role: safeRole,
            ...(tenantId ? { tenant_id: tenantId } : {}),
            ...(branchId ? { branch_id: branchId } : {}),
          },
        },
      })
      if (error) throw error
      return { success: true, user: data.user }
    },

    async manageStaff({ staffId, action, newRole = null }) {
      const { data, error } = await supabase.rpc('fn_manage_tenant_staff', {
        p_staff_id: staffId,
        p_action: action,
        p_new_role: newRole,
      })
      if (error) throw error
      return data || { success: true }
    },

    async registerOwner({ email, password, nama, tenantName, businessType }) {
      if (isCloudBackend) {
        // Alur registrasi Cloud Supabase Auth
        const redirectTo = typeof window !== 'undefined' && window.location?.origin
          ? `${window.location.origin}/`
          : undefined
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            ...(redirectTo ? { emailRedirectTo: redirectTo } : {}),
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
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(
            'relaypos_google_oauth_intent',
            JSON.stringify({
              mode: options.mode || 'login',
              tenantName: options.tenantName || '',
              businessType: options.businessType || 'HYBRID',
              nama: options.nama || '',
            })
          )
        }
      } catch {
        // ignore storage errors
      }

      if (isCloudBackend) {
        // Di mode Cloud: Eksekusi Google OAuth resmi via Supabase Auth
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/` : undefined,
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

    async deleteMenuWithRecipe(menuOrName) {
      const isObj = menuOrName && typeof menuOrName === 'object'
      const menuUuid = isObj ? menuOrName.id : null
      const cleanMenuName = String(
        isObj ? (menuOrName.nama_menu || menuOrName.daftar_menu || '') : (menuOrName || '')
      ).trim()
      const isUuid = (val) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)

      if (!cleanMenuName && !isUuid(menuUuid)) {
        throw new Error('Nama menu atau ID menu wajib diisi.')
      }

      if (isUuid(menuUuid)) {
        // 1. Hapus komposisi resep berdasarkan menu_id (dan legacy nama_menu tanpa menu_id)
        const { error: resepErr } = await supabase
          .from('resep')
          .delete()
          .eq('menu_id', menuUuid)
        if (resepErr) throw resepErr

        if (cleanMenuName) {
          const { error: legacyResepErr } = await supabase
            .from('resep')
            .delete()
            .is('menu_id', null)
            .eq('nama_menu', cleanMenuName)
          if (legacyResepErr) throw legacyResepErr
        }

        // 2. Hapus item menu dari daftar_harga_menu berdasarkan PK UUID id
        const { error: menuErr } = await supabase
          .from('daftar_harga_menu')
          .delete()
          .eq('id', menuUuid)
        if (menuErr) throw menuErr

        return { success: true, deleted_id: menuUuid, deleted_menu: cleanMenuName }
      }

      // Fallback untuk pemanggil string lama (misal test atau integrasi legacy)
      const { error: resepErr } = await supabase
        .from('resep')
        .delete()
        .eq('nama_menu', cleanMenuName)
      if (resepErr) throw resepErr

      const { error: menuErr } = await supabase
        .from('daftar_harga_menu')
        .delete()
        .eq('daftar_menu', cleanMenuName)
      if (menuErr) throw menuErr

      return { success: true, deleted_menu: cleanMenuName }
    },

    async replaceCarwashPackageRecipes({
      savedPkgId = null,
      packageName,
      previousPackageName = null,
      resepBahan = [],
      stokBahan = []
    }) {
      const isUuid = (val) =>
        typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)
      const pkgIsUuid = isUuid(savedPkgId)

      if (pkgIsUuid) {
        const { error: delPkgErr } = await supabase.from('resep').delete().eq('carwash_package_id', savedPkgId)
        if (delPkgErr) throw delPkgErr

        if (previousPackageName) {
          const { error: delPrevErr } = await supabase
            .from('resep')
            .delete()
            .is('carwash_package_id', null)
            .eq('nama_menu', previousPackageName)
          if (delPrevErr) throw delPrevErr
        }

        const { error: delCurrErr } = await supabase
          .from('resep')
          .delete()
          .is('carwash_package_id', null)
          .eq('nama_menu', packageName)
        if (delCurrErr) throw delCurrErr
      } else {
        const { error: delNameErr } = await supabase.from('resep').delete().eq('nama_menu', packageName)
        if (delNameErr) throw delNameErr
      }

      const validRows = (resepBahan || [])
        .filter((b) => b?.nama_bahan && parseFloat(b.jumlah) > 0)
        .map((b, idx) => {
          const matchedBahan = (stokBahan || []).find(
            (s) =>
              (b.stok_barang_id && s.id === b.stok_barang_id) ||
              s.nama_bahan === b.nama_bahan ||
              s.nama_produk === b.nama_bahan ||
              s.nama_barang === b.nama_bahan
          )
          const resolvedStokId = b.stok_barang_id || matchedBahan?.id || null
          const qty = parseFloat(b.jumlah)
          return {
            id_resep: `rsp_cw_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
            id_menu: packageName,
            nama_menu: packageName,
            daftar_menu: packageName,
            ...(pkgIsUuid ? { carwash_package_id: savedPkgId } : {}),
            ...(isUuid(resolvedStokId) ? { stok_barang_id: resolvedStokId } : {}),
            id_bahan_baku: b.id_bahan_baku || matchedBahan?.id_bahan_baku || matchedBahan?.id_barang || null,
            nama_bahan: b.nama_bahan,
            jumlah: qty,
            jumlah_dibutuhkan: qty,
            satuan: b.satuan || 'Liter'
          }
        })

      if (validRows.length > 0) {
        const { error: insertErr } = await supabase.from('resep').insert(validRows)
        if (insertErr) throw insertErr
      }

      return { success: true, count: validRows.length }
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
        let redeemedLogId = null
        if (struk_payload?.redeem_loyalty) {
          if (!carwash_payload?.plat) {
            throw new Error('LOYALTY_REWARD_UNAVAILABLE: Klaim hadiah loyalty memerlukan transaksi layanan cuci kendaraan.')
          }
          const { data: redeemData, error: redeemErr } = await supabase.rpc('redeem_customer_reward', {
            p_tenant_id: tenant_id,
            p_plat: carwash_payload.plat,
            p_notes: `Klaim hadiah loyalty saat checkout POS (${struk_payload.id_struk})`,
            p_nama_pelanggan: struk_payload.nama_pelanggan || carwash_payload.plat,
            p_id_struk: struk_payload.id_struk,
            p_request_key: struk_payload.id_struk,
          })
          if (redeemErr) throw redeemErr
          redeemedLogId = redeemData?.redemption_id || null
        }

        try {
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
        } catch (err) {
          // Roll back local loyalty redemption if checkout fails before completion
          if (redeemedLogId) {
            await supabase.from('crm_loyalty_logs').delete().eq('id', redeemedLogId).catch(() => {})
          }
          throw err
        }
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

    async voidTransaction({ tenant_id, id_struk, reason = 'Dibatalkan oleh Kasir/Owner', options = {} }) {
      const useCloud = options?.isCloud !== undefined ? Boolean(options.isCloud) : isCloudBackend
      if (useCloud && typeof supabase.rpc === 'function') {
        const { data, error } = await supabase.rpc('fn_void_or_cancel_receipt', {
          p_tenant_id: tenant_id,
          p_id_struk: id_struk,
          p_reason: reason || 'Dibatalkan oleh Kasir/Owner'
        })
        if (error) throw error
        return data || { success: true }
      }

      const { error: strukErr } = await supabase
        .from('struk')
        .update({ status_bayar: 'Batal', catatan: reason })
        .eq('id_struk', id_struk)
      if (strukErr) throw strukErr

      const { error: cafeErr } = await supabase
        .from('cafe')
        .update({ status: 'Batal' })
        .eq('id_struk', id_struk)
      if (cafeErr) throw cafeErr

      const { error: cwErr } = await supabase
        .from('carwash')
        .update({ status: 'Batal', gaji_anggota: 0, gaji_pencuci: 0 })
        .eq('id_struk', id_struk)
      if (cwErr) throw cwErr

      return { success: true, id_struk }
    },

    async closeCashierShift({
      tenant_id,
      branch_id = null,
      kasir = 'KASIR',
      tanggal,
      modal_awal = 0,
      kas_fisik = 0,
      catatan = ''
    }) {
      const { data, error } = await supabase.rpc('fn_close_cashier_shift', {
        p_tenant_id: tenant_id,
        p_branch_id: branch_id || null,
        p_kasir: kasir || 'KASIR',
        p_tanggal: tanggal,
        p_modal_awal: Number(modal_awal || 0),
        p_kas_fisik: Number(kas_fisik || 0),
        p_catatan: catatan || ''
      })
      if (error) throw error
      return data || { success: true }
    },

    async recordMoneyExchange({
      tenant_id,
      branch_id = null,
      kasir = 'KASIR',
      cash_out = 0,
      qris_in = 0,
      customer = 'Umum',
      tanggal
    }) {
      const { data, error } = await supabase.rpc('fn_record_cashier_money_exchange', {
        p_tenant_id: tenant_id,
        p_branch_id: branch_id || null,
        p_kasir: kasir || 'KASIR',
        p_cash_out: Number(cash_out || 0),
        p_qris_in: Number(qris_in || 0),
        p_customer: customer || 'Umum',
        p_tanggal: tanggal
      })
      if (error) throw error
      if (data && data.success === false) {
        throw new Error(data.message || 'Gagal mencatat mutasi tukar uang.')
      }
      return data || { success: true }
    },

    async getPendingBills({ tenant_id = null } = {}) {
      let query = supabase
        .from('struk')
        .select(`
          id_struk,
          tanggal,
          jam,
          kasir,
          total_tagihan,
          subtotal,
          diskon,
          diskon_cafe,
          diskon_carwash,
          pajak,
          metode_bayar,
          created_at,
          cafe (nama_menu, qty, harga_satuan),
          carwash (paket, plat, harga, model, no_telepon, kehadiran)
        `)
        .eq('status_bayar', 'Pending')
        .order('tanggal', { ascending: false })

      if (tenant_id && query && typeof query.eq === 'function') {
        query = query.eq('tenant_id', tenant_id)
      }

      const { data, error } = await query
      if (error) throw error
      return Array.isArray(data) ? data : []
    },
  },
}

export default api
