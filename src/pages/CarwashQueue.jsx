import React, { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { subscribeCarwashQueueRealtime } from '../hooks/domain/useCarwashQueue'
import { 
  Car, 
  Clock, 
  User, 
  Users, 
  CheckCircle, 
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Search,
  Calendar,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  MessageCircle,
  CheckSquare,
  Square,
  Columns3,
  List,
  Play,
  Plus,
  X
} from 'lucide-react'

const CarwashQueue = () => {
  const { activeTenant } = useAuth()
  const [loading, setLoading] = useState(true)
  const [queue, setQueue] = useState([])
  const [selectedDate, setSelectedDate] = useState(() => new Date().toLocaleDateString('en-CA'))
  const [filterType, setFilterType] = useState('ALL') // 'ALL', 'TUNGGU', 'TINGGAL'
  const [statusTab, setStatusTab] = useState('Pending') // 'Pending' or 'Selesai'
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState('kanban') // 'kanban' | 'list'

  // QC Modal & Detailing Inspection States
  const [qcModalItem, setQcModalItem] = useState(null)
  const [qcChecklist, setQcChecklist] = useState({
    bodyClean: true,
    interiorVacuum: true,
    glassClear: true,
    tireShine: true
  })
  const [updatingId, setUpdatingId] = useState(null)

  const fetchQueue = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('carwash')
        .select(`
          id,
          id_transaksi,
          id_struk,
          kehadiran,
          variant,
          ukuran,
          paket,
          anggota_1,
          anggota_2,
          plat,
          harga,
          status,
          created_at,
          tanggal,
          jam,
          model,
          no_telepon,
          kondisi_bodi,
          barang_berharga,
          catatan_kendaraan,
          status_pengerjaan,
          struk (
            kasir
          )
        `)
        .eq('tanggal', selectedDate)

      if (activeTenant?.id && query && typeof query.eq === 'function') {
        query = query.eq('tenant_id', activeTenant.id)
      }

      const { data, error } = await query.order('jam', { ascending: true })

      if (error) {
        console.error('Error fetching carwash queue:', error)
        setQueue([])
        return
      }

      let formattedData = []
      if (Array.isArray(data)) {
        formattedData = data.map((item) => ({
          id: item.id || item.id_transaksi,
          idTransaksi: item.id_transaksi || null,
          platNomor: item.plat || '-',
          kehadiran: (item.kehadiran || 'TUNGGU').toUpperCase(),
          variant: item.variant || '-',
          ukuran: item.ukuran || 'Sedang',
          paket: item.paket || 'Cuci Standar',
          anggota1: item.anggota_1 || '-',
          anggota2: item.anggota_2 || '',
          harga: parseFloat(item.harga) || 0,
          strukId: item.id_struk || '',
          createdAt: item.created_at || '',
          tanggal: item.tanggal || selectedDate,
          jam: item.jam || '00:00:00',
          statusBayar: item.status || 'Pending',
          kasir: item.struk?.kasir || 'Staff',
          model: item.model || 'Mobil',
          noTelepon: item.no_telepon || '',
          kondisiBodi: item.kondisi_bodi || 'Normal',
          barangBerharga: item.barang_berharga || 'Aman',
          catatanKendaraan: item.catatan_kendaraan || '',
          statusPengerjaan: item.status_pengerjaan || (item.status === 'Selesai' ? 'Siap Diambil' : 'Sedang Dicuci')
        }))
      }

      setQueue(formattedData)

      // Auto-switch tab to Selesai if there are no pending cars, but completed cars exist
      const pendingCount = formattedData.filter((q) => q.statusBayar === 'Pending').length
      const selesaiCount = formattedData.filter((q) => q.statusBayar === 'Selesai').length
      if (pendingCount === 0 && selesaiCount > 0) {
        setStatusTab('Selesai')
      }
    } catch (err) {
      console.error('Unexpected error in fetchQueue:', err)
      setQueue([])
    } finally {
      setLoading(false)
    }
  }, [selectedDate, activeTenant?.id])

  // Real-time subscription scoped by tenant_id + 250ms debounce
  useEffect(() => {
    fetchQueue()
    return subscribeCarwashQueueRealtime({
      client: supabase,
      tenantId: activeTenant?.id || null,
      onChange: fetchQueue,
      debounceMs: 250
    })
  }, [fetchQueue, activeTenant?.id])

  const isUuidVal = (val) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)

  const handleStartWashing = async (item) => {
    setUpdatingId(item.id)
    try {
      const filterCol = isUuidVal(item.id) ? 'id' : 'id_transaksi'
      const { error } = await supabase
        .from('carwash')
        .update({
          status_pengerjaan: 'Sedang Dicuci'
        })
        .eq(filterCol, item.id)

      if (error) console.error('Error updating status to Sedang Dicuci:', error)
      setQueue(prev => prev.map(q => q.id === item.id ? { ...q, statusPengerjaan: 'Sedang Dicuci' } : q))
    } catch (err) {
      console.error('Failed to start washing:', err)
    } finally {
      setUpdatingId(null)
    }
  }

  const handleCompleteQc = async () => {
    if (!qcModalItem) return
    setUpdatingId(qcModalItem.id)
    try {
      const filterCol = isUuidVal(qcModalItem.id) ? 'id' : 'id_transaksi'
      const { error } = await supabase
        .from('carwash')
        .update({
          status_pengerjaan: 'Siap Diambil'
        })
        .eq(filterCol, qcModalItem.id)

      if (error) {
        console.error('Error updating QC status:', error)
      }

      setQueue(prev => prev.map(item => 
        item.id === qcModalItem.id ? { ...item, statusPengerjaan: 'Siap Diambil' } : item
      ))
      setQcModalItem(null)
    } catch (err) {
      console.error('Failed to update status:', err)
    } finally {
      setUpdatingId(null)
    }
  }

  const handleSendWhatsAppNotification = (item) => {
    if (!item.noTelepon) return
    let cleanPhone = item.noTelepon.replace(/\D/g, '')
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '62' + cleanPhone.slice(1)
    }
    const message = `Halo Bpk/Ibu Pelanggan RelayPOS,\n\nPemberitahuan: Kendaraan Anda *${item.model} (${item.platNomor})* telah selesai kami bersihkan dan saat ini *SIAP DIAMBIL* di outlet RelayPOS.\n\nLayanan: ${item.paket}\nTerima kasih atas kepercayaannya!`
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank')
  }

  const calculateDuration = (tanggal, jam) => {
    if (!tanggal || !jam) return 'Tidak diketahui'
    const cleanJam = jam.replace(/\./g, ':')
    const checkInDateTime = new Date(`${tanggal}T${cleanJam}`)
    
    if (isNaN(checkInDateTime.getTime())) return jam
    
    const diffMs = Date.now() - checkInDateTime.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    
    if (diffMins < 0) return 'Baru saja'
    if (diffMins < 1) return 'Baru saja'
    if (diffMins < 60) return `${diffMins} menit`
    
    const diffHrs = Math.floor(diffMins / 60)
    const remainMins = diffMins % 60
    return remainMins > 0 ? `${diffHrs}j ${remainMins}m` : `${diffHrs} jam`
  }

  // Counts for Badges
  const pendingItems = queue.filter((item) => item.statusBayar === 'Pending')
  const selesaiItems = queue.filter((item) => item.statusBayar === 'Selesai')

  // Kanban Streams
  const waitingQueue = queue.filter(item => {
    const isWaiting = item.statusPengerjaan === 'Menunggu' || item.statusPengerjaan === 'Antre' || (item.statusBayar === 'Pending' && item.statusPengerjaan !== 'Sedang Dicuci' && item.statusPengerjaan !== 'Siap Diambil')
    const matchesSearch = !searchQuery || 
      (item.platNomor || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
      (item.paket || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.anggota1 || '').toLowerCase().includes(searchQuery.toLowerCase())
    const matchesFilter = filterType === 'ALL' || item.kehadiran === filterType
    return isWaiting && matchesSearch && matchesFilter
  })

  const washingQueue = queue.filter(item => {
    const isWashing = item.statusPengerjaan === 'Sedang Dicuci'
    const matchesSearch = !searchQuery || 
      (item.platNomor || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
      (item.paket || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.anggota1 || '').toLowerCase().includes(searchQuery.toLowerCase())
    const matchesFilter = filterType === 'ALL' || item.kehadiran === filterType
    return isWashing && matchesSearch && matchesFilter
  })

  const readyQueue = queue.filter(item => {
    const isReady = item.statusPengerjaan === 'Siap Diambil' || item.statusBayar === 'Selesai'
    const matchesSearch = !searchQuery || 
      (item.platNomor || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
      (item.paket || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.anggota1 || '').toLowerCase().includes(searchQuery.toLowerCase())
    const matchesFilter = filterType === 'ALL' || item.kehadiran === filterType
    return isReady && matchesSearch && matchesFilter
  })

  const filteredQueue = queue.filter((item) => {
    const matchesTab = item.statusBayar === statusTab
    const matchesFilter = filterType === 'ALL' || item.kehadiran === filterType
    const matchesSearch = 
      (item.platNomor || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
      (item.paket || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.anggota1 || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.anggota2 || '').toLowerCase().includes(searchQuery.toLowerCase())
    return matchesTab && matchesFilter && matchesSearch
  })

  const isToday = selectedDate === new Date().toLocaleDateString('en-CA')

  return (
    <div className="p-4 sm:p-6 pb-24 md:pb-6 space-y-5 max-w-7xl mx-auto animate-fade-in bg-canvas text-foreground">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-surface border border-border p-4 sm:p-5 rounded-2xl shadow-xs">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <span className="p-2 bg-primary-soft text-primary rounded-xl border border-primary/25">
              <Car size={22} strokeWidth={1.75} />
            </span>
            Antrean Carwash
          </h1>
          <p className="text-muted text-xs mt-1">
            Live Kanban pengerjaan bay cuci mobil &amp; kru pencuci real-time
          </p>
        </div>

        {/* View Mode Switcher & Date Controls */}
        <div className="flex items-center flex-wrap gap-2.5">
          {/* Switcher: Kanban Bay vs Daftar Tab */}
          <div className="flex bg-subsurface p-1 rounded-xl border border-border">
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 tap-tactile cursor-pointer ${
                viewMode === 'kanban'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              <Columns3 size={13} strokeWidth={1.75} />
              <span>Kanban Bay</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 tap-tactile cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              <List size={13} strokeWidth={1.75} />
              <span>Daftar Tab</span>
            </button>
          </div>

          <div className="flex items-center gap-2 bg-subsurface px-3 py-1.5 rounded-xl border border-border text-xs text-foreground min-h-[40px]">
            <Calendar size={14} strokeWidth={1.75} className="text-primary shrink-0" />
            <input
              type="date"
              aria-label="Filter tanggal antrean"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="!border-0 !bg-transparent !p-0 text-foreground focus:outline-none text-base sm:text-xs cursor-pointer font-medium"
            />
          </div>

          {!isToday && (
            <button
              type="button"
              onClick={() => setSelectedDate(new Date().toLocaleDateString('en-CA'))}
              className="min-h-[40px] px-3.5 py-1.5 bg-primary-soft hover:opacity-90 text-primary-soft-foreground border border-primary/25 rounded-full text-xs font-semibold transition-all tap-tactile cursor-pointer"
            >
              Hari Ini
            </button>
          )}

          <Link
            to="/pos?tab=carwash"
            className="min-h-[44px] flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary-hover text-primary-foreground font-semibold text-xs rounded-full shadow-xs transition-all tap-tactile shrink-0"
            title="Daftarkan mobil baru di POS Carwash"
          >
            <Plus size={15} strokeWidth={2.5} />
            <span>Kendaraan Masuk</span>
          </Link>

          <button
            type="button"
            onClick={fetchQueue}
            disabled={loading}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center bg-subsurface hover:bg-surface-hover border border-border hover:border-border-hover text-foreground rounded-xl transition-all tap-tactile disabled:opacity-50 cursor-pointer"
            title="Refresh Antrean"
            aria-label="Refresh Antrean"
          >
            <RefreshCw size={16} strokeWidth={1.75} className={loading ? 'animate-spin text-primary' : ''} />
          </button>
        </div>
      </div>

      {/* Filter and Search Section */}
      <div className="bg-surface p-3 rounded-2xl flex flex-col md:flex-row justify-between gap-3 border border-border shadow-xs">
        {/* Kehadiran Filter (Tunggu / Tinggal) */}
        <div className="overflow-x-auto no-scrollbar max-w-full self-start">
          <div className="flex bg-subsurface p-1 rounded-xl border border-border flex-nowrap">
            <button
              type="button"
              onClick={() => setFilterType('ALL')}
              className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-all tap-tactile whitespace-nowrap cursor-pointer ${
                filterType === 'ALL'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              Semua ({queue.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('TUNGGU')}
              className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-all tap-tactile whitespace-nowrap cursor-pointer ${
                filterType === 'TUNGGU'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              Ditunggu ({queue.filter((q) => q.kehadiran === 'TUNGGU').length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('TINGGAL')}
              className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-all tap-tactile whitespace-nowrap cursor-pointer ${
                filterType === 'TINGGAL'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              Ditinggal ({queue.filter((q) => q.kehadiran === 'TINGGAL').length})
            </button>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-dark pointer-events-none" size={15} strokeWidth={1.75} />
          <input
            type="text"
            aria-label="Cari plat nomor, paket, atau kru"
            placeholder="Cari plat nomor, paket, atau kru..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full min-h-[44px] pl-10 pr-4 py-2 bg-subsurface border border-border rounded-xl text-foreground placeholder:text-muted-dark focus:outline-none focus:border-border-active focus:ring-2 focus:ring-ring/20 text-base sm:text-xs transition-colors"
          />
        </div>
      </div>

      {/* VIEW MODE 1: LIVE KANBAN BAY BOARD (TABLET LANDSCAPE OPTIMIZED) */}
      {viewMode === 'kanban' ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
          {/* KOLOM 1: ANTREAN MASUK (WAITING) */}
          <div className="bg-surface border border-border rounded-2xl p-3.5 flex flex-col space-y-3 min-h-[400px] shadow-xs">
            <div className="flex items-center justify-between pb-2.5 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-warning"></span>
                <h3 className="font-bold text-xs uppercase tracking-wider text-foreground">
                  Antrean Masuk
                </h3>
              </div>
              <span className="text-[10px] font-mono tabular-nums font-bold px-2.5 py-0.5 rounded-full bg-warning-bg text-warning border border-warning/30">
                {waitingQueue.length} unit
              </span>
            </div>

            {waitingQueue.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted">
                <Clock size={28} strokeWidth={1.5} className="mb-2 text-muted-dark" />
                <p className="text-xs font-semibold text-foreground">Tidak ada antrean baru</p>
                <p className="text-[11px] text-muted mt-0.5 mb-3">Daftarkan mobil masuk melalui kasir.</p>
                <Link
                  to="/pos?tab=carwash"
                  className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-1.5 bg-primary-soft hover:opacity-90 text-primary-soft-foreground border border-primary/25 rounded-full text-xs font-semibold transition-all tap-tactile"
                >
                  <Plus size={13} strokeWidth={2} />
                  <span>Input Kendaraan di POS</span>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {waitingQueue.map((item) => (
                  <div
                    key={item.id}
                    className="bg-subsurface p-3.5 rounded-xl border border-border hover:border-border-hover transition-all flex flex-col space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-mono text-lg font-black text-foreground tracking-wider">
                        {item.platNomor}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase border shrink-0 ${
                        item.kehadiran === 'TUNGGU'
                          ? 'bg-warning-bg text-warning border-warning/30'
                          : 'bg-primary-soft text-primary-soft-foreground border-primary/25'
                      }`}>
                        {item.kehadiran}
                      </span>
                    </div>

                    <div className="text-xs text-foreground space-y-0.5">
                      <p className="font-bold text-foreground">{item.paket}</p>
                      <p className="text-[11px] text-muted">{item.model} • {item.ukuran}</p>
                    </div>

                    <div className="pt-2 border-t border-border flex items-center justify-between text-[11px] text-muted">
                      <span>Masuk: {item.jam}</span>
                      <span className="text-warning font-mono tabular-nums font-semibold inline-flex items-center gap-1">
                        <Clock size={12} className="shrink-0" />
                        <span>{calculateDuration(item.tanggal, item.jam)}</span>
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={updatingId === item.id}
                      onClick={() => handleStartWashing(item)}
                      className="w-full min-h-[44px] py-2 bg-primary hover:bg-primary-hover text-primary-foreground font-semibold text-xs rounded-full transition-all flex items-center justify-center gap-1.5 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                    >
                      <Play size={13} strokeWidth={2} />
                      <span>Masuk Bay Cuci</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* KOLOM 2: SEDANG DICUCI (BAY SLOTS) */}
          <div className="bg-surface border border-border rounded-2xl p-3.5 flex flex-col space-y-3 min-h-[400px] shadow-xs">
            <div className="flex items-center justify-between pb-2.5 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-primary"></span>
                <h3 className="font-bold text-xs uppercase tracking-wider text-foreground">
                  Sedang Dicuci (Bay)
                </h3>
              </div>
              <span className="text-[10px] font-mono tabular-nums font-bold px-2.5 py-0.5 rounded-full bg-primary-soft text-primary-soft-foreground border border-primary/25">
                {washingQueue.length} unit
              </span>
            </div>

            {washingQueue.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted">
                <Car size={28} strokeWidth={1.5} className="mb-2 text-muted-dark" />
                <p className="text-xs font-semibold text-foreground">Bay cuci kosong</p>
                <p className="text-[11px] text-muted mt-0.5">Siap menerima kendaraan dari antrean masuk.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {washingQueue.map((item) => (
                  <div
                    key={item.id}
                    className="bg-subsurface p-3.5 rounded-xl border border-border hover:border-border-active/60 transition-all flex flex-col space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-mono text-lg font-black text-foreground tracking-wider">
                        {item.platNomor}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-primary-soft text-primary-soft-foreground border border-primary/25 shrink-0">
                        {item.paket}
                      </span>
                    </div>

                    <div className="text-xs text-foreground space-y-0.5">
                      <p className="text-[11px] text-muted">{item.model} • {item.ukuran}</p>
                      <p className="text-[11px] text-foreground flex items-center gap-1">
                        <Users size={12} strokeWidth={1.75} className="text-muted" />
                        <span>Kru: {item.anggota1} {item.anggota2 ? `+ ${item.anggota2}` : ''}</span>
                      </p>
                    </div>

                    <div className="pt-2 border-t border-border flex items-center justify-between text-[11px] text-muted">
                      <span>Mulai: {item.jam}</span>
                      <span className="text-primary font-mono tabular-nums font-bold inline-flex items-center gap-1">
                        <Clock size={12} className="shrink-0" />
                        <span>{calculateDuration(item.tanggal, item.jam)}</span>
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={updatingId === item.id}
                      onClick={() => {
                        setQcModalItem(item)
                        setQcChecklist({
                          bodyClean: true,
                          interiorVacuum: true,
                          glassClear: true,
                          tireShine: true
                        })
                      }}
                      className="w-full min-h-[44px] py-2 bg-primary hover:bg-primary-hover text-primary-foreground font-semibold text-xs rounded-full transition-all flex items-center justify-center gap-1.5 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                    >
                      <ShieldCheck size={13} strokeWidth={1.75} />
                      <span>Selesaikan Cuci (QC)</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* KOLOM 3: SELESAI DICUCI & SIAP DIAMBIL */}
          <div className="bg-surface border border-border rounded-2xl p-3.5 flex flex-col space-y-3 min-h-[400px] shadow-xs">
            <div className="flex items-center justify-between pb-2.5 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-success"></span>
                <h3 className="font-bold text-xs uppercase tracking-wider text-foreground">
                  Siap Diambil
                </h3>
              </div>
              <span className="text-[10px] font-mono tabular-nums font-bold px-2.5 py-0.5 rounded-full bg-success-bg text-success border border-success/30">
                {readyQueue.length} unit
              </span>
            </div>

            {readyQueue.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted">
                <CheckCircle2 size={28} strokeWidth={1.5} className="mb-2 text-muted-dark" />
                <p className="text-xs font-semibold text-foreground">Belum ada mobil selesai</p>
                <p className="text-[11px] text-muted mt-0.5">Mobil yang selesai QC akan muncul di sini.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {readyQueue.map((item) => (
                  <div
                    key={item.id}
                    className="bg-subsurface p-3.5 rounded-xl border border-border hover:border-success/40 transition-all flex flex-col space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-mono text-lg font-black text-foreground tracking-wider">
                        {item.platNomor}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase border shrink-0 ${
                        item.statusBayar === 'Selesai'
                          ? 'bg-success-bg text-success border-success/30'
                          : 'bg-warning-bg text-warning border-warning/30'
                      }`}>
                        {item.statusBayar === 'Selesai' ? 'Lunas' : 'Belum Bayar'}
                      </span>
                    </div>

                    <div className="text-xs text-foreground space-y-0.5">
                      <p className="font-bold text-foreground">{item.paket}</p>
                      <p className="text-[11px] text-muted">{item.model} • {item.ukuran}</p>
                    </div>

                    <div className="pt-2 border-t border-border flex items-center justify-between text-[11px] text-muted">
                      <span>Kru: {item.anggota1}</span>
                      <span className="text-success font-mono font-bold inline-flex items-center gap-1">
                        <CheckCircle2 size={12} className="shrink-0" /> Selesai QC
                      </span>
                    </div>

                    {item.noTelepon && (
                      <button
                        type="button"
                        onClick={() => handleSendWhatsAppNotification(item)}
                        className="w-full min-h-[44px] py-2 px-3 bg-success-bg hover:opacity-90 text-success border border-success/30 font-semibold text-xs rounded-full transition-all flex items-center justify-center gap-1.5 active:scale-[0.98] cursor-pointer"
                      >
                        <MessageCircle size={13} strokeWidth={1.75} />
                        <span>Kirim Notifikasi WA</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* VIEW MODE 2: TABULAR / LIST CARDS */
        <>
          {/* Status Tabs with Live Count Badges */}
          <div className="flex gap-4 border-b border-border pb-1 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => setStatusTab('Pending')}
              className={`pb-3 px-3 font-semibold text-sm transition-all border-b-2 flex items-center gap-2.5 relative tap-tactile whitespace-nowrap cursor-pointer ${
                statusTab === 'Pending'
                  ? 'text-warning border-warning'
                  : 'text-muted border-transparent hover:text-foreground'
              }`}
            >
              <Clock size={16} strokeWidth={1.75} />
              <span>Dalam Proses</span>
              <span className={`text-[10px] font-bold font-mono tabular-nums px-2 py-0.5 rounded-full ${
                pendingItems.length > 0
                  ? 'bg-warning-bg text-warning border border-warning/30'
                  : 'bg-subsurface text-muted border border-border'
              }`}>
                {pendingItems.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusTab('Selesai')}
              className={`pb-3 px-3 font-semibold text-sm transition-all border-b-2 flex items-center gap-2.5 relative tap-tactile whitespace-nowrap cursor-pointer ${
                statusTab === 'Selesai'
                  ? 'text-success border-success'
                  : 'text-muted border-transparent hover:text-foreground'
              }`}
            >
              <CheckCircle size={16} strokeWidth={1.75} />
              <span>Selesai Dicuci</span>
              <span className={`text-[10px] font-bold font-mono tabular-nums px-2 py-0.5 rounded-full ${
                selesaiItems.length > 0
                  ? 'bg-success-bg text-success border border-success/30'
                  : 'bg-subsurface text-muted border border-border'
              }`}>
                {selesaiItems.length}
              </span>
            </button>
          </div>

          {/* Filter and Search Section */}
          <div className="bg-surface p-3.5 rounded-2xl flex flex-col md:flex-row justify-between gap-3 border border-border shadow-xs">
            {/* Kehadiran Filter (Tunggu / Tinggal) */}
            <div className="overflow-x-auto no-scrollbar max-w-full self-start">
              <div className="flex bg-subsurface p-1 rounded-xl border border-border flex-nowrap">
                <button
                  type="button"
                  onClick={() => setFilterType('ALL')}
                  className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                    filterType === 'ALL'
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'text-muted hover:text-foreground'
                  }`}
                >
                  Semua ({queue.filter((q) => q.statusBayar === statusTab).length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterType('TUNGGU')}
                  className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                    filterType === 'TUNGGU'
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'text-muted hover:text-foreground'
                  }`}
                >
                  Ditunggu ({queue.filter((q) => q.kehadiran === 'TUNGGU' && q.statusBayar === statusTab).length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterType('TINGGAL')}
                  className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                    filterType === 'TINGGAL'
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'text-muted hover:text-foreground'
                  }`}
                >
                  Ditinggal ({queue.filter((q) => q.kehadiran === 'TINGGAL' && q.statusBayar === statusTab).length})
                </button>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative md:w-80">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-dark pointer-events-none" size={15} />
              <input
                type="text"
                aria-label="Cari plat nomor, paket, atau kru"
                placeholder="Cari plat nomor, paket, atau kru..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full min-h-[44px] pl-10 pr-4 py-2 bg-subsurface border border-border rounded-xl text-foreground placeholder:text-muted-dark focus:outline-none focus:border-border-active focus:ring-2 focus:ring-ring/20 text-base sm:text-xs transition-colors"
              />
            </div>
          </div>

          {/* Queue Card Grid / Empty State */}
          {loading ? (
            <div className="bg-surface p-16 rounded-2xl flex flex-col items-center justify-center text-muted border border-border shadow-xs">
              <RefreshCw size={36} className="animate-spin text-primary mb-3" />
              <p className="text-sm font-semibold text-foreground">Memuat antrean carwash...</p>
            </div>
          ) : filteredQueue.length === 0 ? (
            <div className="bg-surface p-12 sm:p-16 rounded-2xl flex flex-col items-center justify-center text-center border border-border shadow-xs">
              {statusTab === 'Pending' && selesaiItems.length > 0 ? (
                <>
                  <div className="w-14 h-14 bg-success-bg text-success rounded-2xl flex items-center justify-center mb-4 border border-success/30">
                    <CheckCircle2 size={28} strokeWidth={1.75} />
                  </div>
                  <h3 className="text-base font-bold text-foreground mb-1">
                    Semua Kendaraan Sudah Selesai Dicuci
                  </h3>
                  <p className="text-xs text-muted max-w-md mb-5">
                    Tidak ada mobil dalam proses antrean saat ini. Sebanyak <strong className="text-primary">{selesaiItems.length} mobil</strong> telah selesai dikerjakan pada {selectedDate}.
                  </p>
                  <button
                    type="button"
                    onClick={() => setStatusTab('Selesai')}
                    className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2 bg-primary hover:bg-primary-hover text-primary-foreground rounded-full font-semibold text-xs transition-all active:scale-[0.98] cursor-pointer"
                  >
                    <span>Lihat Mobil Selesai</span>
                    <ArrowRight size={14} />
                  </button>
                </>
              ) : (
                <>
                  <div className="w-14 h-14 bg-subsurface text-muted-dark rounded-2xl flex items-center justify-center mb-4 border border-border">
                    <Car size={28} />
                  </div>
                  <h3 className="text-base font-bold text-foreground mb-1">
                    Tidak Ada Antrean Cuci Mobil
                  </h3>
                  <p className="text-xs text-muted max-w-md mb-2">
                    Tidak ditemukan data kendaraan pada {selectedDate} untuk filter ini.
                  </p>
                  <Link
                    to="/pos?tab=carwash"
                    className="mt-3 min-h-[44px] inline-flex items-center gap-2 px-5 py-2 bg-primary hover:bg-primary-hover text-primary-foreground rounded-full font-semibold text-xs transition-all tap-tactile"
                  >
                    <Plus size={14} strokeWidth={2.5} />
                    <span>Daftarkan Kendaraan Baru di Kasir</span>
                  </Link>
                  {!isToday && (
                    <button
                      type="button"
                      onClick={() => setSelectedDate(new Date().toLocaleDateString('en-CA'))}
                      className="mt-3 min-h-[40px] px-4 py-2 bg-subsurface hover:bg-surface-hover text-foreground border border-border rounded-full font-semibold text-xs transition-all cursor-pointer"
                    >
                      Kembali ke Hari Ini
                    </button>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredQueue.map((item) => {
                const isTunggu = item.kehadiran === 'TUNGGU'
                const isSelesai = item.statusBayar === 'Selesai'

                return (
                  <div
                    key={item.id}
                    className={`bg-surface p-5 rounded-2xl border transition-all duration-200 relative flex flex-col justify-between shadow-xs hover:border-border-hover ${
                      isSelesai
                        ? 'border-success/30'
                        : isTunggu
                          ? 'border-primary/30'
                          : 'border-border'
                    }`}
                  >
                    {/* Top Row: Kehadiran & Status Bayar */}
                    <div className="flex justify-between items-start mb-4">
                      <span
                        className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider border ${
                          isTunggu
                            ? 'bg-warning-bg text-warning border-warning/30'
                            : 'bg-primary-soft text-primary-soft-foreground border-primary/25'
                        }`}
                      >
                        {item.kehadiran}
                      </span>

                      <span
                        className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1 border ${
                          isSelesai
                            ? 'bg-success-bg text-success border-success/30'
                            : 'bg-warning-bg text-warning border-warning/30'
                        }`}
                      >
                        {isSelesai ? <CheckCircle size={10} /> : <AlertCircle size={10} />}
                        {item.statusBayar}
                      </span>
                    </div>

                    {/* Main Vehicle Information */}
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-mono text-2xl font-black tracking-wider text-foreground uppercase">
                          {item.platNomor}
                        </h3>
                        {item.kondisiBodi && item.kondisiBodi !== 'Normal' && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-warning-bg text-warning font-bold border border-warning/30 inline-flex items-center gap-1 shrink-0">
                            <AlertTriangle size={11} />
                            <span>{item.kondisiBodi}</span>
                          </span>
                        )}
                      </div>
                      <div className="mt-2 space-y-1">
                        <p className="text-xs font-bold text-foreground">{item.paket}</p>
                        <p className="text-[11px] text-muted font-medium">
                          {item.model} • {item.ukuran} • {item.variant}
                        </p>
                        {item.catatanKendaraan && (
                          <p className="text-[10px] text-warning bg-warning-bg/70 p-2 rounded-lg border border-warning/25 italic">
                            &quot;{item.catatanKendaraan}&quot;
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Status Pengerjaan & QC Actions */}
                    <div className="mt-4 pt-3 border-t border-border space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-bold text-muted-dark tracking-wider">Status Fisik:</span>
                        <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 border ${
                          item.statusPengerjaan === 'Siap Diambil'
                            ? 'bg-success-bg text-success border-success/30'
                            : 'bg-primary-soft text-primary-soft-foreground border-primary/25'
                        }`}>
                          {item.statusPengerjaan === 'Siap Diambil' ? <CheckCircle size={10} /> : <Clock size={10} />}
                          {item.statusPengerjaan}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 pt-1">
                        {item.statusPengerjaan !== 'Siap Diambil' && (
                          <button
                            type="button"
                            onClick={() => {
                              setQcModalItem(item)
                              setQcChecklist({
                                bodyClean: true,
                                interiorVacuum: true,
                                glassClear: true,
                                tireShine: true
                              })
                            }}
                            className="flex-1 min-h-[40px] py-1.5 px-3 bg-primary hover:bg-primary-hover text-primary-foreground font-semibold text-xs rounded-full transition-all flex items-center justify-center gap-1 active:scale-[0.98] cursor-pointer"
                          >
                            <ShieldCheck size={12} />
                            <span>QC &amp; Selesai</span>
                          </button>
                        )}

                        {item.noTelepon && (
                          <button
                            type="button"
                            onClick={() => handleSendWhatsAppNotification(item)}
                            className="min-h-[40px] py-1.5 px-3 bg-success-bg hover:opacity-90 text-success border border-success/30 font-semibold text-xs rounded-full transition-all flex items-center gap-1 active:scale-[0.98] cursor-pointer"
                            title="Kirim Notifikasi Siap Diambil via WA"
                          >
                            <MessageCircle size={12} />
                            <span>WA</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Workers & Time Footer */}
                    <div className="mt-4 pt-3 border-t border-border space-y-2">
                      {/* Crew Assignment */}
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 text-muted font-medium">
                          {item.anggota2 ? <Users size={13} className="text-muted-dark" /> : <User size={13} className="text-muted-dark" />}
                          Kru Pencuci:
                        </span>
                        <span className="font-bold text-foreground">
                          {item.anggota1} {item.anggota2 ? `+ ${item.anggota2}` : ''}
                        </span>
                      </div>

                      {/* Check-in Jam / Waiting Time */}
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 text-muted-dark font-medium">
                          <Clock size={13} />
                          Jam Masuk:
                        </span>
                        <span className="font-mono tabular-nums text-muted text-[11px]">
                          {item.jam} ({calculateDuration(item.tanggal, item.jam)})
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* MODAL: Quality Control & Handover Checklist */}
      {qcModalItem && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-[9999] animate-fade-in">
          <div className="bg-surface w-full max-w-md p-6 rounded-2xl shadow-2xl border border-border animate-pop-in text-foreground">
            <div className="flex items-center justify-between pb-3 border-b border-border mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-primary-soft text-primary border border-primary/25">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-foreground uppercase tracking-wider">Quality Control (QC)</h4>
                  <p className="text-xs font-mono font-bold text-primary">{qcModalItem.platNomor} • {qcModalItem.model}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setQcModalItem(null)}
                aria-label="Tutup modal QC"
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-muted hover:text-foreground hover:bg-subsurface transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-muted mb-4 leading-relaxed">
              Verifikasi 4 poin standar kebersihan sebelum kendaraan diserahterimakan ke kasir / pelanggan:
            </p>

            <div className="space-y-2.5 mb-6">
              {[
                { id: 'bodyClean', label: 'Eksterior Kering & Kilap', desc: 'Bodi bebas sisa busa dan bercak air' },
                { id: 'interiorVacuum', label: 'Interior & Karpet Vakum', desc: 'Kabin bebas debu, sampah dibersihkan' },
                { id: 'glassClear', label: 'Kaca & Spion Bening', desc: 'Kaca bersih tanpa noda minyak / kabut' },
                { id: 'tireShine', label: 'Semir Ban Hitam Rata', desc: 'Ban disemir rapi di keempat roda' }
              ].map((point) => {
                const isChecked = qcChecklist[point.id]
                return (
                  <div
                    key={point.id}
                    onClick={() => setQcChecklist(prev => ({ ...prev, [point.id]: !prev[point.id] }))}
                    className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                      isChecked
                        ? 'bg-selected-surface border-border-active text-foreground'
                        : 'bg-subsurface border-border text-muted'
                    }`}
                  >
                    <button type="button" className="mt-0.5 text-primary">
                      {isChecked ? <CheckSquare size={16} /> : <Square size={16} />}
                    </button>
                    <div>
                      <p className={`text-xs font-bold ${isChecked ? 'text-foreground' : 'text-muted'}`}>
                        {point.label}
                      </p>
                      <p className="text-[11px] text-muted-dark mt-0.5">{point.desc}</p>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setQcModalItem(null)}
                className="min-h-[44px] px-4 py-2.5 rounded-full bg-subsurface hover:bg-surface-hover text-foreground border border-border font-semibold text-xs transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={updatingId === qcModalItem.id}
                onClick={handleCompleteQc}
                className="min-h-[44px] px-5 py-2.5 rounded-full bg-primary hover:bg-primary-hover active:scale-[0.98] text-primary-foreground font-semibold text-xs shadow-xs transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <CheckCircle size={14} />
                <span>{updatingId === qcModalItem.id ? 'Memperbarui...' : 'Lolos QC & Siap Diambil'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CarwashQueue
