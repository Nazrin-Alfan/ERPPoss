import { describe, it, expect, beforeEach } from 'vitest'
import { supabase } from '../../supabaseClient'
import { api } from '../apiAdapter'
import {
  setActiveTenantId,
  setActiveActorContext,
} from '../localDbEngine'
import {
  syncStaffToKaryawanKantor,
  formatStaffLoginHandle,
} from '../../utils/staffHelpers'

describe('Cross-Module Relational Invariants & Staff Lifecycle Matrix', () => {
  beforeEach(() => {
    if (supabase.erp && typeof supabase.erp.resetDatabase === 'function') {
      supabase.erp.resetDatabase()
    }
  })

  it('TC_01 [HAPPY_PATH & MULTI-TENANT]: allows two different tenants to register cashiers with the same username without collision and syncs profiles, kasir, and karyawan_kantor', async () => {
    // Provision two separate tenants via registerOwner
    const ownerAlpha = await api.auth.registerOwner({
      email: 'owner.alpha@toko.id',
      password: 'password123',
      nama: 'Owner Alpha',
      tenantName: 'Alpha Carwash',
      businessType: 'HYBRID',
    })
    const tenantAlphaId = ownerAlpha.profile.tenant_id

    const ownerBeta = await api.auth.registerOwner({
      email: 'owner.beta@toko.id',
      password: 'password123',
      nama: 'Owner Beta',
      tenantName: 'Beta Kopi',
      businessType: 'HYBRID',
    })
    const tenantBetaId = ownerBeta.profile.tenant_id

    expect(tenantAlphaId).not.toBe(tenantBetaId)

    // Switch context to Owner Alpha and register cashier username "kasir1"
    setActiveTenantId(tenantAlphaId)
    setActiveActorContext({
      userId: ownerAlpha.profile.id,
      role: 'Owner',
      tenant_id: tenantAlphaId,
      branchId: ownerAlpha.profile.branch_id,
      is_active: true,
    })

    const staffAlpha = await api.auth.registerKasir(
      'kasir1',
      'password123',
      'BUDI ALPHA',
      'Kasir',
      tenantAlphaId
    )
    expect(staffAlpha.success).toBe(true)
    expect(staffAlpha.user.role).toBe('Kasir')
    expect(staffAlpha.user.tenant_id).toBe(tenantAlphaId)
    expect(staffAlpha.user.email).toContain('@pos.internal')
    expect(formatStaffLoginHandle(staffAlpha.user.email)).toBe('kasir1')

    // Duplicate username "kasir1" inside the SAME tenant (Alpha) must be rejected
    await expect(
      api.auth.registerKasir('kasir1', 'password123', 'BUDI DUPLIKAT', 'Kasir', tenantAlphaId)
    ).rejects.toThrow(/sudah digunakan|sudah terdaftar/i)

    // Switch context to Owner Beta and register cashier with the SAME username "kasir1"
    setActiveTenantId(tenantBetaId)
    setActiveActorContext({
      userId: ownerBeta.profile.id,
      role: 'Owner',
      tenant_id: tenantBetaId,
      branchId: ownerBeta.profile.branch_id,
      is_active: true,
    })

    const staffBeta = await api.auth.registerKasir(
      'kasir1',
      'password123',
      'BUDI BETA',
      'Kasir',
      tenantBetaId
    )
    expect(staffBeta.success).toBe(true)
    expect(staffBeta.user.role).toBe('Kasir')
    expect(staffBeta.user.tenant_id).toBe(tenantBetaId)
    expect(staffBeta.user.email).not.toBe(staffAlpha.user.email)

    // Verify atomic sync in tenant Alpha across profiles, kasir, and karyawan_kantor
    setActiveTenantId(tenantAlphaId)
    setActiveActorContext({
      userId: ownerAlpha.profile.id,
      role: 'Owner',
      tenant_id: tenantAlphaId,
      branchId: ownerAlpha.profile.branch_id,
      is_active: true,
    })
    const { data: alphaKasir } = await supabase.from('kasir').select('*').eq('tenant_id', tenantAlphaId)
    const { data: alphaKk } = await supabase.from('karyawan_kantor').select('*').eq('tenant_id', tenantAlphaId)

    expect(alphaKasir.some((k) => k.nama === 'BUDI ALPHA' && k.is_active !== false)).toBe(true)
    expect(alphaKk.some((k) => k.nama === 'BUDI ALPHA' && k.role === 'Kasir' && k.is_active !== false)).toBe(true)
  })

  it('TC_02 [ROLE_SYNC_INVARIANT]: allows Owner to change non-Owner staff role and atomically syncs profiles, karyawan_kantor, and kasir active status', async () => {
    const owner = await api.auth.registerOwner({
      email: 'owner.sync@toko.id',
      password: 'password123',
      nama: 'Owner Sync',
      tenantName: 'Sync Store',
      businessType: 'HYBRID',
    })
    const tenantId = owner.profile.tenant_id

    setActiveTenantId(tenantId)
    setActiveActorContext({
      userId: owner.profile.id,
      role: 'Owner',
      tenant_id: tenantId,
      branchId: owner.profile.branch_id,
      is_active: true,
    })

    const reg = await api.auth.registerKasir('rina', 'password123', 'RINA SARI', 'Kasir', tenantId)
    const staffId = reg.user.id

    // Promote RINA SARI from Kasir -> Admin
    const updateRes = await api.auth.manageStaff({
      staffId,
      action: 'UPDATE_ROLE',
      newRole: 'Admin',
    })
    expect(updateRes.success).toBe(true)
    expect(updateRes.new_role).toBe('Admin')

    const updatedProfile = await api.auth.getProfile(staffId)
    expect(updatedProfile.role).toBe('Admin')

    const { data: kkRows } = await supabase.from('karyawan_kantor').select('*').eq('tenant_id', tenantId)
    const rinaKk = kkRows.find((k) => k.nama === 'RINA SARI')
    expect(rinaKk).toBeDefined()
    expect(rinaKk.role).toBe('Admin')

    const { data: kasirRows } = await supabase.from('kasir').select('*').eq('tenant_id', tenantId)
    const rinaKasir = kasirRows.find((k) => k.nama === 'RINA SARI')
    expect(rinaKasir).toBeDefined()
    expect(rinaKasir.is_active).toBe(false)
  })

  it('TC_03 [SECURITY_CO_OWNER_PROTECTION]: prevents an Owner from deleting, deactivating, or changing the role of a Co-Owner', async () => {
    const owner1 = await api.auth.registerOwner({
      email: 'owner1@coowner.id',
      password: 'password123',
      nama: 'OWNER SATU',
      tenantName: 'CoOwner Store',
      businessType: 'HYBRID',
    })
    const tenantId = owner1.profile.tenant_id

    setActiveTenantId(tenantId)
    setActiveActorContext({
      userId: owner1.profile.id,
      role: 'Owner',
      tenant_id: tenantId,
      branchId: owner1.profile.branch_id,
      is_active: true,
    })

    // Register a second Owner (Co-Owner) in the same tenant
    const owner2 = await api.auth.registerKasir(
      'owner2@coowner.id',
      'password123',
      'OWNER DUA',
      'Owner',
      tenantId
    )
    const owner2Id = owner2.user.id

    // Attempt by Owner 1 to downgrade Owner 2 to Kasir must fail with FORBIDDEN_MUTATE_CO_OWNER
    await expect(
      api.auth.manageStaff({
        staffId: owner2Id,
        action: 'UPDATE_ROLE',
        newRole: 'Kasir',
      })
    ).rejects.toThrow(/FORBIDDEN_MUTATE_CO_OWNER|tidak dapat diubah|sesama Owner/i)

    // Attempt by Owner 1 to deactivate Owner 2 must also fail with FORBIDDEN_MUTATE_CO_OWNER
    await expect(
      api.auth.manageStaff({
        staffId: owner2Id,
        action: 'DEACTIVATE',
      })
    ).rejects.toThrow(/FORBIDDEN_MUTATE_CO_OWNER|tidak dapat diubah|sesama Owner/i)

    // Verify Owner 2 remains untouched and active
    const owner2Profile = await api.auth.getProfile(owner2Id)
    expect(owner2Profile.role).toBe('Owner')
    expect(owner2Profile.is_active).not.toBe(false)
  })

  it('TC_04 [SOFT_DELETE_OPSI_A & ANTI_ZOMBIE]: deactivating staff from Karyawan Kantor or Akun Staf atomically deactivates profiles, kasir, and karyawan_kantor, prevents zombie re-sync, and blocks login', async () => {
    const owner = await api.auth.registerOwner({
      email: 'owner.soft@toko.id',
      password: 'password123',
      nama: 'Owner SoftDelete',
      tenantName: 'SoftDelete Store',
      businessType: 'HYBRID',
    })
    const tenantId = owner.profile.tenant_id

    setActiveTenantId(tenantId)
    setActiveActorContext({
      userId: owner.profile.id,
      role: 'Owner',
      tenant_id: tenantId,
      branchId: owner.profile.branch_id,
      is_active: true,
    })

    const staff = await api.auth.registerKasir('doni', 'password123', 'DONI KASIR', 'Kasir', tenantId)
    const staffId = staff.user.id

    // Execute Soft Delete Opsi A (DEACTIVATE)
    const deactRes = await api.auth.manageStaff({
      staffId,
      action: 'DEACTIVATE',
    })
    expect(deactRes.success).toBe(true)
    expect(deactRes.is_active).toBe(false)

    // 1. Check profile is_active === false
    const doniProfile = await api.auth.getProfile(staffId)
    expect(doniProfile.is_active).toBe(false)

    // 2. Check kasir is_active === false
    const { data: kasirRows } = await supabase.from('kasir').select('*').eq('tenant_id', tenantId)
    const doniKasir = kasirRows.find((k) => k.nama === 'DONI KASIR')
    expect(doniKasir.is_active).toBe(false)

    // 3. Check karyawan_kantor is_active === false
    const { data: kkRows } = await supabase.from('karyawan_kantor').select('*').eq('tenant_id', tenantId)
    const doniKk = kkRows.find((k) => k.nama === 'DONI KASIR')
    expect(doniKk.is_active).toBe(false)

    // 4. Verify syncStaffToKaryawanKantor does NOT re-insert deactivated staff ("Anti-Zombie" invariant)
    const { data: allProfiles } = await supabase.from('profiles').select('*').eq('tenant_id', tenantId)
    const { mergedList, newRecordsToInsert } = syncStaffToKaryawanKantor({
      staffProfiles: allProfiles,
      existingKaryawanKantor: kkRows,
      defaultTenantId: tenantId,
      defaultBranchId: owner.profile.branch_id,
    })
    expect(newRecordsToInsert.some((r) => r.nama === 'DONI KASIR')).toBe(false)
    expect(mergedList.some((r) => r.nama === 'DONI KASIR')).toBe(false)

    // 5. Verify deactivated cashier cannot log in
    await expect(api.auth.login('doni', 'password123')).rejects.toThrow(/dinonaktifkan|ACCOUNT_INACTIVE/i)
  })

  it('TC_05 [REGRESSION_MENU_RECIPE_CLEANUP]: deleting a menu atomically deletes all attached resep rows without leaving orphans', async () => {
    await supabase.from('daftar_harga_menu').insert({
      id_menu: 'KOPI SUSU AREN',
      daftar_menu: 'KOPI SUSU AREN',
      harga: 25000,
      kategori: 'Kopi (Coffee)',
      is_active: true,
    })
    await supabase.from('resep').insert([
      {
        id_menu: 'KOPI SUSU AREN',
        nama_menu: 'KOPI SUSU AREN',
        id_bahan_baku: 'ESPRESSO',
        nama_bahan: 'Espresso',
        jumlah: 30,
        satuan: 'Ml',
      },
      {
        id_menu: 'KOPI SUSU AREN',
        nama_menu: 'KOPI SUSU AREN',
        id_bahan_baku: 'GULA_AREN',
        nama_bahan: 'Gula Aren',
        jumlah: 20,
        satuan: 'Ml',
      },
    ])

    const delRes = await api.master.deleteMenuWithRecipe('KOPI SUSU AREN')
    expect(delRes.success).toBe(true)

    const { data: remainingMenu } = await supabase
      .from('daftar_harga_menu')
      .select('*')
      .eq('daftar_menu', 'KOPI SUSU AREN')
    const { data: remainingResep } = await supabase
      .from('resep')
      .select('*')
      .eq('nama_menu', 'KOPI SUSU AREN')

    expect(remainingMenu).toHaveLength(0)
    expect(remainingResep).toHaveLength(0)
  })
})
