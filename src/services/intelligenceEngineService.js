/**
 * RelayPOS Intelligence Engine Service
 * Lapisan ke-2 (Intelligence Layer) yang menghitung seluruh metrik operasional & finansial
 * secara murni deterministik (Pure Math & Business Rules) tanpa ketergantungan model AI eksternal.
 * 100% Zero-PII, Multi-Tenant Isolated, dan Acid-Compliant.
 */

import { parseDateSafe } from '../utils/helpers.js'

export class IntelligenceEngineService {
  constructor({
    struk = [],
    carwash = [],
    cafe = [],
    cashflow = [],
    stok_barang = [],
    pos_balances = [],
    tenantBusinessType = 'HYBRID', // 'HYBRID' | 'CARWASH' | 'CAFE'
    targetCapacity = 30,
    referenceDate = null,
    operatingDays = null
  } = {}) {
    this.struk = struk
    this.carwash = carwash
    this.cafe = cafe
    this.cashflow = cashflow
    this.stok_barang = stok_barang
    this.pos_balances = pos_balances
    this.tenantBusinessType = tenantBusinessType
    this.targetCapacity = targetCapacity || 30
    this.referenceDate = referenceDate || new Date().toLocaleDateString('en-CA')
    this.customOperatingDays = operatingDays
  }

  /**
   * Filter transaksi valid (mengabaikan void/batal dan data kalibrasi/testing)
   */
  getValidStruk() {
    return this.struk.filter((s) => {
      const ket = String(s.keterangan || '').toLowerCase()
      const status = String(s.status_bayar || s.status || '').toLowerCase()
      return !ket.includes('kalibrasi') && !ket.includes('test') && status !== 'batal' && status !== 'cancelled'
    })
  }

  getValidCarwash() {
    return this.carwash.filter((cw) => {
      const status = String(cw.status || '').toLowerCase()
      const isCancelled = status === 'batal' || status === 'cancelled'
      const hasPrice = (parseFloat(cw.harga) || 0) > 0
      return !isCancelled && hasPrice
    })
  }

  getValidCafe() {
    return this.cafe.filter((c) => {
      const status = String(c.status || '').toLowerCase()
      const isCancelled = status === 'batal' || status === 'cancelled'
      const hasSubtotal = (parseFloat(c.subtotal || c.harga_satuan * c.qty) || 0) > 0
      return !isCancelled && hasSubtotal
    })
  }

  getValidCashflow() {
    return this.cashflow.filter((c) => {
      const jenis = String(c.jenis || '').toLowerCase()
      const isMutationOnly = jenis.includes('pindah') || jenis.includes('casbon') || jenis.includes('transfer')
      return !isMutationOnly
    })
  }

  /**
   * Hitung Hari Operasional
   */
  calculateOperatingDays() {
    if (this.customOperatingDays && this.customOperatingDays > 0) {
      return this.customOperatingDays
    }
    const dates = new Set()
    this.getValidStruk().forEach((s) => {
      if (s.tanggal) dates.add(s.tanggal.substring(0, 10))
    })
    this.getValidCarwash().forEach((cw) => {
      if (cw.tanggal) dates.add(cw.tanggal.substring(0, 10))
    })
    return Math.max(dates.size, 1)
  }

