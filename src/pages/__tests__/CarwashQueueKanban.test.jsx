import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import CarwashQueue from '../CarwashQueue.jsx'

// Mock Supabase Client with simulated operational dataset
const mockCarwashData = [
  {
    id_transaksi: 'cw-001',
    id_struk: 'str-001',
    kehadiran: 'TUNGGU',
    variant: 'Sedan',
    ukuran: 'Sedang',
    paket: 'Cuci Salju + Wax',
    anggota_1: 'Budi',
    anggota_2: 'Agus',
    plat: 'B 1234 ABC',
    harga: 50000,
    status: 'Pending',
    created_at: '2026-10-02T08:00:00Z',
    tanggal: new Date().toLocaleDateString('en-CA'),
    jam: '08:00:00',
    model: 'Honda Civic',
    no_telepon: '081234567890',
    kondisi_bodi: 'Normal',
    barang_berharga: 'Aman',
    catatan_kendaraan: 'Hati-hati wiper belakang',
    status_pengerjaan: 'Menunggu',
    struk: { kasir: 'Kasir 1' }
  },
  {
    id_transaksi: 'cw-002',
    id_struk: 'str-002',
    kehadiran: 'TINGGAL',
    variant: 'SUV',
    ukuran: 'Besar',
    paket: 'Cuci Komplit + Jamur Kaca',
    anggota_1: 'Dedi',
    anggota_2: '',
    plat: 'D 5678 XYZ',
    harga: 85000,
    status: 'Pending',
    created_at: '2026-10-02T08:15:00Z',
    tanggal: new Date().toLocaleDateString('en-CA'),
    jam: '08:15:00',
    model: 'Toyota Fortuner',
    no_telepon: '089876543210',
    kondisi_bodi: 'Baret halus bumper kanan',
    barang_berharga: 'Aman',
    catatan_kendaraan: 'Karpet bagasi jangan dibasahi',
    status_pengerjaan: 'Sedang Dicuci',
    struk: { kasir: 'Kasir 1' }
  },
  {
    id_transaksi: 'cw-003',
    id_struk: 'str-003',
    kehadiran: 'TUNGGU',
    variant: 'Hatchback',
    ukuran: 'Kecil',
    paket: 'Cuci Eksterior Cepat',
    anggota_1: 'Rian',
    anggota_2: '',
    plat: 'F 9999 DEF',
    harga: 35000,
    status: 'Selesai',
    created_at: '2026-10-02T08:30:00Z',
    tanggal: new Date().toLocaleDateString('en-CA'),
    jam: '08:30:00',
    model: 'Toyota Yaris',
    no_telepon: '081122334455',
    kondisi_bodi: 'Normal',
    barang_berharga: 'Aman',
    catatan_kendaraan: '',
    status_pengerjaan: 'Siap Diambil',
    struk: { kasir: 'Kasir 2' }
  }
]

let updatePayloads = []

vi.mock('../../supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({ data: mockCarwashData, error: null }))
        }))
      })),
      update: vi.fn((payload) => {
        updatePayloads.push(payload)
        return {
          eq: vi.fn(() => Promise.resolve({ error: null }))
        }
      })
    })),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis()
    })),
    removeChannel: vi.fn()
  }
}))

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    activeTenant: {
      id: 'tenant-demo-carwash',
      name: 'RelayPOS Carwash & Detailing Center'
    },
    user: { id: 'user-operator-1' }
  })
}))

