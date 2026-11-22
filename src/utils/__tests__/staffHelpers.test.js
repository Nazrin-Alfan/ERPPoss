import { describe, it, expect } from 'vitest'
import { syncStaffToKaryawanKantor, getRoleBadgeConfig } from '../staffHelpers'

describe('Staff to Karyawan Kantor Auto-Sync Architecture', () => {
  it('1. should auto-populate new staff profiles into karyawan_kantor without duplicates', () => {
    const existingKaryawanKantor = [
      { id: 'kk_1', nama: 'INDAH', role: 'Staff Kantor', source: 'manual' }
    ]

    const staffProfiles = [
      { id: 'usr_1', nama: 'ALEXSA', role: 'Kasir', email: 'alexsa@relaypos.com' },
      { id: 'usr_2', nama: 'INDAH', role: 'Owner', email: 'indah@relaypos.com' }, // duplicate name
      { id: 'usr_3', nama: 'SYAFA HAIKAL', role: 'Kasir', email: 'syafa@relaypos.com' }
    ]

    const { mergedList, newRecordsToInsert } = syncStaffToKaryawanKantor({
      staffProfiles,
      existingKaryawanKantor
    })

    // INDAH should not be duplicated, only 2 new staff inserted: ALEXSA & SYAFA HAIKAL
    expect(newRecordsToInsert).toHaveLength(2)
    expect(newRecordsToInsert.map(r => r.nama)).toEqual(['ALEXSA', 'SYAFA HAIKAL'])

    // Total merged should be 3 (ALEXSA, INDAH, SYAFA HAIKAL)
    expect(mergedList).toHaveLength(3)
    expect(mergedList[0].nama).toBe('ALEXSA')
    expect(mergedList[1].nama).toBe('INDAH')
    expect(mergedList[2].nama).toBe('SYAFA HAIKAL')

    // Each new record should have source 'staff_registration'
    expect(newRecordsToInsert[0].source).toBe('staff_registration')
    expect(newRecordsToInsert[0].role).toBe('Kasir')
  })

  it('2. should handle empty existing karyawan kantor by adding all valid staff profiles', () => {
    const staffProfiles = [
      { id: 'usr_1', nama: 'Rita', role: 'Kasir', email: 'rita@relaypos.com' },
      { id: 'usr_2', nama: 'YAZID', role: 'Owner', email: 'yazid@relaypos.com' }
    ]

    const { mergedList, newRecordsToInsert } = syncStaffToKaryawanKantor({
      staffProfiles,
      existingKaryawanKantor: []
    })

    expect(newRecordsToInsert).toHaveLength(2)
    expect(mergedList).toHaveLength(2)
    expect(mergedList.map(r => r.nama)).toEqual(['RITA', 'YAZID'])
  })

  it('3. should handle whitespace and case-insensitivity during deduplication', () => {
    const existing = [
      { id: 'kk_1', nama: 'syafa haikal  ', role: 'Kasir' }
    ]
    const staff = [
      { id: 'usr_1', nama: '  SYAFA HAIKAL', role: 'Kasir' }
    ]

    const { newRecordsToInsert, mergedList } = syncStaffToKaryawanKantor({
      staffProfiles: staff,
      existingKaryawanKantor: existing
    })

    expect(newRecordsToInsert).toHaveLength(0)
    expect(mergedList).toHaveLength(1)
  })

  it('4. should correctly return badge styling configs for roles', () => {
    const ownerBadge = getRoleBadgeConfig('Owner')
    expect(ownerBadge.label).toBe('Owner')
    expect(ownerBadge.bgClass).toContain('brand-blue')

    const kasirBadge = getRoleBadgeConfig('Kasir')
    expect(kasirBadge.label).toBe('Kasir')
    expect(kasirBadge.bgClass).toContain('brand-emerald')

    const defaultBadge = getRoleBadgeConfig('Manager Operasional')
    expect(defaultBadge.label).toBe('Manager Operasional')
  })

  it('5. should integrate seamlessly with database engine insert and query', async () => {
    const { createLocalClient } = await import('../../services/localDbEngine')
    const db = createLocalClient()

    // 1. Initial karyawan_kantor
    const { data: initialKk } = await db.from('karyawan_kantor').select('*')
    expect(initialKk.length).toBeGreaterThan(0)

    // 2. Register new staff via auth
    const { data: authData } = await db.auth.signUp({
      email: 'alexa@relaypos.com',
      password: 'password123',
      options: { data: { nama: 'ALEXA SYAFA', role: 'Kasir' } }
    })
    expect(authData.user).toBeDefined()

    // 3. Auto sync to karyawan_kantor
    const { data: profs } = await db.from('profiles').select('*')
    const { newRecordsToInsert } = syncStaffToKaryawanKantor({
      staffProfiles: profs,
      existingKaryawanKantor: initialKk
    })

    for (const rec of newRecordsToInsert) {
      await db.from('karyawan_kantor').insert(rec)
    }

    const { data: updatedKk } = await db.from('karyawan_kantor').select('*')
    const alexa = updatedKk.find(k => k.nama === 'ALEXA SYAFA')
    expect(alexa).toBeDefined()
    expect(alexa.role).toBe('Kasir')
    expect(alexa.source).toBe('staff_registration')
  }, 25000)

  it('6. should match existing karyawan_kantor by profile_id without duplicates when profile nama changes', () => {
    const BIMA_UUID = '33333333-3333-4333-8333-333333333333'
    const CINTYA_UUID = '44444444-4444-4444-8444-444444444444'
    const existingKaryawanKantor = [
      { id: 'kk_10', profile_id: BIMA_UUID, nama: 'BIMA LAMA', role: 'Kasir', source: 'staff_registration' },
    ]
    const staffProfiles = [
      { id: BIMA_UUID, nama: 'BIMA BARU', role: 'Admin', email: 'bima@relaypos.com' },
      { id: CINTYA_UUID, nama: 'CINTYA', role: 'Kasir', email: 'cintya@relaypos.com' },
    ]

    const { mergedList, newRecordsToInsert } = syncStaffToKaryawanKantor({
      staffProfiles,
      existingKaryawanKantor,
    })

    // BIMA_UUID matched by profile_id -> NOT inserted as a duplicate row
    expect(newRecordsToInsert).toHaveLength(1)
    expect(newRecordsToInsert[0].nama).toBe('CINTYA')
    expect(newRecordsToInsert[0].profile_id).toBe(CINTYA_UUID)

    const bimaRows = mergedList.filter(k => k.profile_id === BIMA_UUID)
    expect(bimaRows).toHaveLength(1)
  })
})