  /**
   * 1. Financial Metrics Engine & Expense Breakdown
   */
  calculateFinancialMetrics() {
    const validStruk = this.getValidStruk()
    const validCashflow = this.getValidCashflow()
    const operatingDays = this.calculateOperatingDays()

    const totalRevenue = validStruk.reduce((sum, s) => sum + (parseFloat(s.total_tagihan) || 0), 0)
    const totalExpenses = validCashflow.reduce((sum, c) => sum + (parseFloat(c.pengeluaran) || 0), 0)
    const netProfit = totalRevenue - totalExpenses
    const profitMargin = totalRevenue > 0 ? Math.round(((netProfit / totalRevenue) * 100) * 100) / 100 : 0
    const expenseRatio = totalRevenue > 0 ? Math.round(((totalExpenses / totalRevenue) * 100) * 100) / 100 : 0
    const avgDailyOmzet = operatingDays > 0 ? Math.round(totalRevenue / operatingDays) : 0

    let totalLiquid = 0
    if (Array.isArray(this.pos_balances) && this.pos_balances.length > 0) {
      totalLiquid = this.pos_balances.reduce((sum, b) => sum + (parseFloat(b.balance) || 0), 0)
    }

    // Expense breakdown per jenis & category
    const jenisMap = {}
    const detailMap = {}

    const normalizeJenisStr = (raw) => {
      const t = String(raw || '').toLowerCase()
      if (t.includes('carwash') || t.includes('cuci')) return 'Pengeluaran Carwash'
      if (t.includes('cafe') || t.includes('kopi') || t.includes('f&b')) return 'Pengeluaran Cafe'
      return 'Pengeluaran Bersama'
    }

    const normalizeKategoriStr = (raw) => {
      const t = String(raw || '').toLowerCase().trim()
      if (t.includes('karyawan') || t.includes('gaji') || t.includes('upah') || t.includes('komisi')) return 'Gaji & Komisi Karyawan'
      if (t.includes('bahan') || t.includes('chemical') || t.includes('biji')) return 'Bahan Baku & Chemical'
      if (t.includes('sewa')) return 'Sewa Tempat Usaha'
      if (t.includes('listrik') || t.includes('air') || t.includes('pam') || t.includes('utilitas')) return 'Listrik, Air & Utilitas'
      if (t.includes('barang') || t.includes('perlengkapan') || t.includes('alat')) return 'Barang & Perlengkapan'
      if (t.includes('operasional') || t.includes('servis')) return 'Operasional & Servis'
      return 'Operasional Umum & Lain-lain'
    }

    validCashflow.forEach((c) => {
      const exp = parseFloat(c.pengeluaran) || 0
      if (exp > 0) {
        const j = normalizeJenisStr(c.jenis)
        const k = normalizeKategoriStr(c.kategori)

        jenisMap[j] = (jenisMap[j] || 0) + exp
        const key = `${j} || ${k}`
        detailMap[key] = (detailMap[key] || 0) + exp
      }
    })

    const expenseByJenis = Object.entries(jenisMap)
      .map(([jenis, total]) => ({
        jenis,
        total: Math.round(total),
        percentage: totalExpenses > 0 ? Math.round((total / totalExpenses) * 1000) / 10 : 0
      }))
      .sort((a, b) => b.total - a.total)

    const expenseBreakdownDetailed = Object.entries(detailMap)
      .map(([key, total]) => {
        const [jenis, kategori] = key.split(' || ')
        return {
          jenis,
          kategori,
          total: Math.round(total),
          percentage: totalExpenses > 0 ? Math.round((total / totalExpenses) * 1000) / 10 : 0
        }
      })
      .sort((a, b) => b.total - a.total)

    // Exact Cashflow Hierarchy: Jenis -> Kategori -> Nominal, %, Transaksi
    const hierarchyMap = {}
    validCashflow.forEach((c) => {
      const exp = parseFloat(c.pengeluaran) || 0
      if (exp > 0) {
        const rawJenis = String(c.jenis || 'Pengeluaran Bersama').trim()
        const cleanJenis = normalizeJenisStr(rawJenis)
        const rawKategori = String(c.kategori || 'Operasional Umum').trim()
        const cleanKategori = rawKategori.charAt(0).toUpperCase() + rawKategori.slice(1)

        if (!hierarchyMap[cleanJenis]) {
          hierarchyMap[cleanJenis] = {
            jenis: cleanJenis,
            total: 0,
            categories: {}
          }
        }
        hierarchyMap[cleanJenis].total += exp

        if (!hierarchyMap[cleanJenis].categories[cleanKategori]) {
          hierarchyMap[cleanJenis].categories[cleanKategori] = {
            kategori: cleanKategori,
            total: 0,
            count: 0
          }
        }
        hierarchyMap[cleanJenis].categories[cleanKategori].total += exp
        hierarchyMap[cleanJenis].categories[cleanKategori].count += 1
      }
    })

    const cashflowHierarchy = Object.values(hierarchyMap)
      .map((jItem) => {
        const totalJenis = Math.round(jItem.total)
        const catList = Object.values(jItem.categories)
          .map((cItem) => ({
            kategori: cItem.kategori,
            total: Math.round(cItem.total),
            count: cItem.count,
            percentageOfJenis: totalJenis > 0 ? Math.round((cItem.total / totalJenis) * 1000) / 10 : 0,
            percentageOfTotal: totalExpenses > 0 ? Math.round((cItem.total / totalExpenses) * 1000) / 10 : 0
          }))
          .sort((a, b) => b.total - a.total)

        return {
          jenis: jItem.jenis,
          total: totalJenis,
          percentage: totalExpenses > 0 ? Math.round((totalJenis / totalExpenses) * 1000) / 10 : 0,
          categories: catList
        }
      })
      .sort((a, b) => b.total - a.total)

    return {
      totalRevenue,
      totalExpenses,
      netProfit,
      profitMargin,
      expenseRatio,
      avgDailyOmzet,
      totalLiquid,
      operatingDays,
      expenseByJenis,
      expenseBreakdownDetailed,
      cashflowHierarchy
    }
  }

  /**
   * 2. Cashier Payment Distribution
   */
  calculateCashierDistribution() {
    const validStruk = this.getValidStruk()
    let totalCash = 0
    let totalNonCash = 0

    validStruk.forEach((s) => {
      const cash = parseFloat(s.nominal_cash) || 0
      const qris = parseFloat(s.nominal_qris) || 0
      const transfer = parseFloat(s.nominal_transfer) || 0
      const total = parseFloat(s.total_tagihan) || 0

      if (cash > 0 || qris > 0 || transfer > 0) {
        totalCash += cash
        totalNonCash += (qris + transfer)
      } else {
        const method = String(s.metode_bayar || '').toUpperCase()
        if (method === 'CASH' || method === 'TUNAI') {
          totalCash += total
        } else {
          totalNonCash += total
        }
      }
    })

    return {
      totalCash,
      totalNonCash,
      totalTxCount: validStruk.length
    }
  }