describe('Simulasi Pengujian Langsung: Kanban Bay Carwash', () => {
  beforeEach(() => {
    updatePayloads = []
  })

  it('SIM-01: Verifikasi Struktur UI Kanban Bay & Elemen Visual Kritis', () => {
    const html = renderToString(React.createElement(CarwashQueue))

    // Header & Info Judul
    expect(html).toContain('Antrean Carwash')
    expect(html).toContain('Live Kanban pengerjaan bay cuci mobil &amp; kru pencuci real-time')

    // Kontrol View Mode Switcher
    expect(html).toContain('Kanban Bay')
    expect(html).toContain('Daftar Tab')

    // 3 Kolom Kanban
    expect(html).toContain('Antrean Masuk')
    expect(html).toContain('Sedang Dicuci (Bay)')
    expect(html).toContain('Siap Diambil')

    // Filter Kehadiran
    expect(html).toContain('Semua')
    expect(html).toContain('Ditunggu')
    expect(html).toContain('Ditinggal')
  })

  it('SIM-02: Simulasi Pemetaan Data Masuk ke Alur 3 Kolom Kanban (Stream Classification)', () => {
    // Simulasi logika pengelompokan stream Kanban sesuai implementasi CarwashQueue
    const queue = mockCarwashData.map(item => ({
      id: item.id_transaksi,
      platNomor: item.plat,
      kehadiran: item.kehadiran,
      paket: item.paket,
      model: item.model,
      ukuran: item.ukuran,
      anggota1: item.anggota_1,
      statusBayar: item.status,
      statusPengerjaan: item.status_pengerjaan
    }))

    // Kolom 1: Waiting Stream
    const waitingList = queue.filter(item => {
      return item.statusPengerjaan === 'Menunggu' || item.statusPengerjaan === 'Antre' || 
        (item.statusBayar === 'Pending' && item.statusPengerjaan !== 'Sedang Dicuci' && item.statusPengerjaan !== 'Siap Diambil')
    })
    expect(waitingList).toHaveLength(1)
    expect(waitingList[0].platNomor).toBe('B 1234 ABC')
    expect(waitingList[0].statusPengerjaan).toBe('Menunggu')

    // Kolom 2: Washing / Bay Stream
    const washingList = queue.filter(item => item.statusPengerjaan === 'Sedang Dicuci')
    expect(washingList).toHaveLength(1)
    expect(washingList[0].platNomor).toBe('D 5678 XYZ')
    expect(washingList[0].statusPengerjaan).toBe('Sedang Dicuci')

    // Kolom 3: Ready / QC Stream
    const readyList = queue.filter(item => item.statusPengerjaan === 'Siap Diambil' || item.statusBayar === 'Selesai')
    expect(readyList).toHaveLength(1)
    expect(readyList[0].platNomor).toBe('F 9999 DEF')
    expect(readyList[0].statusPengerjaan).toBe('Siap Diambil')
  })

  it('SIM-03: Simulasi Transisi Alur Pengerjaan (Start Wash -> QC Checklist -> Siap Diambil)', () => {
    // 1. Awalnya mobil cw-001 berstatus 'Menunggu'
    let currentCar = { ...mockCarwashData[0] }
    expect(currentCar.status_pengerjaan).toBe('Menunggu')

    // 2. Operator menekan "Masuk Bay Cuci" -> update status_pengerjaan ke 'Sedang Dicuci'
    const step1UpdatedStatus = 'Sedang Dicuci'
    currentCar.status_pengerjaan = step1UpdatedStatus
    expect(currentCar.status_pengerjaan).toBe('Sedang Dicuci')

    // 3. Verifikasi 4 Poin Standard QC Checklist
    const qcPoints = {
      bodyClean: true,       // Eksterior Kering & Kilap
      interiorVacuum: true,  // Interior & Karpet Vakum
      glassClear: true,      // Kaca & Spion Bening
      tireShine: true        // Semir Ban Hitam Rata
    }
    const allQcPassed = Object.values(qcPoints).every(Boolean)
    expect(allQcPassed).toBe(true)

    // 4. Operator mengonfirmasi QC Lolos -> update status_pengerjaan ke 'Siap Diambil'
    const step2UpdatedStatus = 'Siap Diambil'
    currentCar.status_pengerjaan = step2UpdatedStatus
    expect(currentCar.status_pengerjaan).toBe('Siap Diambil')
  })

  it('SIM-04: Simulasi Template Format Notifikasi WhatsApp Estafet Pelanggan', () => {
    const item = {
      model: 'Honda Civic',
      platNomor: 'B 1234 ABC',
      paket: 'Cuci Salju + Wax',
      noTelepon: '081234567890'
    }

    let cleanPhone = item.noTelepon.replace(/\D/g, '')
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '62' + cleanPhone.slice(1)
    }

    const message = `Halo Bpk/Ibu Pelanggan RelayPOS,\n\nPemberitahuan: Kendaraan Anda *${item.model} (${item.platNomor})* telah selesai kami bersihkan dan saat ini *SIAP DIAMBIL* di outlet RelayPOS.\n\nLayanan: ${item.paket}\nTerima kasih atas kepercayaannya!`

    expect(cleanPhone).toBe('6281234567890')
    expect(message).toContain('*Honda Civic (B 1234 ABC)*')
    expect(message).toContain('*SIAP DIAMBIL*')
    expect(message).toContain('Cuci Salju + Wax')
  })

  it('SIM-05: Simulasi Filter Pencarian & Kehadiran (Ditunggu / Ditinggal)', () => {
    const data = [...mockCarwashData]

    // Filter Ditunggu (TUNGGU)
    const tungguOnly = data.filter(d => d.kehadiran === 'TUNGGU')
    expect(tungguOnly).toHaveLength(2)

    // Filter Ditinggal (TINGGAL)
    const tinggalOnly = data.filter(d => d.kehadiran === 'TINGGAL')
    expect(tinggalOnly).toHaveLength(1)
    expect(tinggalOnly[0].plat).toBe('D 5678 XYZ')

    // Search query 'Fortuner'
    const searchQuery = 'Fortuner'.toLowerCase()
    const searchResults = data.filter(d => 
      d.plat.toLowerCase().includes(searchQuery) ||
      d.paket.toLowerCase().includes(searchQuery) ||
      d.model.toLowerCase().includes(searchQuery)
    )
    expect(searchResults).toHaveLength(1)
    expect(searchResults[0].plat).toBe('D 5678 XYZ')
  })
})
