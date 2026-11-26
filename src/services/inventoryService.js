/**
 * inventoryService.js - Warehouse inventory & stock facade scoped by tenantId.
 */

import { supabase } from '../supabaseClient'

export function normalizeInventoryRow(item, { canViewCost = false } = {}) {
  let determinedGudang = item?.gudang
  if (!determinedGudang) {
    const namaLow = String(item?.nama_produk || item?.nama_barang || '').toLowerCase()
    const katLow = String(item?.kategori || '').toLowerCase()
    if (katLow.includes('merchandise') || katLow.includes('retail') || namaLow.includes('parfum') || namaLow.includes('microfiber')) {
      determinedGudang = 'MERCHANDISE'
    } else if (katLow.includes('cuci') || namaLow.includes('shampo') || namaLow.includes('semir') || namaLow.includes('degreaser') || namaLow.includes('carwash')) {
      determinedGudang = 'CARWASH'
    } else {
      determinedGudang = 'CAFE'
    }
  }

  return {
    ...item,
    id_barang: item?.id_barang || item?.id_bahan_baku,
    nama_barang: item?.nama_produk || item?.nama_barang,
    gudang: determinedGudang,
    harga_beli: canViewCost ? (item?.harga_beli || item?.harga_satuan || item?.hpp || 0) : null,
    harga_jual: item?.harga_jual || item?.harga || 0,
    min_stok: item?.min_stok !== undefined ? item.min_stok : 5
  }
}

export const inventoryService = {
  normalizeInventoryRow,

  async fetchWarehouseInventory({ tenantId = null, canViewCost = false } = {}) {
    let rawData = null

    if (!canViewCost && typeof supabase?.rpc === 'function') {
      try {
        const rpcArgs = tenantId ? { p_tenant_id: tenantId } : undefined
        const { data: rpcData, error: rpcErr } = rpcArgs
          ? await supabase.rpc('fn_get_pos_inventory_stock', rpcArgs)
          : await supabase.rpc('fn_get_pos_inventory_stock')
        if (!rpcErr && Array.isArray(rpcData)) {
          rawData = rpcData
        }
      } catch {
        // Fallback to direct table query when RPC unavailable
      }
    }

    if (!rawData) {
      let query = supabase.from('stok_barang').select('*')
      if (tenantId && query && typeof query.eq === 'function') {
        query = query.eq('tenant_id', tenantId)
      }
      if (query && typeof query.order === 'function') {
        query = query.order('nama_produk', { ascending: true })
      }
      const { data, error } = await query
      if (error) throw error
      rawData = Array.isArray(data) ? data : []
    }

    if (!rawData || rawData.length === 0) {
      return []
    }

    return rawData.map((item) => normalizeInventoryRow(item, { canViewCost }))
  }
}

export default inventoryService