  /**
   * 3. Hourly Traffic Breakdown Engine (Carwash & Cafe per Jam)
   */
  calculateHourlyTraffic() {
    const validCw = this.getValidCarwash()
    const validCafe = this.getValidCafe()
    const validStruk = this.getValidStruk()

    const strukTimeMap = new Map()
    validStruk.forEach((s) => {
      if (s.id_struk && s.jam) strukTimeMap.set(s.id_struk, s.jam)
    })

    const hours = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00+']
    const trafficMap = {}
    hours.forEach((h) => {
      trafficMap[h] = { hour: h, carwashUnits: 0, cafeOrders: 0 }
    })

    validCw.forEach((cw) => {
      if (cw.jam) {
        const h = parseInt(String(cw.jam).split(':')[0], 10)
        if (!isNaN(h)) {
          if (h < 8) trafficMap['08:00'].carwashUnits++
          else if (h >= 18) trafficMap['18:00+'].carwashUnits++
          else {
            const key = `${h.toString().padStart(2, '0')}:00`
            if (trafficMap[key]) trafficMap[key].carwashUnits++
          }
        }
      }
    })

    validCafe.forEach((c) => {
      const jam = strukTimeMap.get(c.id_struk) || (c.created_at ? c.created_at.slice(11, 16) : null)
      if (jam) {
        const h = parseInt(String(jam).split(':')[0], 10)
        if (!isNaN(h)) {
          if (h < 8) trafficMap['08:00'].cafeOrders++
          else if (h >= 18) trafficMap['18:00+'].cafeOrders++
          else {
            const key = `${h.toString().padStart(2, '0')}:00`
            if (trafficMap[key]) trafficMap[key].cafeOrders++
          }
        }
      }
    })

    const hourlyList = hours.map((h) => trafficMap[h])
    const busiestCarwashHour = [...hourlyList].sort((a, b) => b.carwashUnits - a.carwashUnits)[0]
    const busiestCafeHour = [...hourlyList].sort((a, b) => b.cafeOrders - a.cafeOrders)[0]

    return {
      hourlyBreakdown: hourlyList,
      busiestCarwashHour: busiestCarwashHour?.hour || '09:00',
      busiestCafeHour: busiestCafeHour?.hour || '14:00'
    }
  }

