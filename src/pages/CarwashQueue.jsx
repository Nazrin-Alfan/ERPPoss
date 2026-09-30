import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { 
  Car, 
  Clock, 
  User, 
  Users, 
  CheckCircle, 
  AlertCircle,
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
  Play
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
      const { data, error } = await supabase
        .from('carwash')
        .select(`
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
        .order('jam', { ascending: true })

      if (error) {
        console.error('Error fetching carwash queue:', error)
        setQueue([])
        return
      }

      let formattedData = []
      if (Array.isArray(data)) {
        formattedData = data.map((item) => ({
          id: item.id_transaksi || `cw_${Math.random()}`,
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
  }, [selectedDate])

  // Real-time subscription with resilient fallback
  useEffect(() => {
    fetchQueue()

    let channel = null
    try {
      if (typeof supabase?.channel === 'function') {
        channel = supabase
          .channel('carwash-queue-realtime')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'carwash' },
            () => {
              fetchQueue()
            }
          )
          .subscribe()
      }
    } catch (err) {
      console.warn('Realtime channel subscription skipped:', err)
    }

    return () => {
      try {
        if (channel && typeof supabase?.removeChannel === 'function') {
          supabase.removeChannel(channel)
        }
      } catch {
        // Safe ignore
      }
    }
  }, [fetchQueue, activeTenant?.id])

  const handleStartWashing = async (item) => {
    setUpdatingId(item.id)
    try {
      const { error } = await supabase
        .from('carwash')
        .update({
          status_pengerjaan: 'Sedang Dicuci'
        })
        .eq('id_transaksi', item.id)

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
      const { error } = await supabase
        .from('carwash')
        .update({
          status_pengerjaan: 'Siap Diambil'
        })
        .eq('id_transaksi', qcModalItem.id)

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
    <div className="p-4 sm:p-6 pb-24 md:pb-6 space-y-5 max-w-7xl mx-auto animate-fade-in">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-[#121215] border border-[#26272d] p-4 sm:p-5 rounded-xl">
        <div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-3">
            <span className="p-2 bg-[#00ffff] text-[#0f0f0f]/15 text-[#00ffff] rounded-xl border border-blue-500/20">
              <Car size={22} strokeWidth={1.75} />
            </span>
            Antrean Carwash
          </h1>
          <p className="text-[#bbcbb2] text-xs mt-1">
            Live Kanban pengerjaan bay cuci mobil & kru pencuci real-time
          </p>
        </div>

        {/* View Mode Switcher & Date Controls */}
        <div className="flex items-center flex-wrap gap-2.5">
          {/* Switcher: Kanban Bay vs Daftar Tab */}
          <div className="flex bg-[#18181c] p-1 rounded-xl border border-[#26272d]">
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 tap-tactile ${
                viewMode === 'kanban'
                  ? 'bg-[#00ffff] text-[#0f0f0f] font-bold shadow-xs'
                  : 'text-[#bbcbb2] hover:text-slate-200'
              }`}
            >
              <Columns3 size={13} strokeWidth={1.75} />
              <span>Kanban Bay</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 tap-tactile ${
                viewMode === 'list'
                  ? 'bg-[#00ffff] text-[#0f0f0f] font-bold shadow-xs'
                  : 'text-[#bbcbb2] hover:text-slate-200'
              }`}
            >
              <List size={13} strokeWidth={1.75} />
              <span>Daftar Tab</span>
            </button>
          </div>

          <div className="flex items-center gap-2 bg-[#18181c] px-3 py-1.5 rounded-xl border border-[#26272d] text-xs text-slate-200">
            <Calendar size={14} strokeWidth={1.75} className="text-[#00ffff] shrink-0" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-white focus:outline-none text-xs cursor-pointer font-medium"
            />
          </div>

          {!isToday && (
            <button
              onClick={() => setSelectedDate(new Date().toLocaleDateString('en-CA'))}
              className="px-3 py-1.5 bg-[#00ffff] text-[#0f0f0f]/20 hover:bg-[#00ffff] text-[#0f0f0f]/30 text-[#00ffff] border border-blue-500/30 rounded-xl text-xs font-bold transition-all tap-tactile"
            >
              Hari Ini
            </button>
          )}

          <button
            onClick={fetchQueue}
            disabled={loading}
            className="p-2.5 bg-[#18181c] hover:bg-slate-800 border border-[#26272d] hover:border-[#3f414a] text-slate-200 rounded-xl transition-all tap-tactile disabled:opacity-50"
            title="Refresh Antrean"
          >
            <RefreshCw size={16} strokeWidth={1.75} className={loading ? 'animate-spin text-[#00ffff]' : ''} />
          </button>
        </div>
      </div>

      {/* Filter and Search Section */}
      <div className="bg-[#121215] p-3 rounded-xl flex flex-col md:flex-row justify-between gap-3 border border-[#26272d]">
        {/* Kehadiran Filter (Tunggu / Tinggal) */}
        <div className="flex bg-[#18181c] p-1 rounded-xl border border-[#26272d] self-start">
          <button
            onClick={() => setFilterType('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all tap-tactile ${
              filterType === 'ALL' 
                ? 'bg-[#00ffff] text-[#0f0f0f] font-bold shadow-xs' 
                : 'text-[#bbcbb2] hover:text-slate-200'
            }`}
          >
            Semua ({queue.length})
          </button>
          <button
            onClick={() => setFilterType('TUNGGU')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all tap-tactile ${
              filterType === 'TUNGGU' 
                ? 'bg-[#00ffff] text-[#0f0f0f] font-bold shadow-xs' 
                : 'text-[#bbcbb2] hover:text-slate-200'
            }`}
          >
            Ditunggu ({queue.filter((q) => q.kehadiran === 'TUNGGU').length})
          </button>
          <button
            onClick={() => setFilterType('TINGGAL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all tap-tactile ${
              filterType === 'TINGGAL' 
                ? 'bg-[#00ffff] text-[#0f0f0f] font-bold shadow-xs' 
                : 'text-[#bbcbb2] hover:text-slate-200'
            }`}
          >
            Ditinggal ({queue.filter((q) => q.kehadiran === 'TINGGAL').length})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative md:w-80">
          <Search className="absolute left-3.5 top-2.5 text-[#6b7367]" size={15} strokeWidth={1.75} />
          <input
            type="text"
            placeholder="Cari plat nomor, paket, atau kru..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-[#18181c] border border-[#26272d] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-[#00ffff] text-xs transition-colors"
          />
        </div>
      </div>

      {/* VIEW MODE 1: LIVE KANBAN BAY BOARD (TABLET LANDSCAPE OPTIMIZED) */}
      {viewMode === 'kanban' ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
          {/* KOLOM 1: 🟡 ANTREAN MASUK (WAITING) */}
          <div className="bg-[#080C14] border border-amber-900/30 rounded-xl p-3.5 flex flex-col space-y-3 min-h-[400px]">
            <div className="flex items-center justify-between pb-2.5 border-b border-amber-900/40">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
                <h3 className="font-bold text-xs uppercase tracking-wider text-amber-300">
                  Antrean Masuk
                </h3>
              </div>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {waitingQueue.length} unit
              </span>
            </div>

            {waitingQueue.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-[#6b7367]">
                <Clock size={28} strokeWidth={1.5} className="mb-2 text-slate-600" />
                <p className="text-xs font-semibold text-[#bbcbb2]">Tidak ada antrean baru</p>
                <p className="text-[10px] text-slate-600 mt-0.5">Semua mobil sudah berada di bay cuci.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {waitingQueue.map((item) => (
                  <div
                    key={item.id}
                    className="bg-[#121215] p-3.5 rounded-xl border border-[#26272d] hover:border-[#ffc71f]/40 transition-all flex flex-col space-y-2.5"
                  >
                    <div className="flex items-start justify-between">
                      <span className="font-mono text-lg font-black text-white tracking-wider">
                        {item.platNomor}
                      </span>
                      <span className={`text-[9px] px-2 py-0.5 rounded-md font-bold uppercase border ${
                        item.kehadiran === 'TUNGGU'
                          ? 'bg-amber-500/15 text-[#ffc71f] border-amber-500/30'
                          : 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30'
                      }`}>
                        {item.kehadiran}
                      </span>
                    </div>

                    <div className="text-xs text-slate-200 space-y-0.5">
                      <p className="font-bold text-slate-200">{item.paket}</p>
                      <p className="text-[11px] text-[#bbcbb2]">{item.model} • {item.ukuran}</p>
                    </div>

                    <div className="pt-2 border-t border-[#26272d]/80 flex items-center justify-between text-[11px] text-[#bbcbb2]">
                      <span>Masuk: {item.jam}</span>
                      <span className="text-[#ffc71f] font-mono font-semibold">⏱️ {calculateDuration(item.tanggal, item.jam)}</span>
                    </div>

                    <button
                      type="button"
                      disabled={updatingId === item.id}
                      onClick={() => handleStartWashing(item)}
                      className="w-full py-2 bg-[#00ffff] text-[#0f0f0f] hover:bg-blue-500 active:bg-blue-700 text-white font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 tap-tactile disabled:opacity-50"
                    >
                      <Play size={13} strokeWidth={2} />
                      <span>Masuk Bay Cuci</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* KOLOM 2: 🔵 SEDANG DICUCI (BAY SLOTS) */}
          <div className="bg-[#080C14] border border-blue-900/30 rounded-xl p-3.5 flex flex-col space-y-3 min-h-[400px]">
            <div className="flex items-center justify-between pb-2.5 border-b border-blue-900/40">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-400"></span>
                <h3 className="font-bold text-xs uppercase tracking-wider text-blue-300">
                  Sedang Dicuci (Bay)
                </h3>
              </div>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                {washingQueue.length} unit
              </span>
            </div>

            {washingQueue.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-[#6b7367]">
                <Car size={28} strokeWidth={1.5} className="mb-2 text-slate-600" />
                <p className="text-xs font-semibold text-[#bbcbb2]">Bay cuci kosong</p>
                <p className="text-[10px] text-slate-600 mt-0.5">Siap menerima kendaraan dari antrean masuk.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {washingQueue.map((item) => (
                  <div
                    key={item.id}
                    className="bg-[#121215] p-3.5 rounded-xl border border-blue-500/30 hover:border-blue-500/50 transition-all flex flex-col space-y-2.5"
                  >
                    <div className="flex items-start justify-between">
                      <span className="font-mono text-lg font-black text-white tracking-wider">
                        {item.platNomor}
                      </span>
                      <span className="text-[9px] px-2 py-0.5 rounded-md font-bold uppercase bg-blue-500/20 text-blue-300 border border-blue-500/40">
                        {item.paket}
                      </span>
                    </div>

                    <div className="text-xs text-slate-200 space-y-0.5">
                      <p className="text-[11px] text-[#bbcbb2]">{item.model} • {item.ukuran}</p>
                      <p className="text-[11px] text-slate-200 flex items-center gap-1">
                        <Users size={12} strokeWidth={1.75} className="text-[#bbcbb2]" />
                        <span>Kru: {item.anggota1} {item.anggota2 ? `+ ${item.anggota2}` : ''}</span>
                      </p>
                    </div>

                    <div className="pt-2 border-t border-[#26272d]/80 flex items-center justify-between text-[11px] text-[#bbcbb2]">
                      <span>Mulai: {item.jam}</span>
                      <span className="text-sky-400 font-mono font-bold">⏱️ {calculateDuration(item.tanggal, item.jam)}</span>
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
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 tap-tactile disabled:opacity-50"
                    >
                      <ShieldCheck size={13} strokeWidth={1.75} />
                      <span>Selesaikan Cuci (QC)</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* KOLOM 3: 🟢 SELESAI DICUCI & SIAP DIAMBIL */}
          <div className="bg-[#080C14] border border-emerald-900/30 rounded-xl p-3.5 flex flex-col space-y-3 min-h-[400px]">
            <div className="flex items-center justify-between pb-2.5 border-b border-emerald-900/40">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                <h3 className="font-bold text-xs uppercase tracking-wider text-emerald-300">
                  Siap Diambil
                </h3>
              </div>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {readyQueue.length} unit
              </span>
            </div>

            {readyQueue.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-[#6b7367]">
                <CheckCircle2 size={28} strokeWidth={1.5} className="mb-2 text-slate-600" />
                <p className="text-xs font-semibold text-[#bbcbb2]">Belum ada mobil selesai</p>
                <p className="text-[10px] text-slate-600 mt-0.5">Mobil yang selesai QC akan muncul di sini.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {readyQueue.map((item) => (
                  <div
                    key={item.id}
                    className="bg-[#121215] p-3.5 rounded-xl border border-emerald-500/30 hover:border-emerald-500/50 transition-all flex flex-col space-y-2.5"
                  >
                    <div className="flex items-start justify-between">
                      <span className="font-mono text-lg font-black text-white tracking-wider">
                        {item.platNomor}
                      </span>
                      <span className={`text-[9px] px-2 py-0.5 rounded-md font-bold uppercase border ${
                        item.statusBayar === 'Selesai'
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                          : 'bg-amber-500/15 text-[#ffc71f] border-amber-500/30'
                      }`}>
                        {item.statusBayar === 'Selesai' ? 'Lunas' : 'Belum Bayar'}
                      </span>
                    </div>

                    <div className="text-xs text-slate-200 space-y-0.5">
                      <p className="font-bold text-slate-200">{item.paket}</p>
                      <p className="text-[11px] text-[#bbcbb2]">{item.model} • {item.ukuran}</p>
                    </div>

                    <div className="pt-2 border-t border-[#26272d]/80 flex items-center justify-between text-[11px] text-[#bbcbb2]">
                      <span>Kru: {item.anggota1}</span>
                      <span className="text-emerald-400 font-mono font-bold">✓ Selesai</span>
                    </div>

                    {item.noTelepon && (
                      <button
                        type="button"
                        onClick={() => handleSendWhatsAppNotification(item)}
                        className="w-full py-1.5 px-2 bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-400 border border-emerald-800/60 font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 tap-tactile"
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
          <div className="flex gap-4 border-b border-[#26272d] pb-1">
            <button
              onClick={() => setStatusTab('Pending')}
              className={`pb-3 px-3 font-bold text-sm transition-all border-b-2 flex items-center gap-2.5 relative tap-tactile ${
                statusTab === 'Pending'
                  ? 'text-[#ffc71f] border-amber-500'
                  : 'text-[#bbcbb2] border-transparent hover:text-slate-200'
              }`}
            >
              <Clock size={16} strokeWidth={1.75} />
              <span>Dalam Proses</span>
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                pendingItems.length > 0 
                  ? 'bg-amber-500/20 text-[#ffc71f] border border-amber-500/30' 
                  : 'bg-slate-800 text-[#bbcbb2]'
              }`}>
                {pendingItems.length}
              </span>
            </button>

            <button
              onClick={() => setStatusTab('Selesai')}
              className={`pb-3 px-3 font-bold text-sm transition-all border-b-2 flex items-center gap-2.5 relative tap-tactile ${
                statusTab === 'Selesai'
                  ? 'text-emerald-400 border-emerald-500'
                  : 'text-[#bbcbb2] border-transparent hover:text-slate-200'
              }`}
            >
              <CheckCircle size={16} strokeWidth={1.75} />
              <span>Selesai Dicuci</span>
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                selesaiItems.length > 0 
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                  : 'bg-slate-800 text-[#bbcbb2]'
              }`}>
                {selesaiItems.length}
              </span>
            </button>
          </div>

      {/* Filter and Search Section */}
      <div className="bg-[#121215]/60 p-3.5 rounded-xl flex flex-col md:flex-row justify-between gap-3 border border-[#26272d]/80 backdrop-blur-md">
        {/* Kehadiran Filter (Tunggu / Tinggal) */}
        <div className="flex bg-[#18181c] p-1 rounded-xl border border-[#26272d] self-start">
          <button
            onClick={() => setFilterType('ALL')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              filterType === 'ALL' 
                ? 'bg-[#00ffff] text-[#0f0f0f] font-bold shadow-xs' 
                : 'text-[#bbcbb2] hover:text-slate-200'
            }`}
          >
            Semua ({queue.filter((q) => q.statusBayar === statusTab).length})
          </button>
          <button
            onClick={() => setFilterType('TUNGGU')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              filterType === 'TUNGGU' 
                ? 'bg-[#00ffff] text-[#0f0f0f] font-bold shadow-xs' 
                : 'text-[#bbcbb2] hover:text-slate-200'
            }`}
          >
            Ditunggu ({queue.filter((q) => q.kehadiran === 'TUNGGU' && q.statusBayar === statusTab).length})
          </button>
          <button
            onClick={() => setFilterType('TINGGAL')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              filterType === 'TINGGAL' 
                ? 'bg-[#00ffff] text-[#0f0f0f] font-bold shadow-xs' 
                : 'text-[#bbcbb2] hover:text-slate-200'
            }`}
          >
            Ditinggal ({queue.filter((q) => q.kehadiran === 'TINGGAL' && q.statusBayar === statusTab).length})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative md:w-80">
          <Search className="absolute left-3.5 top-2.5 text-[#6b7367]" size={15} />
          <input
            type="text"
            placeholder="Cari plat nomor, paket, atau kru..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-[#18181c] border border-[#26272d] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-[#00ffff] text-xs transition-colors"
          />
        </div>
      </div>

      {/* Queue Card Grid / Empty State */}
      {loading ? (
        <div className="bg-[#121215]/40 p-16 rounded-xl flex flex-col items-center justify-center text-[#bbcbb2] border border-[#26272d]/80">
          <RefreshCw size={36} className="animate-spin text-[#00ffff] mb-3" />
          <p className="text-sm font-semibold text-slate-200">Memuat antrean carwash...</p>
        </div>
      ) : filteredQueue.length === 0 ? (
        <div className="bg-[#121215]/40 p-12 sm:p-16 rounded-xl flex flex-col items-center justify-center text-center border border-[#26272d]/80">
          {statusTab === 'Pending' && selesaiItems.length > 0 ? (
            <>
              <div className="w-14 h-14 bg-emerald-500/10 text-emerald-400 rounded-xl flex items-center justify-center mb-4 border border-emerald-500/20">
                <CheckCircle2 size={28} strokeWidth={1.75} />
              </div>
              <h3 className="text-base font-bold text-white mb-1">
                Semua Kendaraan Sudah Selesai Dicuci
              </h3>
              <p className="text-xs text-[#bbcbb2] max-w-md mb-5">
                Tidak ada mobil dalam proses antrean saat ini. Sebanyak <strong className="text-emerald-400">{selesaiItems.length} mobil</strong> telah selesai dikerjakan pada {selectedDate}.
              </p>
              <button
                onClick={() => setStatusTab('Selesai')}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 rounded-xl font-bold text-xs transition-all shadow-lg shadow-emerald-500/20"
              >
                <span>Lihat Mobil Selesai</span>
                <ArrowRight size={14} />
              </button>
            </>
          ) : (
            <>
              <div className="w-14 h-14 bg-slate-800/60 text-[#6b7367] rounded-xl flex items-center justify-center mb-4 border border-[#26272d]">
                <Car size={28} />
              </div>
              <h3 className="text-base font-bold text-white mb-1">
                Tidak Ada Antrean Cuci Mobil
              </h3>
              <p className="text-xs text-[#bbcbb2] max-w-md mb-2">
                Tidak ditemukan data kendaraan pada {selectedDate} untuk filter ini.
              </p>
              {!isToday && (
                <button
                  onClick={() => setSelectedDate(new Date().toLocaleDateString('en-CA'))}
                  className="mt-3 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-bold text-xs transition-all border border-[#3f414a]"
                >
                  Kembali ke Hari Ini
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredQueue.map((item, idx) => {
            const isTunggu = item.kehadiran === 'TUNGGU'
            const isSelesai = item.statusBayar === 'Selesai'

            return (
              <div
                key={item.id}
                className={`bg-[#121215]/70 p-5 rounded-xl border transition-all duration-300 relative flex flex-col justify-between hover:-translate-y-1 hover:shadow-xl ${
                  isSelesai
                    ? 'border-emerald-500/30 bg-emerald-950/10 hover:border-emerald-500/50'
                    : isTunggu
                      ? 'border-[#00ffff]/30 bg-[#00ffff]/5 hover:border-[#00ffff]/50'
                      : 'border-[#26272d] hover:border-[#3f414a]'
                }`}
              >
                {/* Top Row: Kehadiran & Status Bayar */}
                <div className="flex justify-between items-start mb-4">
                  <span
                    className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider border ${
                      isTunggu
                        ? 'bg-amber-500/15 text-[#ffc71f] border-amber-500/30'
                        : 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30'
                    }`}
                  >
                    {item.kehadiran}
                  </span>

                  <span
                    className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider flex items-center gap-1 border ${
                      isSelesai
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                        : 'bg-amber-500/15 text-[#ffc71f] border-amber-500/30'
                    }`}
                  >
                    {isSelesai ? <CheckCircle size={10} /> : <AlertCircle size={10} />}
                    {item.statusBayar}
                  </span>
                </div>

                {/* Main Vehicle Information */}
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="font-mono text-2xl font-black tracking-wider text-white uppercase group-hover:text-[#00ffff] transition-colors">
                      {item.platNomor}
                    </h3>
                    {item.kondisiBodi && item.kondisiBodi !== 'Normal' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold border border-[#ffc71f]/40">
                        ⚠️ {item.kondisiBodi}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 space-y-1">
                    <p className="text-xs font-bold text-slate-200">{item.paket}</p>
                    <p className="text-[11px] text-[#bbcbb2] font-medium">
                      {item.model} • {item.ukuran} • {item.variant}
                    </p>
                    {item.catatanKendaraan && (
                      <p className="text-[10px] text-amber-300/80 bg-[#18181c]/60 p-1.5 rounded border border-[#26272d] italic">
                        "{item.catatanKendaraan}"
                      </p>
                    )}
                  </div>
                </div>

                {/* Status Pengerjaan & QC Actions */}
                <div className="mt-4 pt-3 border-t border-[#26272d]/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-[#6b7367] tracking-wider">Status Fisik:</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                      item.statusPengerjaan === 'Siap Diambil'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : 'bg-blue-500/20 text-[#00ffff] border border-blue-500/40'
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
                        className="flex-1 py-1.5 px-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-slate-950 font-bold text-[11px] rounded-lg transition-all flex items-center justify-center gap-1 shadow-sm active:scale-95"
                      >
                        <ShieldCheck size={12} />
                        <span>QC & Selesai</span>
                      </button>
                    )}

                    {item.noTelepon && (
                      <button
                        type="button"
                        onClick={() => handleSendWhatsAppNotification(item)}
                        className="py-1.5 px-2.5 bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-400 border border-emerald-800/60 font-bold text-[11px] rounded-lg transition-all flex items-center gap-1 active:scale-95"
                        title="Kirim Notifikasi Siap Diambil via WA"
                      >
                        <MessageCircle size={12} />
                        <span>WA</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Workers & Time Footer */}
                <div className="mt-4 pt-3 border-t border-[#26272d]/80 space-y-2">
                  {/* Crew Assignment */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-[#bbcbb2] font-medium">
                      {item.anggota2 ? <Users size={13} className="text-[#6b7367]" /> : <User size={13} className="text-[#6b7367]" />}
                      Kru Pencuci:
                    </span>
                    <span className="font-bold text-slate-200">
                      {item.anggota1} {item.anggota2 ? `+ ${item.anggota2}` : ''}
                    </span>
                  </div>

                  {/* Check-in Jam / Waiting Time */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-[#6b7367] font-medium">
                      <Clock size={13} />
                      Jam Masuk:
                    </span>
                    <span className="font-mono text-[#bbcbb2] text-[11px]">
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
        <div className="fixed inset-0 bg-[#18181c]/80 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] animate-fade-in">
          <div className="glass-panel w-full max-w-md p-6 rounded-xl shadow-2xl border border-[#26272d] animate-pop-in">
            <div className="flex items-center justify-between pb-3 border-b border-[#26272d] mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-black text-white uppercase tracking-wider">Quality Control (QC)</h4>
                  <p className="text-xs font-mono font-bold text-[#00ffff]">{qcModalItem.platNomor} • {qcModalItem.model}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setQcModalItem(null)}
                className="text-[#bbcbb2] hover:text-white p-1 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-[#bbcbb2] mb-4 leading-relaxed">
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
                        ? 'bg-emerald-950/20 border-emerald-500/40 text-slate-200'
                        : 'bg-[#121215] border-[#26272d] text-[#bbcbb2]'
                    }`}
                  >
                    <button type="button" className="mt-0.5 text-emerald-400">
                      {isChecked ? <CheckSquare size={16} /> : <Square size={16} />}
                    </button>
                    <div>
                      <p className={`text-xs font-bold ${isChecked ? 'text-white' : 'text-[#bbcbb2]'}`}>
                        {point.label}
                      </p>
                      <p className="text-[10px] text-[#6b7367] mt-0.5">{point.desc}</p>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setQcModalItem(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={updatingId === qcModalItem.id}
                onClick={handleCompleteQc}
                className="px-5 py-2.5 rounded-xl bg-brand-emerald hover:bg-emerald-500 active:scale-95 text-slate-950 font-black text-xs shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50"
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
