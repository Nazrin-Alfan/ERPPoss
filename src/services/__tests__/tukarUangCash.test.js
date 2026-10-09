import { describe, it, expect, beforeEach } from 'vitest'
import { createLocalClient } from '../localDbEngine'
import { isPindahSaldo, formatPosExpensePayload } from '../../utils/financeHelpers'

describe('Uji Transaksi Tukar Uang Cash Kasir POS', () => {
  let db

  beforeEach(() => {
    db = createLocalClient()
    db.erp.resetDatabase()
  })

  it('memastikan formatPosExpensePayload menandai transaksi tukar cash sebagai Pindah Saldo', () => {
    const payload = formatPosExpensePayload({
      form: {
        nominal: '150000',
        kategori: 'Tukar Uang',
        keterangan: 'Tukar Uang Cash Keluar ganti QRIS - Owner Raka',
        unit: 'Cafe'
      },
      todayDate: '2026-10-09',
      currentTime: '14:00:00',
      newExpId: 'exp-test-tukar-1'
    })

    expect(payload.jenis).toBe('Pindah')
    expect(payload.kategori).toBe('Tukar Uang')
    expect(payload.nominal).toBe(150000)

    // Verifikasi bahwa isPindahSaldo mendeteksi payload ini sebagai pindah saldo
    expect(isPindahSaldo(payload)).toBe(true)
  })

  it('memastikan transaksi tukar uang cash keluar dan QRIS masuk tercatat sebagai Pindah di Cashflow', async () => {
    const cashOut = 100000
    const qrisIn = 102000
    const adminFee = qrisIn - cashOut
    const todayDate = '2026-10-09'
    const timestamp = new Date().toISOString()

    const insertions = [
      // 1. Kas keluar dari Laci Kasir (SALDO CASH)
      {
        id_cashflow: 'cf-tukar-cash-out',
        tanggal: todayDate,
        jenis: 'Pindah',
        kategori: 'Tukar Uang',
        pos: 'SALDO CASH',
        pemasukan: 0,
        pengeluaran: cashOut,
        keterangan_transaksi: 'Tukar Uang Cash Keluar - Owner Raka',
        created_at: timestamp
      },
      // 2. Kas masuk ke Rekening QRIS/Bank (SALDO REKENING Y)
      {
        id_cashflow: 'cf-tukar-qris-in',
        tanggal: todayDate,
        jenis: 'Pindah',
        kategori: 'Tukar Uang',
        pos: 'SALDO REKENING Y',
        pemasukan: cashOut,
        pengeluaran: 0,
        keterangan_transaksi: 'Tukar Uang QRIS Masuk - Owner Raka',
        created_at: timestamp
      }
    ]

    if (adminFee > 0) {
      insertions.push({
        id_cashflow: 'cf-tukar-fee',
        tanggal: todayDate,
        jenis: 'Pemasukan',
        kategori: 'Pendapatan Lain-lain',
        pos: 'SALDO REKENING Y',
        pemasukan: adminFee,
        pengeluaran: 0,
        keterangan_transaksi: 'Biaya Admin Tukar Uang - Owner Raka',
        created_at: timestamp
      })
    }

    // Insert ke localDb engine
    await db.from('cashflow').insert(insertions)

    // Ambil data cashflow yang baru diinsert
    const { data: records } = await db.from('cashflow').select('*').eq('tanggal', todayDate)
    const tukarCashOut = records.find(r => r.id_cashflow === 'cf-tukar-cash-out')
    const tukarQrisIn = records.find(r => r.id_cashflow === 'cf-tukar-qris-in')
    const feeRecord = records.find(r => r.id_cashflow === 'cf-tukar-fee')

    // Validasi jenis transaksi
    expect(tukarCashOut).toBeDefined()
    expect(tukarCashOut.jenis).toBe('Pindah')
    expect(tukarCashOut.kategori).toBe('Tukar Uang')
    expect(tukarCashOut.pengeluaran).toBe(100000)
    expect(isPindahSaldo(tukarCashOut)).toBe(true)

    expect(tukarQrisIn).toBeDefined()
    expect(tukarQrisIn.jenis).toBe('Pindah')
    expect(tukarQrisIn.kategori).toBe('Tukar Uang')
    expect(tukarQrisIn.pemasukan).toBe(100000)
    expect(isPindahSaldo(tukarQrisIn)).toBe(true)

    expect(feeRecord).toBeDefined()
    expect(feeRecord.jenis).toBe('Pemasukan')
    expect(feeRecord.pemasukan).toBe(2000)
    expect(isPindahSaldo(feeRecord)).toBe(false)
  })
})