  /**
   * 4. Carwash Operations Engine
   */
  calculateCarwashMetrics() {
    const validCw = this.getValidCarwash()
    const operatingDays = this.calculateOperatingDays()

    let totalRevenue = 0
    const modelMap = {}
    const packageMap = {}

    validCw.forEach((cw) => {
      const price = parseFloat(cw.harga) || 0
      totalRevenue += price

      const model = (cw.model && cw.model.trim()) ? cw.model.trim() : 'Mobil'
      modelMap[model] = (modelMap[model] || 0) + 1

      const pkt = (cw.paket && cw.paket.trim()) ? cw.paket.trim() : 'Cuci Biasa'
      packageMap[pkt] = (packageMap[pkt] || 0) + 1
    })

    const topModels = Object.entries(modelMap)
      .map(([model, count]) => ({ model, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    const topPackages = Object.entries(packageMap)
      .map(([paket, count]) => ({ paket, count }))
      .sort((a, b) => b.count - a.count)

    const totalUnits = validCw.length
    const avgCarsPerDay = operatingDays > 0 ? Math.round((totalUnits / operatingDays) * 10) / 10 : 0
    const carwashAOV = totalUnits > 0 ? Math.round(totalRevenue / totalUnits) : 0

    return {
      totalRevenue,
      totalUnits,
      avgCarsPerDay,
      carwashAOV,
      topModels,
      topPackages
    }
  }

  /**
   * 5. Cafe & F&B Operations Engine
   */
  calculateCafeMetrics() {
    const validCafe = this.getValidCafe()
    let totalRevenue = 0
    let totalItems = 0
    const menuMap = {}
    const strukIds = new Set()

    validCafe.forEach((item) => {
      const subtotal = parseFloat(item.subtotal || (item.harga_satuan * item.qty) || 0)
      const qty = parseFloat(item.qty || 1)
      totalRevenue += subtotal
      totalItems += qty

      if (item.id_struk) strukIds.add(item.id_struk)

      const nama = (item.nama_menu && item.nama_menu.trim()) ? item.nama_menu.trim() : 'Menu Cafe'
      if (!menuMap[nama]) {
        menuMap[nama] = { nama, qty: 0, revenue: 0 }
      }
      menuMap[nama].qty += qty
      menuMap[nama].revenue += subtotal
    })

    const sortedMenus = Object.values(menuMap).sort((a, b) => b.qty - a.qty)
    const topMenus = sortedMenus.slice(0, 5)
    const slowestMenus = [...sortedMenus].reverse().slice(0, 5)

    const cafeStrukCount = strukIds.size
    const cafeAOV = cafeStrukCount > 0 ? Math.round(totalRevenue / cafeStrukCount) : 0

    return {
      totalRevenue,
      totalItems,
      cafeStrukCount,
      cafeAOV,
      topMenus,
      slowestMenus,
      allMenusCount: sortedMenus.length
    }
  }

  /**
   * 6. Relay Synergy & Cross-Selling Engine
   */
  calculateSynergyMetrics() {
    const validCw = this.getValidCarwash()
    const validCafe = this.getValidCafe()
    const validStruk = this.getValidStruk()
    const cwMetrics = this.calculateCarwashMetrics()

    const cwStrukIds = new Set()
    validCw.forEach((cw) => {
      if (cw.id_struk) cwStrukIds.add(cw.id_struk)
    })

    const cafeStrukIds = new Set()
    let crossCafeRevenue = 0
    validCafe.forEach((c) => {
      if (c.id_struk) {
        cafeStrukIds.add(c.id_struk)
        if (cwStrukIds.has(c.id_struk)) {
          crossCafeRevenue += parseFloat(c.subtotal || (c.harga_satuan * c.qty) || 0)
        }
      }
    })

    let crossCount = 0
    cwStrukIds.forEach((id) => {
      if (cafeStrukIds.has(id)) {
        crossCount++
      }
    })

    const totalCwStruks = cwStrukIds.size
    const crossConversionRate = totalCwStruks > 0
      ? Math.round(((crossCount / totalCwStruks) * 100) * 10) / 10
      : 0

    const totalCustomers = Math.max(validStruk.length, 1)
    const financial = this.calculateFinancialMetrics()
    const combinedARPU = Math.round(financial.totalRevenue / totalCustomers)
    const capacityEfficiency = Math.min(
      Math.round(((parseFloat(cwMetrics.avgCarsPerDay) / this.targetCapacity) * 100)),
      100
    )

    return {
      crossConversionRate,
      crossConversionCount: crossCount,
      crossCafeRevenue: Math.round(crossCafeRevenue),
      totalCarwashStruks: totalCwStruks,
      combinedARPU,
      capacityEfficiency,
      targetCapacity: this.targetCapacity
    }
  }

  /**
   * 7. Customer Cohort & CRM Engine (Anonymous Plat Agreggation)
   */
  calculateCustomerCohorts() {
    const validCw = this.getValidCarwash()
    const validCafe = this.getValidCafe()
    const validStruk = this.getValidStruk()
    const customerMap = {}

    // Map struk to cafe subtotal
    const strukCafeSpentMap = {}
    validCafe.forEach((c) => {
      if (c.id_struk) {
        const sub = parseFloat(c.subtotal || (c.harga_satuan * c.qty) || 0)
        strukCafeSpentMap[c.id_struk] = (strukCafeSpentMap[c.id_struk] || 0) + sub
      }
    })

    // 1. Process Carwash visits
    validCw.forEach((cw) => {
      if (!cw.plat || !cw.plat.trim()) return
      const rawPlat = cw.plat.trim().toUpperCase().replace(/\s+/g, ' ')
      const platKey = rawPlat.replace(/\s+/g, '')

      if (!customerMap[platKey]) {
        customerMap[platKey] = {
          plat: rawPlat,
          visits: 0,
          carwashSpent: 0,
          cafeSpent: 0,
          totalSpent: 0,
          lastDate: cw.tanggal || cw.created_at || '',
          models: {},
          packages: {}
        }
      }

      const c = customerMap[platKey]
      c.visits++
      const cwPrice = parseFloat(cw.harga || 0)
      c.carwashSpent += cwPrice
      c.totalSpent += cwPrice

      // Check linked cafe spending from same struk
      if (cw.id_struk && strukCafeSpentMap[cw.id_struk]) {
        c.cafeSpent += strukCafeSpentMap[cw.id_struk]
        c.totalSpent += strukCafeSpentMap[cw.id_struk]
        delete strukCafeSpentMap[cw.id_struk] // Avoid double counting
      }

      const dStr = cw.tanggal || cw.created_at || ''
      if (dStr && (!c.lastDate || dStr > c.lastDate)) {
        c.lastDate = dStr
      }

      const mdl = (cw.model && cw.model.trim()) ? cw.model.trim() : 'Mobil'
      c.models[mdl] = (c.models[mdl] || 0) + 1

      const pkt = (cw.paket && cw.paket.trim()) ? cw.paket.trim() : 'Cuci Reguler'
      c.packages[pkt] = (c.packages[pkt] || 0) + 1
    })

    // 2. If Cafe only or remaining struk with customer names
    if (this.tenantBusinessType === 'CAFE' || Object.keys(customerMap).length === 0) {
      validStruk.forEach((s) => {
        const custName = (s.nama_pelanggan && s.nama_pelanggan.trim()) ? s.nama_pelanggan.trim().toUpperCase() : ''
        if (!custName) return
        const custKey = custName.replace(/\s+/g, '')

        if (!customerMap[custKey]) {
          customerMap[custKey] = {
            plat: custName,
            visits: 0,
            carwashSpent: 0,
            cafeSpent: 0,
            totalSpent: 0,
            lastDate: s.tanggal || s.created_at || '',
            models: { 'Pelanggan Meja': 1 },
            packages: { 'Order F&B': 1 }
          }
        }

        const c = customerMap[custKey]
        c.visits++
        const tot = parseFloat(s.total_tagihan || 0)
        c.cafeSpent += tot
        c.totalSpent += tot

        const dStr = s.tanggal || s.created_at || ''
        if (dStr && (!c.lastDate || dStr > c.lastDate)) {
          c.lastDate = dStr
        }
      })
    }

    const allCustomers = Object.values(customerMap)
    const totalUnique = allCustomers.length
    const refTime = parseDateSafe(this.referenceDate).getTime()

    // Enrich customers with computed fields
    allCustomers.forEach((c) => {
      // Primary model
      let topMdl = 'Mobil'
      let maxMdlCount = 0
      Object.entries(c.models).forEach(([m, cnt]) => {
        if (cnt > maxMdlCount) { maxMdlCount = cnt; topMdl = m }
      })
      c.primaryModel = topMdl

      // Primary package
      let topPkt = 'Cuci Reguler'
      let maxPktCount = 0
      Object.entries(c.packages).forEach(([p, cnt]) => {
        if (cnt > maxPktCount) { maxPktCount = cnt; topPkt = p }
      })
      c.primaryPackage = topPkt

      // Days inactive
      const lastTime = c.lastDate ? parseDateSafe(c.lastDate).getTime() : refTime
      c.daysInactive = Math.max(0, Math.floor((refTime - lastTime) / (1000 * 60 * 60 * 24)))

      // Masked plate (Zero PII, e.g. "B 12** ***" or "Tamu #12")
      if (c.plat.length > 5) {
        c.platMasked = c.plat.slice(0, 4) + '*** ' + c.plat.slice(-2)
      } else {
        c.platMasked = c.plat
      }

      // Stamps (target 5)
      c.stampsInCycle = c.visits % 5
      c.isRewardReady = c.visits > 0 && c.stampsInCycle === 0
      c.isNearReward = c.visits > 0 && c.stampsInCycle === 4
      c.isChurnRisk = c.visits >= 2 && c.daysInactive > 30
    })

    const vipCustomers = allCustomers.filter((c) => c.visits >= 5)
    const regularCustomers = allCustomers.filter((c) => c.visits >= 2 && c.visits < 5)
    const newCustomers = allCustomers.filter((c) => c.visits === 1)
    const churnRiskCustomers = allCustomers.filter((c) => c.isChurnRisk)
    const rewardReadyCustomers = allCustomers.filter((c) => c.isRewardReady)
    const nearRewardCustomers = allCustomers.filter((c) => c.isNearReward)

    const revenueAtRisk = churnRiskCustomers.reduce((sum, c) => sum + c.totalSpent, 0)
    const repeatRate = totalUnique > 0
      ? Math.round(((allCustomers.filter((c) => c.visits >= 2).length / totalUnique) * 100) * 10) / 10
      : 0

    // Top at-risk customers (sorted by highest historical totalSpent)
    const topAtRiskCustomers = [...churnRiskCustomers]
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 5)
      .map((c) => ({
        platMasked: c.platMasked,
        model: c.primaryModel,
        visits: c.visits,
        totalSpent: Math.round(c.totalSpent),
        daysInactive: c.daysInactive
      }))

    // High-yield hybrid / top spenders (sorted by totalSpent)
    const highYieldCustomers = [...allCustomers]
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 5)
      .map((c) => ({
        platMasked: c.platMasked,
        model: c.primaryModel,
        carwashSpent: Math.round(c.carwashSpent),
        cafeSpent: Math.round(c.cafeSpent),
        totalSpent: Math.round(c.totalSpent),
        visits: c.visits
      }))

    // Package affinity across customer base
    const packageCountMap = {}
    allCustomers.forEach((c) => {
      Object.entries(c.packages).forEach(([pkg, cnt]) => {
        packageCountMap[pkg] = (packageCountMap[pkg] || 0) + cnt
      })
    })

    const serviceAffinity = Object.entries(packageCountMap)
      .map(([packageName, count]) => ({
        packageName,
        count,
        percentage: totalUnique > 0 ? Math.round((count / allCustomers.reduce((s, x) => s + x.visits, 0)) * 1000) / 10 : 0
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    return {
      totalUniqueCustomers: totalUnique,
      vipCount: vipCustomers.length,
      regularCount: regularCustomers.length,
      newCount: newCustomers.length,
      repeatCustomerRate: repeatRate,
      churnRiskCount: churnRiskCustomers.length,
      revenueAtRisk: Math.round(revenueAtRisk),
      rewardReadyCount: rewardReadyCustomers.length,
      nearRewardCount: nearRewardCustomers.length,
      topAtRiskCustomers,
      highYieldCustomers,
      serviceAffinity,
      avgLTV: totalUnique > 0 ? Math.round(allCustomers.reduce((s, c) => s + c.totalSpent, 0) / totalUnique) : 0
    }
  }

  /**
   * 8. Pricing Elasticity & Calendar Yield Engine (Weekday vs Weekend, Payday vs Mid-Month)
   */
  calculatePricingElasticity() {
    const validStruk = this.getValidStruk()
    const weekdayMap = { count: 0, revenue: 0, days: new Set() }
    const weekendMap = { count: 0, revenue: 0, days: new Set() }
    const paydayMap = { count: 0, revenue: 0, days: new Set() }
    const midMonthMap = { count: 0, revenue: 0, days: new Set() }

    validStruk.forEach((s) => {
      const d = parseDateSafe(s.tanggal)
      const day = d.getDay() // 0 = Minggu, 5 = Jumat, 6 = Sabtu
      const dateNum = d.getDate()
      const dStr = s.tanggal ? s.tanggal.slice(0, 10) : ''
      const total = parseFloat(s.total_tagihan) || 0

      // Weekday (Senin-Kamis) vs Weekend (Jumat-Minggu)
      if (day >= 1 && day <= 4) {
        weekdayMap.count++
        weekdayMap.revenue += total
        if (dStr) weekdayMap.days.add(dStr)
      } else {
        weekendMap.count++
        weekendMap.revenue += total
        if (dStr) weekendMap.days.add(dStr)
      }

      // Payday (25 - 5) vs Mid-Month (6 - 24)
      if (dateNum >= 25 || dateNum <= 5) {
        paydayMap.count++
        paydayMap.revenue += total
        if (dStr) paydayMap.days.add(dStr)
      } else {
        midMonthMap.count++
        midMonthMap.revenue += total
        if (dStr) midMonthMap.days.add(dStr)
      }
    })

    const avgWeekdayDaily = weekdayMap.days.size > 0 ? Math.round(weekdayMap.revenue / weekdayMap.days.size) : 0
    const avgWeekendDaily = weekendMap.days.size > 0 ? Math.round(weekendMap.revenue / weekendMap.days.size) : 0
    const avgPaydayDaily = paydayMap.days.size > 0 ? Math.round(paydayMap.revenue / paydayMap.days.size) : 0
    const avgMidMonthDaily = midMonthMap.days.size > 0 ? Math.round(midMonthMap.revenue / midMonthMap.days.size) : 0

    return {
      avgWeekdayDaily,
      avgWeekendDaily,
      weekendSurgePercent: avgWeekdayDaily > 0 ? Math.round(((avgWeekendDaily - avgWeekdayDaily) / avgWeekdayDaily) * 100) : 0,
      avgPaydayDaily,
      avgMidMonthDaily,
      paydaySurgePercent: avgMidMonthDaily > 0 ? Math.round(((avgPaydayDaily - avgMidMonthDaily) / avgMidMonthDaily) * 100) : 0
    }
  }

  /**
   * 9. Inventory Valuation & Runway Engine
   */
  calculateInventoryMetrics() {
    let totalValuation = 0
    const criticalItems = []

    this.stok_barang.forEach((item) => {
      const stock = parseFloat(item.stok ?? item.stok_akhir ?? 0)
      const cost = parseFloat(item.harga_satuan ?? item.harga_beli ?? item.hpp ?? 0)
      const minStock = parseFloat(item.min_stok ?? 100)

      totalValuation += (stock * cost)

      if (stock <= minStock || stock <= 100) {
        criticalItems.push({
          id: item.id || item.id_barang,
          nama_produk: item.nama_produk || item.nama_barang,
          stok: stock,
          satuan: item.satuan || 'unit',
          min_stok: minStock,
          harga_satuan: cost
        })
      }
    })

    return {
      totalInventoryValuation: Math.round(totalValuation),
      criticalStockItems: criticalItems.slice(0, 5),
      totalStockSkus: this.stok_barang.length
    }
  }

  /**
   * 10. External Context & Calendar Factors
   */
  extractExternalContext() {
    const d = parseDateSafe(this.referenceDate)
    const day = d.getDay() // 0 = Minggu, 5 = Jumat, 6 = Sabtu
    const dateNum = d.getDate()

    const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
    const isWeekend = day === 0 || day === 6
    const isPaydayCycle = dateNum >= 25 || dateNum <= 5

    return {
      referenceDate: this.referenceDate,
      dayNameIndo: dayNames[day] || 'Hari',
      isWeekend,
      isPaydayCycle,
      paydayLabel: isPaydayCycle ? 'Periode Gajian (Payday Peak)' : 'Pertengahan Bulan (Mid-Month Flow)'
    }
  }

  /**
   * 11. Rule-Based Deterministic Anomalies Detector
   */
  detectAnomalies() {
    const anomalies = []
    const financial = this.calculateFinancialMetrics()
    const synergy = this.calculateSynergyMetrics()
    const inventory = this.calculateInventoryMetrics()

    if (financial.expenseRatio > 70 && financial.totalRevenue > 0) {
      anomalies.push({
        type: 'HIGH_OPEX',
        severity: 'HIGH',
        message: `Rasio pengeluaran mencapai ${financial.expenseRatio}% dari total omzet (Batas wajar: ≤ 50%).`
      })
    }

    if (this.tenantBusinessType === 'HYBRID' && synergy.crossConversionRate < 25 && synergy.totalCarwashStruks >= 5) {
      anomalies.push({
        type: 'LOW_CROSS_SELL',
        severity: 'MEDIUM',
        message: `Tingkat konversi estafet cuci ke cafe hanya ${synergy.crossConversionRate}%. Peluang cross-selling belum tergarap optimal.`
      })
    }

    if (inventory.criticalStockItems.length >= 3) {
      anomalies.push({
        type: 'CRITICAL_STOCK_BURNOUT',
        severity: 'HIGH',
        message: `Terdapat ${inventory.criticalStockItems.length} item bahan baku di bawah batas aman minimum.`
      })
    }

    return anomalies
  }

  /**
   * Master Method: Calculate Full Comprehensive Business Intelligence Snapshot
   */
  calculateComprehensiveMetrics() {
    return {
      financial: this.calculateFinancialMetrics(),
      cashier: this.calculateCashierDistribution(),
      hourly: this.calculateHourlyTraffic(),
      carwash: this.calculateCarwashMetrics(),
      cafe: this.calculateCafeMetrics(),
      synergy: this.calculateSynergyMetrics(),
      crm: this.calculateCustomerCohorts(),
      elasticity: this.calculatePricingElasticity(),
      inventory: this.calculateInventoryMetrics(),
      external: this.extractExternalContext(),
      anomalies: this.detectAnomalies()
    }
  }

  /**
   * Helper Komparasi Historis Dinamis Multi-Sektor (MoM / WoW / Custom)
   * Menyajikan varians delta komprehensif untuk Finansial, Carwash, Cafe, Estafet, dan CRM.
   */
  static calculateHistoricalComparison(currentMetrics = {}, previousMetrics = {}, currentLabel = 'Periode Ini', previousLabel = 'Periode Sebelumnya') {
    const curFin = currentMetrics.financial || {}
    const prevFin = previousMetrics.financial || {}

    const curCashier = currentMetrics.cashier || {}
    const prevCashier = previousMetrics.cashier || {}

    const curCw = currentMetrics.carwash || {}
    const prevCw = previousMetrics.carwash || {}

    const curCf = currentMetrics.cafe || {}
    const prevCf = previousMetrics.cafe || {}

    const curSyn = currentMetrics.synergy || {}
    const prevSyn = previousMetrics.synergy || {}

    const curCrm = currentMetrics.cohorts || {}
    const prevCrm = previousMetrics.cohorts || {}

    const calcDelta = (currVal, prevVal) => {
      const c = parseFloat(currVal) || 0
      const p = parseFloat(prevVal) || 0
      const delta = c - p
      const percent = p !== 0 ? Math.round(((c - p) / Math.abs(p)) * 1000) / 10 : (c > 0 ? 100 : 0)
      return { current: c, previous: p, delta, percent }
    }

    const calcPoints = (currVal, prevVal) => {
      const c = parseFloat(currVal) || 0
      const p = parseFloat(prevVal) || 0
      const deltaBps = Math.round((c - p) * 10) / 10
      return { current: c, previous: p, deltaBps }
    }

    return {
      currentLabel,
      previousLabel,
      // Backward-compatible flat metrics
      metrics: {
        revenue: {
          label: 'Total Omzet Penjualan',
          ...calcDelta(curFin.totalRevenue, prevFin.totalRevenue)
        },
        expenses: {
          label: 'Total Beban Usaha (OPEX)',
          ...calcDelta(curFin.totalExpenses, prevFin.totalExpenses)
        },
        netProfit: {
          label: 'Laba Bersih Operasional',
          ...calcDelta(curFin.netProfit, prevFin.netProfit)
        },
        profitMargin: {
          label: 'Net Profit Margin (%)',
          ...calcPoints(curFin.profitMargin, prevFin.profitMargin)
        },
        expenseRatio: {
          label: 'Rasio Beban terhadap Omzet (%)',
          ...calcPoints(curFin.expenseRatio, prevFin.expenseRatio)
        },
        txCount: {
          label: 'Volume Struk Kasir',
          ...calcDelta(curCashier.totalTxCount, prevCashier.totalTxCount)
        },
        carwashUnits: {
          label: 'Total Kendaraan Cuci',
          ...calcDelta(curCw.totalUnits, prevCw.totalUnits)
        },
        carwashAOV: {
          label: 'Carwash Ticket AOV',
          ...calcDelta(curCw.carwashAOV, prevCw.carwashAOV)
        },
        cafeRevenue: {
          label: 'Omzet Penjualan Cafe',
          ...calcDelta(curCf.totalRevenue, prevCf.totalRevenue)
        },
        cafeAOV: {
          label: 'Cafe Ticket AOV per Meja',
          ...calcDelta(curCf.cafeAOV, prevCf.cafeAOV)
        },
        crossConversionRate: {
          label: 'Tingkat Konversi Estafet (%)',
          ...calcPoints(curSyn.crossConversionRate, prevSyn.crossConversionRate)
        }
      },
      // Sector-specific granular comparison
      sectors: {
        financial: {
          title: 'Keuangan & Pembukuan',
          revenue: { label: 'Total Omzet Penjualan', ...calcDelta(curFin.totalRevenue, prevFin.totalRevenue) },
          expenses: { label: 'Total Beban Usaha (OPEX)', ...calcDelta(curFin.totalExpenses, prevFin.totalExpenses), isExpense: true },
          netProfit: { label: 'Laba Bersih Operasional', ...calcDelta(curFin.netProfit, prevFin.netProfit) },
          profitMargin: { label: 'Net Profit Margin (%)', ...calcPoints(curFin.profitMargin, prevFin.profitMargin), isPoints: true },
          expenseRatio: { label: 'Rasio Beban terhadap Omzet (%)', ...calcPoints(curFin.expenseRatio, prevFin.expenseRatio), isPoints: true, isExpense: true },
          cashPayment: { label: 'Kasir Uang Tunai (CASH)', ...calcDelta(curCashier.totalCash, prevCashier.totalCash) },
          nonCashPayment: { label: 'Kasir Non-Tunai (QRIS/Transfer)', ...calcDelta(curCashier.totalNonCash, prevCashier.totalNonCash) },
          txCount: { label: 'Total Struk Kasir', ...calcDelta(curCashier.totalTxCount, prevCashier.totalTxCount) }
        },
        carwash: {
          title: 'Operasional Carwash',
          totalUnits: { label: 'Total Unit Mobil Dicuci', ...calcDelta(curCw.totalUnits, prevCw.totalUnits), unit: 'unit' },
          avgCarsPerDay: { label: 'Rata-rata Mobil / Hari', ...calcDelta(curCw.avgCarsPerDay, prevCw.avgCarsPerDay), unit: 'mobil/hari' },
          carwashRevenue: { label: 'Omzet Penjualan Cuci', ...calcDelta(curCw.totalRevenue, prevCw.totalRevenue) },
          carwashAOV: { label: 'Rata-rata Belanja per Mobil (AOV)', ...calcDelta(curCw.carwashAOV, prevCw.carwashAOV) }
        },
        cafe: {
          title: 'Operasional F&B Cafe & Resto',
          cafeRevenue: { label: 'Omzet Penjualan Cafe', ...calcDelta(curCf.totalRevenue, prevCf.totalRevenue) },
          totalItems: { label: 'Total Porsi Menu Terjual', ...calcDelta(curCf.totalItems, prevCf.totalItems), unit: 'porsi' },
          cafeStrukCount: { label: 'Jumlah Order / Struk Meja', ...calcDelta(curCf.cafeStrukCount, prevCf.cafeStrukCount), unit: 'order' },
          cafeAOV: { label: 'Rata-rata Belanja per Meja (AOV)', ...calcDelta(curCf.cafeAOV, prevCf.cafeAOV) }
        },
        synergy: {
          title: 'Sinergi Estafet (Cross-Selling)',
          crossConversionRate: { label: 'Tingkat Konversi Cuci ➔ Cafe (%)', ...calcPoints(curSyn.crossConversionRate, prevSyn.crossConversionRate), isPoints: true },
          crossConversionCount: { label: 'Jumlah Tamu Cuci Order Cafe', ...calcDelta(curSyn.crossConversionCount, prevSyn.crossConversionCount), unit: 'tamu' },
          crossCafeRevenue: { label: 'Omzet F&B dari Tamu Cuci Mobil', ...calcDelta(curSyn.crossCafeRevenue, prevSyn.crossCafeRevenue) },
          combinedARPU: { label: 'Combined ARPU (Belanja Rata-rata Gabungan)', ...calcDelta(curSyn.combinedARPU, prevSyn.combinedARPU) },
          capacityEfficiency: { label: 'Efisiensi Kapasitas Bay (%)', ...calcPoints(curSyn.capacityEfficiency, prevSyn.capacityEfficiency), isPoints: true }
        },
        crm: {
          title: 'Pelanggan & CRM (Zero-PII)',
          totalUnique: { label: 'Total Pelanggan Unik Terdata', ...calcDelta(curCrm.totalUniqueCustomers, prevCrm.totalUniqueCustomers), unit: 'pelanggan' },
          vipCount: { label: 'Pelanggan VIP (Kunjungan ≥5x)', ...calcDelta(curCrm.vipCount, prevCrm.vipCount), unit: 'pelanggan' },
          repeatCustomerRate: { label: 'Repeat Customer Rate (%)', ...calcPoints(curCrm.repeatCustomerRate, prevCrm.repeatCustomerRate), isPoints: true },
          churnRisk: { label: 'Deteksi Pelanggan Berisiko Churn (>45 hari)', ...calcDelta(curCrm.churnRiskCount, prevCrm.churnRiskCount), unit: 'pelanggan', isExpense: true },
          avgLTV: { label: 'Estimasi Nilai Seumur Hidup (Avg LTV)', ...calcDelta(curCrm.avgLTV, prevCrm.avgLTV) }
        }
      }
    }
  }
}
