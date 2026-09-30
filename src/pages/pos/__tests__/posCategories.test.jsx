import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getCategoriesForPOS } from '../../../utils/posCategoryHelpers'

describe('TDD: Dynamic POS Category Badges from Admin Settings', () => {
  const mockMasterCategories = [
    { id: '1', nama_kategori: 'Kopi Nusantara', jenis: 'Kategori Menu Cafe', is_active: true },
    { id: '2', nama_kategori: 'Non-Coffee Signature', jenis: 'Kategori Menu Cafe', is_active: true },
    { id: '3', nama_kategori: 'Snack & Finger Food', jenis: 'Kategori Menu Cafe', is_active: true },
    { id: '4', nama_kategori: 'Cuci Hidrolik Salju', jenis: 'Kategori Layanan Carwash', is_active: true },
    { id: '5', nama_kategori: 'Poles & Nano Ceramic', jenis: 'Kategori Layanan Carwash', is_active: true },
    { id: '6', nama_kategori: 'Kategori Nonaktif', jenis: 'Kategori Menu Cafe', is_active: false },
    { id: '7', nama_kategori: 'Listrik & Utilitas', jenis: 'Pengeluaran Cafe', is_active: true },
  ]

  const mockMenuItems = [
    { nama_menu: 'Espresso', kategori: 'Kopi Nusantara' },
    { nama_menu: 'Matcha Latte', kategori: 'Non-Coffee Signature' },
    { nama_menu: 'Croissant', kategori: 'Pastry & Bakery' }, // Kategori yang ada di item tapi belum ada di master
  ]

  const mockCarwashPackages = [
    { nama_paket: 'Cuci Biasa', kategori: 'Cuci Hidrolik Salju' },
    { nama_paket: 'Detailing Mesin', kategori: 'Poles & Nano Ceramic' },
    { nama_paket: 'Fogging Anti-Bakteri', kategori: 'Interior Sanitasi' }, // Kategori kustom paket
  ]

  it('harus memuat kategori Cafe secara dinamis dari master_categories dan menuItems tanpa hardcode', () => {
    const categories = getCategoriesForPOS({
      type: 'CAFE',
      masterCategories: mockMasterCategories,
      items: mockMenuItems,
    })

    // Harus dimulai dengan SEMUA
    expect(categories[0]).toBe('SEMUA')

    // Harus memuat kategori aktif dari master_categories jenis Cafe
    expect(categories).toContain('Kopi Nusantara')
    expect(categories).toContain('Non-Coffee Signature')
    expect(categories).toContain('Snack & Finger Food')

    // Harus menyertakan kategori dari item menu yang tersimpan
    expect(categories).toContain('Pastry & Bakery')

    // JANGAN memuat kategori non-aktif
    expect(categories).not.toContain('Kategori Nonaktif')

    // JANGAN memuat kategori Carwash atau kategori Pengeluaran pada filter Cafe
    expect(categories).not.toContain('Cuci Hidrolik Salju')
    expect(categories).not.toContain('Listrik & Utilitas')
  })

  it('harus memuat kategori Carwash secara dinamis dari master_categories dan packages tanpa hardcode', () => {
    const categories = getCategoriesForPOS({
      type: 'CARWASH',
      masterCategories: mockMasterCategories,
      items: mockCarwashPackages,
    })

    // Harus dimulai dengan SEMUA
    expect(categories[0]).toBe('SEMUA')

    // Harus memuat kategori aktif dari master_categories jenis Carwash
    expect(categories).toContain('Cuci Hidrolik Salju')
    expect(categories).toContain('Poles & Nano Ceramic')

    // Harus menyertakan kategori dari paket cuci yang tersimpan
    expect(categories).toContain('Interior Sanitasi')

    // JANGAN memuat kategori Cafe
    expect(categories).not.toContain('Kopi Nusantara')
    expect(categories).not.toContain('Snack & Finger Food')
  })

  it('harus merefleksikan kategori baru yang ditambahkan di admin secara real-time', () => {
    const updatedMaster = [
      ...mockMasterCategories,
      { id: '8', nama_kategori: 'Mocktail Segar Baru', jenis: 'Kategori Menu Cafe', is_active: true }
    ]

    const categories = getCategoriesForPOS({
      type: 'CAFE',
      masterCategories: updatedMaster,
      items: mockMenuItems,
    })

    expect(categories).toContain('Mocktail Segar Baru')
  })
})
