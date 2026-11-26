import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const { mockSupabase, mockState } = vi.hoisted(() => {
  const state = {
    isCloudBackend: false,
    fromCalls: [],
    rpcCalls: [],
    insertCalls: [],
    updateCalls: [],
    deleteCalls: [],
    eqCalls: [],
    channelCallbacks: [],
    channelFilters: [],
    removedChannels: [],
    tableHandlers: {}
  }

  const createQueryBuilder = (table) => {
    const ops = { table, eqs: [], isNulls: [], orders: [], gtes: [], ltes: [], action: 'select', payload: null }
    const builder = {
      select: vi.fn(() => builder),
      insert: vi.fn((payload) => {
        ops.action = 'insert'
        ops.payload = payload
        state.insertCalls.push({ table, payload })
        if (state.tableHandlers[table]?.insert) {
          return Promise.resolve(state.tableHandlers[table].insert(payload, ops))
        }
        return Promise.resolve({ data: payload, error: null })
      }),
      update: vi.fn((payload) => {
        ops.action = 'update'
        ops.payload = payload
        state.updateCalls.push({ table, payload })
        return builder
      }),
      delete: vi.fn(() => {
        ops.action = 'delete'
        state.deleteCalls.push({ table })
        return builder
      }),
      eq: vi.fn((col, val) => {
        ops.eqs.push([col, val])
        state.eqCalls.push({ table, col, val, action: ops.action })
        return builder
      }),
      neq: vi.fn(() => builder),
      is: vi.fn((col, val) => {
        ops.isNulls.push([col, val])
        return builder
      }),
      gte: vi.fn((col, val) => {
        ops.gtes.push([col, val])
        return builder
      }),
      lte: vi.fn((col, val) => {
        ops.ltes.push([col, val])
        return builder
      }),
      order: vi.fn((col, opts) => {
        ops.orders.push([col, opts])
        return builder
      }),
      single: vi.fn(() => {
        if (state.tableHandlers[table]?.single) {
          return Promise.resolve(state.tableHandlers[table].single(ops))
        }
        return Promise.resolve({ data: null, error: null })
      }),
      maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
      then: (resolve, reject) => {
        let res = { data: [], error: null }
        const custom = state.tableHandlers[table]?.exec
        if (custom) {
          res = custom(ops)
        }
        return Promise.resolve(res).then(resolve, reject)
      }
    }
    return builder
  }

  const supabase = {
    isLocal: true,
    from: vi.fn((table) => {
      state.fromCalls.push(table)
      return createQueryBuilder(table)
    }),
    rpc: vi.fn(async (fnName, params) => {
      state.rpcCalls.push({ fnName, params })
      if (state.tableHandlers[`rpc:${fnName}`]) {
        return state.tableHandlers[`rpc:${fnName}`](params)
      }
      return { data: { success: true }, error: null }
    }),
    channel: vi.fn((name) => {
      const ch = {
        name,
        on: vi.fn((type, filter, cb) => {
          state.channelFilters.push({ type, filter })
          state.channelCallbacks.push(cb)
          return ch
        }),
        subscribe: vi.fn(() => ch)
      }
      return ch
    }),
    removeChannel: vi.fn((ch) => {
      state.removedChannels.push(ch)
    })
  }

  return { mockSupabase: supabase, mockState: state }
})

vi.mock('../../supabaseClient', () => ({
  supabase: mockSupabase,
  get isCloudBackend() {
    return mockState.isCloudBackend
  }
}))

import { storageAdapter } from '../storageAdapter'
import api from '../apiAdapter'
import posService from '../posService'
import inventoryService from '../inventoryService'
import financeService from '../financeService'
import staffService from '../staffService'
import { subscribeCarwashQueueRealtime } from '../../hooks/domain/useCarwashQueue'

function createMemoryStorage(shouldThrow = false) {
  const store = new Map()
  return {
    getItem: (k) => {
      if (shouldThrow) throw new Error('Storage denied')
      return store.has(k) ? store.get(k) : null
    },
    setItem: (k, v) => {
      if (shouldThrow) throw new Error('Storage full')
      store.set(k, String(v))
    },
    removeItem: (k) => {
      if (shouldThrow) throw new Error('Storage denied')
      store.delete(k)
    },
    clear: () => store.clear()
  }
}

describe('Fase 1: Backend Connection Shield', () => {
  let origLocalStorage

  beforeEach(() => {
    origLocalStorage = globalThis.localStorage
    Object.defineProperty(globalThis, 'localStorage', {
      value: createMemoryStorage(false),
      configurable: true,
      writable: true
    })
    mockState.isCloudBackend = false
    mockState.fromCalls = []
    mockState.rpcCalls = []
    mockState.insertCalls = []
    mockState.updateCalls = []
    mockState.deleteCalls = []
    mockState.eqCalls = []
    mockState.channelCallbacks = []
    mockState.channelFilters = []
    mockState.removedChannels = []
    mockState.tableHandlers = {}
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
    Object.defineProperty(globalThis, 'localStorage', {
      value: origLocalStorage,
      configurable: true,
      writable: true
    })
  })

  describe('1. storageAdapter multi-tenant isolation', () => {
    it('isolates JSON and string values strictly per tenantId', () => {
      storageAdapter.setJSON('tenant-A', 'custom_jenis', ['Biaya Bengkel'])
      storageAdapter.setJSON('tenant-B', 'custom_jenis', ['Biaya Kopi'])

      expect(storageAdapter.getJSON('tenant-A', 'custom_jenis', [])).toEqual(['Biaya Bengkel'])
      expect(storageAdapter.getJSON('tenant-B', 'custom_jenis', [])).toEqual(['Biaya Kopi'])
      expect(storageAdapter.getJSON('tenant-C', 'custom_jenis', [])).toEqual([])
      expect(storageAdapter.buildKey('tenant-A', 'custom_jenis')).toBe('relaypos:tenant-A:custom_jenis')
    })

    it('supports legacyKey fallback when scoped key is absent and safely handles storage errors', () => {
      globalThis.localStorage.setItem('starting_capital_tenant-A_2026-11-27', '500000')
      expect(
        storageAdapter.getItem('tenant-A', 'starting_capital_2026-11-27', {
          legacyKey: 'starting_capital_tenant-A_2026-11-27'
        })
      ).toBe('500000')

      storageAdapter.setItem('tenant-A', 'starting_capital_2026-11-27', '750000')
      expect(
        storageAdapter.getItem('tenant-A', 'starting_capital_2026-11-27', {
          legacyKey: 'starting_capital_tenant-A_2026-11-27'
        })
      ).toBe('750000')

      storageAdapter.removeItem('tenant-A', 'starting_capital_2026-11-27')
      Object.defineProperty(globalThis, 'localStorage', {
        value: createMemoryStorage(true),
        configurable: true,
        writable: true
      })
      expect(() => storageAdapter.setJSON('tenant-A', 'k', { a: 1 })).not.toThrow()
      expect(storageAdapter.getJSON('tenant-A', 'k', ['safe'])).toEqual(['safe'])
    })
  })

  describe('2. posService & apiAdapter Cloud vs Local parity', () => {
    it('voidTransaction enforces tenantId + idStruk and branches Cloud RPC vs Local 3-table update', async () => {
      await expect(posService.voidTransaction({ tenantId: '', idStruk: 'RLY-1' })).rejects.toThrow()
      await expect(posService.voidTransaction({ tenantId: 't-1', idStruk: '' })).rejects.toThrow()

      // Cloud path -> RPC fn_void_or_cancel_receipt
      await posService.voidTransaction({
        tenantId: '11111111-1111-1111-1111-111111111111',
        idStruk: 'RLY-CLOUD-01',
        reason: 'Salah input',
        options: { isCloud: true }
      })
      expect(mockState.rpcCalls).toEqual([
        {
          fnName: 'fn_void_or_cancel_receipt',
          params: {
            p_tenant_id: '11111111-1111-1111-1111-111111111111',
            p_id_struk: 'RLY-CLOUD-01',
            p_reason: 'Salah input'
          }
        }
      ])

      // Local path -> updates struk, cafe, and carwash (zeroing crew wage)
      mockState.rpcCalls = []
      await posService.voidTransaction({
        tenantId: 'local-t-1',
        idStruk: 'RLY-LOC-01',
        reason: 'Batal pelanggan',
        options: { isCloud: false }
      })
      expect(mockState.rpcCalls).toHaveLength(0)
      expect(mockState.updateCalls).toEqual([
        { table: 'struk', payload: { status_bayar: 'Batal', catatan: 'Batal pelanggan' } },
        { table: 'cafe', payload: { status: 'Batal' } },
        { table: 'carwash', payload: { status: 'Batal', gaji_anggota: 0, gaji_pencuci: 0 } }
      ])
    })

    it('closeCashierShift & recordMoneyExchange call backend RPCs cleanly and handle failure payloads', async () => {
      await expect(posService.closeCashierShift({ tenantId: '', kasir: 'Rina' })).rejects.toThrow()

      await posService.closeCashierShift({
        tenantId: 't-1',
        branchId: 'b-1',
        kasir: 'Rina',
        tanggal: '2026-11-27',
        modalAwal: 500000,
        kasFisik: 1850000,
        catatan: 'Shift aman'
      })
      expect(mockState.rpcCalls[0]).toEqual({
        fnName: 'fn_close_cashier_shift',
        params: {
          p_tenant_id: 't-1',
          p_branch_id: 'b-1',
          p_kasir: 'Rina',
          p_tanggal: '2026-11-27',
          p_modal_awal: 500000,
          p_kas_fisik: 1850000,
          p_catatan: 'Shift aman'
        }
      })

      mockState.tableHandlers['rpc:fn_record_cashier_money_exchange'] = () => ({
        data: { success: false, message: 'Saldo laci tidak mencukupi' },
        error: null
      })
      await expect(
        posService.recordMoneyExchange({
          tenantId: 't-1',
          branchId: 'b-1',
          kasir: 'Rina',
          cashOut: 200000,
          qrisIn: 200000,
          customer: 'Budi',
          tanggal: '2026-11-27'
        })
      ).rejects.toThrow('Saldo laci tidak mencukupi')
    })

    it('getPendingBills formats nested cafe and carwash arrays and starting capital stays tenant-scoped', async () => {
      mockState.tableHandlers.struk = {
        exec: () => ({
          data: [
            {
              id_struk: 'RLY-0412',
              tanggal: '2026-11-27',
              jam: '14:20:00',
              kasir: 'Rina',
              total_tagihan: 113000,
              subtotal: 113000,
              diskon: 0,
              metode_bayar: 'QRIS',
              cafe: [{ nama_menu: 'Es Kopi Susu', qty: 2, harga_satuan: 24000 }],
              carwash: [{ paket: 'Cuci Hidrolik', plat: 'B 1945 RLY', harga: 65000, model: 'HRV', no_telepon: '0812', kehadiran: 'TUNGGU' }]
            }
          ],
          error: null
        })
      }

      const bills = await posService.getPendingBills({ tenantId: 't-1' })
      expect(bills).toHaveLength(1)
      expect(bills[0].id).toBe('RLY-0412')
      expect(bills[0].total_harga).toBe(113000)
      expect(bills[0].cafe[0]).toEqual({ nama_menu: 'Es Kopi Susu', jumlah: 2, harga_satuan: 24000 })
      expect(bills[0].carwash[0].plat_nomor).toBe('B 1945 RLY')

      posService.saveTodayStartingCapital('tenant-A', 300000, '2026-11-27')
      expect(posService.getTodayStartingCapital('tenant-A', '2026-11-27')).toBe(300000)
      expect(posService.getTodayStartingCapital('tenant-B', '2026-11-27')).toBeNull()
    })
  })

  describe('3. api.master.replaceCarwashPackageRecipes atomic batch insert', () => {
    it('deletes stale rows then executes exactly ONE batch insert for all valid ingredients', async () => {
      const pkgUuid = '11111111-1111-1111-1111-111111111111'
      const stokUuid = '22222222-2222-2222-2222-222222222222'
      await api.master.replaceCarwashPackageRecipes({
        savedPkgId: pkgUuid,
        packageName: 'Cuci Salju Premium',
        previousPackageName: 'Cuci Salju',
        resepBahan: [
          { stok_barang_id: stokUuid, nama_bahan: 'Shampoo Snow', jumlah: '0.25', satuan: 'Liter' },
          { nama_bahan: 'Semir Ban', jumlah: '0.1', satuan: 'Liter' },
          { nama_bahan: 'Abai Nol', jumlah: '0', satuan: 'Liter' }
        ],
        stokBahan: [
          { id: stokUuid, id_bahan_baku: 'BHN-01', nama_produk: 'Shampoo Snow' },
          { id_barang: 'BHN-02', nama_produk: 'Semir Ban' }
        ]
      })

      expect(mockState.deleteCalls.filter((d) => d.table === 'resep').length).toBeGreaterThanOrEqual(2)
      const resepInserts = mockState.insertCalls.filter((i) => i.table === 'resep')
      expect(resepInserts).toHaveLength(1)
      expect(Array.isArray(resepInserts[0].payload)).toBe(true)
      expect(resepInserts[0].payload).toHaveLength(2)
      expect(resepInserts[0].payload[0].carwash_package_id).toBe(pkgUuid)
      expect(resepInserts[0].payload[0].stok_barang_id).toBe(stokUuid)
    })
  })

  describe('4. inventoryService tenant scoping & authentic empty state', () => {
    it('returns empty array when table has zero rows, strips cost for non-managers, and filters by tenantId', async () => {
      mockState.tableHandlers.stok_barang = { exec: () => ({ data: [], error: null }) }
      const emptyRows = await inventoryService.fetchWarehouseInventory({ tenantId: 'tenant-new', canViewCost: true })
      expect(emptyRows).toEqual([])
      expect(mockState.eqCalls.some((e) => e.table === 'stok_barang' && e.col === 'tenant_id' && e.val === 'tenant-new')).toBe(true)

      mockState.tableHandlers['rpc:fn_get_pos_inventory_stock'] = () => ({
        data: [{ id_barang: 'BRG-1', nama_produk: 'Shampoo Mobil', harga_beli: 95000, stok: 10 }],
        error: null
      })
      const kasirRows = await inventoryService.fetchWarehouseInventory({ tenantId: 'tenant-A', canViewCost: false })
      expect(kasirRows).toHaveLength(1)
      expect(kasirRows[0].gudang).toBe('CARWASH')
      expect(kasirRows[0].harga_beli).toBeNull()
    })
  })

  describe('5. financeService tenant-isolated custom options', () => {
    it('keeps custom expense & income categories separated across tenants', () => {
      financeService.saveCustomFinanceOption('tenant-A', 'jenis', 'Operasional Cuci')
      financeService.saveCustomFinanceOption('tenant-A', 'kategori', 'Beli Kanebo')

      const optsA = financeService.getCustomFinanceOptions('tenant-A')
      const optsB = financeService.getCustomFinanceOptions('tenant-B')

      expect(optsA.customJenisList).toEqual(['Operasional Cuci'])
      expect(optsA.customKategoriList).toEqual(['Beli Kanebo'])
      expect(optsB.customJenisList).toEqual([])
      expect(optsB.customKategoriList).toEqual([])
    })
  })

  describe('6. staffService tenant-reactive fetching', () => {
    it('scopes staff directory & carwash wages queries by tenantId', async () => {
      await staffService.fetchStaffDirectory({ tenantId: 'tenant-X' })
      expect(mockState.eqCalls.some((e) => e.table === 'karyawan_cuci' && e.col === 'tenant_id' && e.val === 'tenant-X')).toBe(true)
      expect(mockState.eqCalls.some((e) => e.table === 'branches' && e.col === 'tenant_id' && e.val === 'tenant-X')).toBe(true)

      mockState.eqCalls = []
      await staffService.fetchCarwashWagesData({ tenantId: 'tenant-X', startDate: '2026-11-01', endDate: '2026-11-27' })
      expect(mockState.eqCalls.some((e) => e.table === 'carwash' && e.col === 'tenant_id' && e.val === 'tenant-X')).toBe(true)
      expect(mockState.eqCalls.some((e) => e.table === 'cashflow' && e.col === 'tenant_id' && e.val === 'tenant-X')).toBe(true)
      expect(mockState.eqCalls.some((e) => e.table === 'pengeluaran' && e.col === 'tenant_id' && e.val === 'tenant-X')).toBe(true)
    })
  })

  describe('7. useCarwashQueue Realtime tenant filter & 250ms debounce', () => {
    it('subscribes with tenant_id filter, debounces rapid events, and cleans up on unsubscribe', () => {
      vi.useFakeTimers()
      const onChange = vi.fn()

      const unsubscribe = subscribeCarwashQueueRealtime({
        client: mockSupabase,
        tenantId: 'tenant-R1',
        onChange,
        debounceMs: 250
      })

      expect(mockState.channelFilters).toHaveLength(1)
      expect(mockState.channelFilters[0].filter).toMatchObject({
        event: '*',
        schema: 'public',
        table: 'carwash',
        filter: 'tenant_id=eq.tenant-R1'
      })

      // Fire 4 burst events within 50ms -> must coalesce into 1 callback
      const handler = mockState.channelCallbacks[0]
      handler({ eventType: 'INSERT' })
      vi.advanceTimersByTime(50)
      handler({ eventType: 'UPDATE' })
      handler({ eventType: 'UPDATE' })
      handler({ eventType: 'DELETE' })
      expect(onChange).not.toHaveBeenCalled()

      vi.advanceTimersByTime(250)
      expect(onChange).toHaveBeenCalledTimes(1)

      unsubscribe()
      expect(mockState.removedChannels).toHaveLength(1)
    })
  })

  describe('8. Hardware print contract CSS isolation', () => {
    it('isolates thermal 58mm/80mm & A4 print rules in print-contracts.css imported by index.css', () => {
      const printCssPath = path.resolve(process.cwd(), 'src/styles/print-contracts.css')
      const indexCssPath = path.resolve(process.cwd(), 'src/index.css')

      expect(fs.existsSync(printCssPath)).toBe(true)
      const printCss = fs.readFileSync(printCssPath, 'utf-8')
      const indexCss = fs.readFileSync(indexCssPath, 'utf-8')

      expect(printCss).toContain('.thermal-print-only')
      expect(printCss).toContain('body.has-thermal-receipt #root')
      expect(printCss).toContain('body.has-thermal-receipt .thermal-print-only')
      expect(printCss).toContain('body:not(.has-thermal-receipt) #print-area')
      expect(indexCss).toContain('@import "./styles/print-contracts.css";')
    })
  })
})
