import {
  TableContainer,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from '../components/ui/Table'
import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { 
  UserPlus, 
  Users, 
  Calendar, 
  DollarSign, 
  Plus, 
  Trash2, 
  CheckCircle, 
  AlertCircle,
  Briefcase,
  Shield,
  UserCheck,
  Sparkles
} from 'lucide-react'
import { formatRupiah } from '../utils/helpers'
import { syncStaffToKaryawanKantor, getRoleBadgeConfig } from '../utils/staffHelpers'
import { getTenantFeatures } from '../utils/businessCapabilities'
import InteractiveCalendar from '../components/InteractiveCalendar'

const Karyawan = () => {
  const { registerKasir, activeTenant } = useAuth()
  const features = getTenantFeatures(activeTenant?.business_type)
  const defaultTab = features.isCafeOnly ? 'office' : 'wages'
  const [activeTab, setActiveTab] = useState(defaultTab)

  useEffect(() => {
    if (!features.hasCarwash && (activeTab === 'wages' || activeTab === 'crew')) {
      setActiveTab('office')
    }
  }, [features.hasCarwash, activeTab])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Database Data Lists
  const [karyawanCuciList, setKaryawanCuciList] = useState([])
  const [karyawanKantorList, setKaryawanKantorList] = useState([])
  const [staffList, setStaffList] = useState([])
  const [carwashWagesList, setCarwashWagesList] = useState([])
  const [cashflowList, setCashflowList] = useState([])
  const [pengeluaranList, setPengeluaranList] = useState([])
  const [showPayModal, setShowPayModal] = useState(false)
  const [payForm, setPayForm] = useState({
    workerName: '',
    calculatedOutstanding: 0,
    amountToPay: 0,
    fundSource: 'REKENING Y',
    note: ''
  })

  // States for forms
  const [newKaryawanCuci, setNewKaryawanCuci] = useState('')
  const [newKaryawanKantor, setNewKaryawanKantor] = useState('')
  
  // Wages report states
  const [wagesStartDate, setWagesStartDate] = useState(() => {
    const d = new Date()
    if (d.getDate() >= 16) {
      d.setDate(16)
    } else {
      d.setMonth(d.getMonth() - 1)
      d.setDate(16)
    }
    return d.toLocaleDateString('en-CA')
  })
  const [wagesEndDate, setWagesEndDate] = useState(() => {
    const d = new Date()
    if (d.getDate() >= 16) {
      d.setMonth(d.getMonth() + 1)
      d.setDate(15)
    } else {
      d.setDate(15)
    }
    return d.toLocaleDateString('en-CA')
  })
  const [showWagesCalendar, setShowWagesCalendar] = useState(false)
  const [selectedWageWorker, setSelectedWageWorker] = useState(null)
  const [selectedJobForCrosscheck, setSelectedJobForCrosscheck] = useState(null)

  // Staff registration form state
  const [staffForm, setStaffForm] = useState({
    email: '',
    password: '',
    nama: '',
    role: 'Kasir'
  })

  // Custom Alert / Confirm Modal State
  const [customAlert, setCustomAlert] = useState(null)

  const showAlert = (message, title = 'Informasi') => {
    return new Promise((resolve) => {
      setCustomAlert({
        title,
        message,
        type: 'alert',
        onConfirm: () => {
          setCustomAlert(null)
          resolve(true)
        }
      })
    })
  }

  const showConfirm = (message, title = 'Konfirmasi') => {
    return new Promise((resolve) => {
      setCustomAlert({
        title,
        message,
        type: 'confirm',
        onConfirm: () => {
          setCustomAlert(null)
          resolve(true)
        },
        onCancel: () => {
          setCustomAlert(null)
          resolve(false)
        }
      })
    })
  }

  // Load Initial Karyawan Lists & Auto-sync Registered Staff to Karyawan Kantor
  const loadKaryawanData = async () => {
    setLoading(true)
    try {
      // 1. Fetch Karyawan Cuci
      let realKaryawanCuci = []
      try {
        const { data: kc } = await supabase.from('karyawan_cuci').select('*').order('nama', { ascending: true })
        realKaryawanCuci = kc || []
      } catch (e) {
        console.warn('karyawan_cuci read error:', e)
      }
      setKaryawanCuciList(realKaryawanCuci)

      // 2. Fetch Karyawan Kantor Eksisting
      let realKaryawanKantor = []
      try {
        const { data: kk } = await supabase.from('karyawan_kantor').select('*').order('nama', { ascending: true })
        realKaryawanKantor = kk || []
      } catch (e) {
        console.warn('karyawan_kantor read error:', e)
      }

      // 3. Fetch Profil Akun Staf (Daftar Staf Baru)
      let registeredStaff = []
      try {
        const { data: profs } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
        registeredStaff = profs || []
        setStaffList(registeredStaff)
      } catch (e) {
        console.warn('profiles read error:', e)
      }

      // 4. Sinkronisasi Otomatis: Karyawan Kantor otomatis terisi jika ada data dari Daftar Staf Baru
      const { mergedList, newRecordsToInsert } = syncStaffToKaryawanKantor({
        staffProfiles: registeredStaff,
        existingKaryawanKantor: realKaryawanKantor
      })

      // Simpan record baru ke tabel karyawan_kantor agar tersimpan permanen
      if (newRecordsToInsert.length > 0) {
        try {
          for (const newRec of newRecordsToInsert) {
            await supabase.from('karyawan_kantor').insert(newRec)
          }
        } catch (syncErr) {
          console.warn('Auto-sync insert into karyawan_kantor notice:', syncErr)
        }
      }

      setKaryawanKantorList(mergedList)
    } catch (err) {
      console.error('Error loading employee lists:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadKaryawanData()
  }, [])

  // Fetch Carwash Wages and Cashflow Deductions
  const fetchCarwashWages = async () => {
    setLoading(true)
    setError('')
    try {
      // 1. Fetch Carwash transactions
      const { data: cwData, error: cwErr } = await supabase
        .from('carwash')
        .select(`
          id_transaksi,
          kehadiran,
          variant,
          ukuran,
          paket,
          anggota_1,
          anggota_2,
          plat,
          harga,
          harga_cuci,
          harga_paket,
          harga_custom,
          gaji_pencuci,
          status,
          jam,
          created_at,
          tanggal
        `)
        .neq('status', 'Batal')
        .gte('tanggal', wagesStartDate)
        .lte('tanggal', wagesEndDate)
      
      if (cwErr) throw cwErr
      setCarwashWagesList(cwData || [])

      // 2. Fetch Cashflow entries for deductions
      const { data: cfData, error: cfErr } = await supabase
        .from('cashflow')
        .select('*')
        .gte('tanggal', wagesStartDate)
        .lte('tanggal', wagesEndDate)
      
      if (cfErr) throw cfErr
      setCashflowList(cfData || [])

      // 3. Fetch Pengeluaran entries for deductions
      const { data: expData, error: expErr } = await supabase
        .from('pengeluaran')
        .select('*')
        .gte('tanggal', wagesStartDate)
        .lte('tanggal', wagesEndDate)
      
      if (expErr) throw expErr
      setPengeluaranList(expData || [])
    } catch (err) {
      console.error('Error fetching carwash wages/deductions:', err)
      setError('Gagal memuat data upah & potongan.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'wages') {
      fetchCarwashWages()
    }
  }, [activeTab, wagesStartDate, wagesEndDate])

  // Wages Report Aggregation logic
  const wagesSummary = useMemo(() => {
    const summary = {}
    const activeWorkers = karyawanCuciList.length > 0 
      ? karyawanCuciList.map(k => k.nama.toUpperCase().trim()) 
      : ['ANGGA', 'FERRY', 'RAHMAN', 'FAISAL', 'BAGUS', 'VICKY', 'NOPAL', 'EZA']
    
    activeWorkers.forEach(w => {
      summary[w] = { 
        name: w, 
        totalCars: 0, 
        totalWage: 0, 
        totalWithdrawals: 0, 
        netWage: 0, 
        details: [], 
        withdrawalsList: [] 
      }
    })

    // 1. Process carwash wages (Gross)
    carwashWagesList.forEach(item => {
      let hargaCuci = parseFloat(item.harga_cuci) || 0
      let hargaPaket = parseFloat(item.harga_paket) || 0
      
      if (hargaCuci === 0 && hargaPaket === 0) {
        if (!item.paket || item.paket.trim() === "") {
          hargaCuci = parseFloat(item.harga) || 0
        } else {
          const size = item.ukuran || 'Large'
          const variant = item.variant || 'Regular'
          
          const basicWashPrices = {
            Small: { Regular: 50000, 'Body only': 35000 },
            Medium: { Regular: 55000, 'Body only': 40000 },
            Large: { Regular: 60000, 'Body only': 45000 },
            'Extra Large': { Regular: 80000, 'Body only': 80000 },
            Custom: { Regular: 80000, 'Body only': 80000 }
          }
          
          const basicSize = basicWashPrices[size] ? size : 'Large'
          const basicVar = variant === 'Body only' ? 'Body only' : 'Regular'
          hargaCuci = basicWashPrices[basicSize][basicVar]
          hargaPaket = Math.max(0, (parseFloat(item.harga) || 0) - hargaCuci)
        }
      }
      
      const w1 = item.anggota_1 ? item.anggota_1.trim().toUpperCase() : ''
      const w2 = item.anggota_2 ? item.anggota_2.trim().toUpperCase() : ''
      
      const isSplit = w2 !== '' && w2 !== w1
      
      const washWagePerPerson = isSplit 
        ? Math.floor((hargaCuci / 3 / 2) / 1000) * 1000 
        : Math.floor((hargaCuci / 3) / 1000) * 1000
      
      const packageWagePerPerson = hargaPaket > 0 
        ? (isSplit 
            ? Math.floor((hargaPaket / 2 / 2) / 1000) * 1000 
            : Math.floor((hargaPaket / 2) / 1000) * 1000)
        : 0
      
      const share = washWagePerPerson + packageWagePerPerson

      if (w1) {
        if (!summary[w1]) {
          summary[w1] = { name: w1, totalCars: 0, totalWage: 0, totalWithdrawals: 0, netWage: 0, details: [], withdrawalsList: [] }
        }
        summary[w1].totalCars += 1
        summary[w1].totalWage += share
        summary[w1].details.push({
          id: item.id_transaksi,
          tanggal: item.tanggal,
          jam: item.jam,
          created_at: item.created_at,
          platNomor: item.plat,
          paket: item.paket,
          variant: item.variant,
          ukuran: item.ukuran,
          totalHarga: item.harga,
          shareWage: share,
          split: isSplit ? 'Split 50%' : 'Solo 100%',
          rawItem: item
        })
      }

      if (isSplit && w2) {
        if (!summary[w2]) {
          summary[w2] = { name: w2, totalCars: 0, totalWage: 0, totalWithdrawals: 0, netWage: 0, details: [], withdrawalsList: [] }
        }
        summary[w2].totalCars += 1
        summary[w2].totalWage += share
        summary[w2].details.push({
          id: item.id_transaksi,
          tanggal: item.tanggal,
          jam: item.jam,
          created_at: item.created_at,
          platNomor: item.plat,
          paket: item.paket,
          variant: item.variant,
          ukuran: item.ukuran,
          totalHarga: item.harga,
          shareWage: share,
          split: isSplit ? 'Split 50%' : 'Solo 100%',
          rawItem: item
        })
      }
    })

    // 2. Setup Alias Matching for name typos
    const getWorkerAliases = (name) => {
      const n = name.toUpperCase().trim()
      if (n === 'FERRY') return ['FERRY', 'FERY']
      if (n === 'FAISAL') return ['FAISAL', 'FAIZAL', 'FASAL']
      if (n === 'NOPAL') return ['NOPAL', 'NOVAL']
      if (n === 'VICKY') return ['VICKY', 'VIKI']
      return [n]
    }

    const isMatch = (descText, workerName) => {
      const desc = descText.toUpperCase()
      const aliases = getWorkerAliases(workerName)
      return aliases.some(alias => desc.includes(alias))
    }

    const processedExpIds = new Set()

    // 3. Process pengeluaran deductions (cashier withdrawals/kasbon)
    pengeluaranList.forEach(exp => {
      const desc = (exp.nama_pengeluaran || '').toUpperCase()
      const amt = parseFloat(exp.nominal) || 0
      if (amt > 0) {
        Object.keys(summary).forEach(wName => {
          if (isMatch(desc, wName)) {
            processedExpIds.add(exp.id_pengeluaran)
            summary[wName].totalWithdrawals += amt
            summary[wName].withdrawalsList.push({
              id: exp.id_pengeluaran,
              tanggal: exp.tanggal,
              keterangan: exp.nama_pengeluaran,
              nominal: amt,
              pos: 'SALDO CASH (Laci Kasir)'
            })
          }
        })
      }
    })

    // 4. Process cashflow deductions (skipping ones already matched via id_sumber)
    cashflowList.forEach(cf => {
      if (cf.id_sumber && processedExpIds.has(cf.id_sumber)) return

      const desc = (cf.keterangan_transaksi || '').toUpperCase()
      const amt = parseFloat(cf.pengeluaran) || 0
      if (amt > 0) {
        Object.keys(summary).forEach(wName => {
          if (isMatch(desc, wName)) {
            summary[wName].totalWithdrawals += amt
            summary[wName].withdrawalsList.push({
              id: cf.id_cashflow,
              tanggal: cf.tanggal,
              keterangan: cf.keterangan_transaksi,
              nominal: amt,
              pos: cf.pos
            })
          }
        })
      }
    })

    // 5. Calculate net wages
    Object.keys(summary).forEach(wName => {
      summary[wName].netWage = summary[wName].totalWage - summary[wName].totalWithdrawals
    })

    return Object.values(summary).sort((a, b) => b.totalWage - a.totalWage)
  }, [carwashWagesList, cashflowList, pengeluaranList, karyawanCuciList])

  const selectedWorkerDetails = selectedWageWorker ? wagesSummary.find(w => w.name === selectedWageWorker) : null

  const handleOpenPayModal = () => {
    setPayForm({
      workerName: selectedWageWorker,
      calculatedOutstanding: selectedWorkerDetails?.netWage || 0,
      amountToPay: selectedWorkerDetails?.netWage || 0,
      fundSource: 'REKENING Y',
      note: `Pelunasan Gaji ${selectedWageWorker}`
    })
    setShowPayModal(true)
  }

  const handleProcessWagePayment = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const { error: err } = await supabase
        .from('cashflow')
        .insert({
          id_cashflow: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
          tanggal: new Date().toLocaleDateString('en-CA'),
          keterangan_transaksi: payForm.note,
          jenis: 'Pengeluaran',
          kategori: 'Gaji Karyawan',
          pemasukan: 0,
          pengeluaran: parseFloat(payForm.amountToPay) || 0,
          pos: payForm.fundSource
        })
      if (err) throw err
      
      setSuccess(`Berhasil mencatat pembayaran gaji ${payForm.workerName} sebesar ${formatRupiah(payForm.amountToPay)}!`)
      setShowPayModal(false)
      await fetchCarwashWages() // Refresh data
    } catch (err) {
      console.error('Error processing wage payment:', err)
      setError(`Gagal memproses pembayaran gaji: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  // 1. Karyawan Cuci Handlers
  const handleAddKaryawanCuci = async (e) => {
    e.preventDefault()
    if (!newKaryawanCuci.trim()) return
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const { error: err } = await supabase
        .from('karyawan_cuci')
        .insert({ nama: newKaryawanCuci.trim().toUpperCase() })

      if (err) throw err
      
      setSuccess(`Karyawan cuci "${newKaryawanCuci.trim().toUpperCase()}" berhasil ditambahkan!`)
      setNewKaryawanCuci('')
      await loadKaryawanData()
    } catch (err) {
      console.error('Error adding karyawan cuci:', err)
      setError(err.message || 'Gagal menambahkan karyawan cuci.')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteKaryawanCuci = async (id, name) => {
    const confirmed = await showConfirm(`Apakah Anda yakin ingin menghapus karyawan cuci "${name}"?`, 'Hapus Karyawan Cuci')
    if (!confirmed) return
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const { error: err } = await supabase
        .from('karyawan_cuci')
        .delete()
        .eq('id', id)

      if (err) throw err

      setSuccess(`Karyawan cuci "${name}" berhasil dihapus!`)
      await loadKaryawanData()
    } catch (err) {
      console.error('Error deleting karyawan cuci:', err)
      setError(err.message || 'Gagal menghapus karyawan cuci.')
    } finally {
      setLoading(false)
    }
  }

  // 2. Karyawan Kantor Handlers
  const handleAddKaryawanKantor = async (e) => {
    e.preventDefault()
    if (!newKaryawanKantor.trim()) return
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const cleanName = newKaryawanKantor.trim().toUpperCase()
      const { error: err } = await supabase
        .from('karyawan_kantor')
        .insert({ 
          id: `kk_man_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          nama: cleanName,
          role: 'Staff Kantor',
          source: 'manual',
          created_at: new Date().toISOString()
        })

      if (err) throw err
      
      setSuccess(`Karyawan kantor "${cleanName}" berhasil ditambahkan!`)
      setNewKaryawanKantor('')
      await loadKaryawanData()
    } catch (err) {
      console.error('Error adding karyawan kantor:', err)
      setError(err.message || 'Gagal menambahkan karyawan kantor.')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteKaryawanKantor = async (id, name) => {
    const confirmed = await showConfirm(`Apakah Anda yakin ingin menghapus karyawan kantor "${name}" dari daftar?`, 'Hapus Karyawan Kantor')
    if (!confirmed) return
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      let err = null
      if (id) {
        const res = await supabase.from('karyawan_kantor').delete().eq('id', id)
        err = res.error
      } else {
        const res = await supabase.from('karyawan_kantor').delete().eq('nama', name)
        err = res.error
      }

      if (err) throw err

      setSuccess(`Karyawan kantor "${name}" berhasil dihapus dari daftar!`)
      await loadKaryawanData()
    } catch (err) {
      console.error('Error deleting karyawan kantor:', err)
      setError(err.message || 'Gagal menghapus karyawan kantor.')
    } finally {
      setLoading(false)
    }
  }

  // 3. Registrasi Staff Baru Handler (Otomatis Mengisi Karyawan Kantor)
  const handleRegisterStaff = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (!staffForm.email || !staffForm.password || !staffForm.nama) {
      return setError('Semua form wajib diisi.')
    }

    try {
      setLoading(true)
      const cleanNama = staffForm.nama.trim().toUpperCase()
      const res = await registerKasir(staffForm.email, staffForm.password, cleanNama, staffForm.role)
      if (!res.success) throw new Error(res.error)

      // 1. Jika role Kasir, masukkan ke tabel kasir untuk master dropdown kasir di POS
      if (staffForm.role === 'Kasir') {
        const { error: kasirErr } = await supabase
          .from('kasir')
          .insert({ nama: cleanNama, is_active: true })
        if (kasirErr) {
          console.warn('Gagal otomatis menambahkan ke tabel kasir:', kasirErr)
        }
      }

      // 2. ARSITEKTUR SINKRONISASI: Otomatis tambahkan juga ke tabel karyawan_kantor
      try {
        const { data: existingKk } = await supabase
          .from('karyawan_kantor')
          .select('id')
          .eq('nama', cleanNama)
          .maybeSingle()

        if (!existingKk) {
          await supabase.from('karyawan_kantor').insert({
            id: `kk_auto_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            nama: cleanNama,
            role: staffForm.role,
            email: staffForm.email.trim(),
            source: 'staff_registration',
            created_at: new Date().toISOString()
          })
        }
      } catch (kkSyncErr) {
        console.warn('Auto-insert to karyawan_kantor notice:', kkSyncErr)
      }

      setSuccess(`Staf baru "${cleanNama}" (${staffForm.role}) berhasil didaftarkan dan otomatis tercatat di section Karyawan Kantor!`)
      setStaffForm({ email: '', password: '', nama: '', role: 'Kasir' })
      
      // Muat ulang data agar tampilan Karyawan Kantor dan Staf langsung ter-update
      await loadKaryawanData()
    } catch (err) {
      setError(err.message || 'Gagal mendaftarkan staff.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 pb-24 md:pb-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <Users size={32} className="text-[#00ffff]" />
            Kelola Karyawan
          </h1>
          <p className="text-[#bbcbb2] text-sm mt-1">Registrasi staf baru, data upah gaji pencuci, karyawan kantor, & kru cuci</p>
        </div>
      </div>

      {/* Alert Banner */}
      {success && (
        <div className="p-4 rounded-xl bg-[#00ffff]/10 border border-brand-emerald/20 text-[#00ffff] text-sm flex items-center gap-3 animate-fade-in">
          <CheckCircle size={18} />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-brand-rose/10 border border-brand-rose/20 text-brand-rose text-sm flex items-center gap-3 animate-fade-in">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Navigation Tab (Filtered by Tenant Model) */}
      <div className="flex gap-2 overflow-x-auto pb-1.5 border-b border-[#26272d] scrollbar-thin">
        {features.hasCarwash && (
          <button
            onClick={() => { setActiveTab('wages'); setError(''); setSuccess('') }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
              activeTab === 'wages' ? 'bg-[#00ffff] text-[#0f0f0f] font-bold shadow-sm' : 'text-[#bbcbb2] hover:text-white'
            }`}
          >
            Laporan Gaji Cuci
          </button>
        )}
        {features.hasCarwash && (
          <button
            onClick={() => { setActiveTab('crew'); setError(''); setSuccess('') }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
              activeTab === 'crew' ? 'bg-[#00ffff] text-[#0f0f0f] font-bold shadow-sm' : 'text-[#bbcbb2] hover:text-white'
            }`}
          >
            Karyawan Cuci
          </button>
        )}
        <button
          onClick={() => { setActiveTab('office'); setError(''); setSuccess('') }}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
            activeTab === 'office' ? 'bg-[#00ffff] text-[#0f0f0f] font-bold shadow-sm' : 'text-[#bbcbb2] hover:text-white'
          }`}
        >
          {features.isCafeOnly ? 'Karyawan & Staf Toko' : 'Karyawan Kantor'}
        </button>
        <button
          onClick={() => { setActiveTab('staff'); setError(''); setSuccess('') }}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
            activeTab === 'staff' ? 'bg-[#00ffff] text-[#0f0f0f] font-bold shadow-sm' : 'text-[#bbcbb2] hover:text-white'
          }`}
        >
          Akun Kasir & Akses
        </button>
      </div>

      {/* CONTENT TAB 1: Laporan Gaji Cuci */}
      {activeTab === 'wages' && (
        <div className="space-y-6 animate-fade-in">
          <div className="bg-[#121215] border border-[#26272d] p-6 rounded-2xl border border-[#26272d] space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <DollarSign className="text-[#00ffff]" size={20} />
                  <span>Laporan Gaji Karyawan Cuci Mobil</span>
                </h3>
                <p className="text-xs text-[#6b7367] mt-1">Akumulasi upah karyawan cuci dari transaksi berstatus Selesai</p>
              </div>

              {/* Date Filters with InteractiveCalendar */}
              <div className="relative flex items-center text-xs">
                <button
                  type="button"
                  onClick={() => setShowWagesCalendar(!showWagesCalendar)}
                  className="flex items-center gap-2 px-4 py-2 bg-[#18181c] hover:bg-[#26272d] border border-[#26272d] hover:border-slate-700 text-[#bbcbb2] hover:text-white rounded-xl font-bold transition-all text-xs"
                >
                  <Calendar size={14} className="text-[#00ffff]" />
                  <span>Periode Gaji: {wagesStartDate || 'Mulai'} s/d {wagesEndDate || 'Selesai'}</span>
                </button>

                {showWagesCalendar && (
                  <div className="absolute right-0 top-full mt-2 z-50">
                    <InteractiveCalendar
                      startDate={wagesStartDate}
                      endDate={wagesEndDate}
                      onChange={(start, end) => {
                        setWagesStartDate(start)
                        setWagesEndDate(end)
                      }}
                      onClose={() => setShowWagesCalendar(false)}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Main Wages Summary Table (Full Width) */}
            <div className="space-y-6">
              <TableContainer>
                <Table dense>
                  <thead>
                    <tr className="border-b border-[#26272d] text-[#6b7367] font-semibold text-[10px] uppercase tracking-wider bg-[#18181c]/50">
                      <th className="p-4">Nama Pencuci</th>
                      <th className="p-4 text-center">Jumlah Cuci (Mobil)</th>
                      <th className="p-4 text-right">Gaji Kotor (Rp)</th>
                      <th className="p-4 text-right">Potongan / Kasbon (Rp)</th>
                      <th className="p-4 text-right text-[#00ffff]">Sisa Gaji Bersih (Rp)</th>
                      <th className="p-4 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#26272d]">
                    {wagesSummary.map((item) => (
                      <tr 
                        key={item.name} 
                        className={`hover:bg-[#26272d]/10 transition-colors ${
                          selectedWageWorker === item.name ? 'bg-[#00ffff]/5' : ''
                        }`}
                      >
                        <td className="p-4 font-bold text-white text-sm">{item.name}</td>
                        <td className="p-4 text-center font-bold text-white text-sm font-mono">{item.totalCars}</td>
                        <td className="p-4 text-right text-white text-sm font-mono">{formatRupiah(item.totalWage)}</td>
                        <td className="p-4 text-right text-brand-rose/90 text-sm font-mono">-{formatRupiah(item.totalWithdrawals)}</td>
                        <td className={`p-4 text-right font-black text-sm font-mono ${item.netWage <= 0 ? 'text-[#6b7367] line-through' : 'text-[#00ffff]'}`}>
                          {formatRupiah(item.netWage)}
                        </td>
                        <td className="p-4 text-center">
                          <button
                            onClick={() => setSelectedWageWorker(item.name)}
                            className="px-3 py-1 bg-[#18181c] hover:bg-[#26272d] border border-[#26272d] hover:border-slate-700 text-[#00ffff] font-bold rounded-lg text-[10px] transition-all"
                          >
                            Detail Riwayat
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </TableContainer>

              {/* Rincian Riwayat di Bawah (Full Width) */}
              {selectedWageWorker && (
                <div id="print-area" className="bg-[#121215] border border-[#26272d] p-6 rounded-xl border border-[#26272d] space-y-6 animate-fade-in">
                  <div className="border-b border-[#26272d] pb-3 flex justify-between items-center">
                    <div>
                      <h4 className="font-extrabold text-base text-white">Detail Riwayat Pekerjaan: {selectedWageWorker}</h4>
                      <p className="text-xs text-[#6b7367] mt-0.5 font-medium">Rincian upah lengkap pada periode {wagesStartDate} s/d {wagesEndDate}</p>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={handleOpenPayModal}
                        disabled={loading || (selectedWorkerDetails?.netWage || 0) <= 0}
                        className="px-3 py-1.5 bg-[#00ffff] hover:bg-[#00ffff]/90 disabled:opacity-50 text-slate-950 text-xs font-bold rounded-lg transition-all active:scale-[0.98] flex items-center gap-1.5"
                      >
                        Bayar Gaji
                      </button>
                      <button 
                        onClick={() => window.print()}
                        className="px-3 py-1.5 bg-[#00ffff] hover:bg-[#00ffff]/90 text-slate-950 text-xs font-bold rounded-lg transition-all active:scale-[0.98] flex items-center gap-1.5"
                      >
                        Cetak PDF
                      </button>
                      <button 
                        onClick={() => setSelectedWageWorker(null)}
                        className="px-3 py-1.5 bg-[#18181c] hover:bg-[#26272d] text-[#bbcbb2] hover:text-white text-xs font-bold rounded-lg border border-[#26272d] transition-colors"
                      >
                        Tutup Riwayat
                      </button>
                    </div>
                  </div>

                  {/* Info Card Summary */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 p-4 rounded-xl bg-[#18181c]/60 border border-[#26272d] text-xs">
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-[#6b7367] block font-bold">Nama Pekerja</span>
                      <span className="text-sm font-bold text-white">{selectedWageWorker}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-[#6b7367] block font-bold">Total Pekerjaan</span>
                      <span className="text-sm font-bold text-white font-mono">{selectedWorkerDetails?.totalCars || 0} Mobil</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-[#6b7367] block font-bold">Gaji Kotor</span>
                      <span className="text-sm font-bold text-white font-mono">{formatRupiah(selectedWorkerDetails?.totalWage || 0)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-[#6b7367] block font-bold">Total Potongan/Kasbon</span>
                      <span className="text-sm font-bold text-brand-rose font-mono">-{formatRupiah(selectedWorkerDetails?.totalWithdrawals || 0)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-[#00ffff] block font-bold">Sisa Gaji Bersih</span>
                      <span className="text-sm font-black text-[#00ffff] font-mono">
                        {formatRupiah(selectedWorkerDetails?.netWage || 0)}
                      </span>
                    </div>
                  </div>

                  {/* Job List Title */}
                  <div className="space-y-2">
                    <h5 className="text-xs font-bold text-[#bbcbb2] uppercase tracking-wider">1. Rincian Pekerjaan Cuci</h5>
                    {/* Full Table of History details */}
                    <TableContainer>
                <Table dense>
                        <thead>
                          <tr className="border-b border-[#26272d] text-[#6b7367] font-semibold text-[10px] uppercase tracking-wider bg-[#18181c]/50">
                            <th className="p-4">Tanggal & Waktu</th>
                            <th className="p-4">Plat Nomor</th>
                            <th className="p-4">Paket Cuci</th>
                            <th className="p-4">Varian & Ukuran</th>
                            <th className="p-4">Porsi Cuci</th>
                            <th className="p-4 text-right">Total Transaksi</th>
                            <th className="p-4 text-right">Bagian Upah</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#26272d]">
                          {selectedWorkerDetails?.details.length === 0 ? (
                            <tr>
                              <td colSpan="7" className="p-8 text-center text-[#6b7367] italic">
                                Tidak ada riwayat pekerjaan.
                              </td>
                            </tr>
                          ) : (
                            selectedWorkerDetails?.details.map((job) => {
                              const dateParts = job.tanggal ? String(job.tanggal).split('T')[0].split('-') : []
                              const formattedDate = dateParts.length === 3
                                ? `${parseInt(dateParts[2], 10)} ${['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'][parseInt(dateParts[1], 10) - 1]} ${dateParts[0]}`
                                : (job.tanggal || '');

                              let formattedJam = job.jam ? job.jam.substring(0, 5) : ''
                              if (!formattedJam && job.created_at) {
                                const d = new Date(job.created_at)
                                if (!isNaN(d.getTime())) {
                                  formattedJam = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
                                }
                              }
                              if (!formattedJam) formattedJam = '--:--'

                              const timeStr = `${formattedDate} ${formattedJam}`

                              return (
                                <tr 
                                  key={job.id} 
                                  onClick={() => setSelectedJobForCrosscheck(job)}
                                  className="hover:bg-[#26272d]/10 cursor-pointer transition-colors"
                                  title="Klik untuk rincian crosscheck transaksi"
                                >
                                  <td className="p-4 text-[#bbcbb2] font-mono">{timeStr}</td>
                                  <td className="p-4 font-mono font-bold text-[#00ffff] uppercase">{job.platNomor || 'PLAT KOSONG'}</td>
                                  <td className="p-4 font-bold text-white">{job.paket}</td>
                                  <td className="p-4 text-[#bbcbb2]">{job.variant} • {job.ukuran}</td>
                                  <td className="p-4 font-medium text-white">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                      job.split.includes('Split') 
                                        ? 'bg-amber-500/10 text-amber-400' 
                                        : 'bg-emerald-500/10 text-[#00ffff]'
                                    }`}>
                                      {job.split}
                                    </span>
                                  </td>
                                  <td className="p-4 text-right text-[#bbcbb2] font-mono">{formatRupiah(job.totalHarga)}</td>
                                  <td className="p-4 text-right font-black text-[#00ffff] font-mono">{formatRupiah(job.shareWage)}</td>
                                </tr>
                              )
                            })
                          )}
                        </tbody>
                      </Table>
              </TableContainer>
                  </div>

                  {/* Withdrawal List Title */}
                  <div className="space-y-2">
                    <h5 className="text-xs font-bold text-[#bbcbb2] uppercase tracking-wider">2. Riwayat Pengambilan Kasbon & Payout Gaji</h5>
                    <TableContainer>
                <Table dense>
                        <thead>
                          <tr className="border-b border-[#26272d] text-[#6b7367] font-semibold text-[10px] uppercase tracking-wider bg-[#18181c]/50">
                            <th className="p-4">Tanggal Payout</th>
                            <th className="p-4">Keterangan Pengeluaran</th>
                            <th className="p-4">Sumber Dana (POS)</th>
                            <th className="p-4 text-right">Nominal Keluar</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#26272d]">
                          {selectedWorkerDetails?.withdrawalsList.length === 0 ? (
                            <tr>
                              <td colSpan="4" className="p-8 text-center text-[#6b7367] italic">
                                Belum ada kasbon atau pembayaran gaji tercatat di cashflow pada periode ini.
                              </td>
                            </tr>
                          ) : (
                            selectedWorkerDetails?.withdrawalsList.map((w, idx) => (
                              <tr key={w.id || idx} className="hover:bg-[#26272d]/10">
                                <td className="p-4 text-[#bbcbb2] font-mono">
                                  {new Date(w.tanggal).toLocaleDateString('id-ID', {
                                    day: 'numeric',
                                    month: 'long',
                                    year: 'numeric'
                                  })}
                                </td>
                                <td className="p-4 text-white">{w.keterangan}</td>
                                <td className="p-4 font-mono font-bold text-[#bbcbb2]">{w.pos}</td>
                                <td className="p-4 text-right font-bold text-brand-rose font-mono">-{formatRupiah(w.nominal)}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </Table>
              </TableContainer>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CONTENT TAB 2: Daftar Karyawan Cuci */}
      {activeTab === 'crew' && (
        <div className="bg-[#121215] border border-[#26272d] p-6 rounded-2xl border border-[#26272d] max-w-4xl mx-auto space-y-6 animate-fade-in">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#26272d] pb-4">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Users className="text-[#00ffff]" size={20} />
                <span>Daftar Karyawan Cuci Mobil (Pencuci)</span>
              </h3>
              <p className="text-xs text-[#6b7367] mt-1">
                Kelola kru cuci mobil yang aktif. Daftar ini digunakan sebagai referensi pencucian di Kasir POS.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Form Tambah Karyawan */}
            <div className="bg-[#121215] border border-[#26272d] p-5 rounded-xl border border-[#26272d] h-fit space-y-4">
              <h4 className="font-bold text-sm text-white">Tambah Karyawan Baru</h4>
              <form onSubmit={handleAddKaryawanCuci} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-[#6b7367] font-bold uppercase tracking-wider block">
                    Nama Karyawan
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: RIO"
                    value={newKaryawanCuci}
                    onChange={(e) => setNewKaryawanCuci(e.target.value)}
                    className="w-full bg-[#18181c] border border-[#26272d] rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-brand-blue font-bold uppercase font-sans tracking-wide"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-[#00ffff] hover:bg-[#00ffff]/90 active:scale-[0.98] text-slate-950 font-bold rounded-lg text-xs transition-all shadow-md shadow-brand-blue/15"
                >
                  Tambah Karyawan
                </button>
              </form>
            </div>

            {/* List Karyawan */}
            <TableContainer className="md:col-span-2">
              <Table dense>
                <thead>
                  <tr className="border-b border-[#26272d] text-[#6b7367] font-semibold text-[10px] uppercase tracking-wider bg-[#18181c]/50">
                    <th className="p-4">Nama Karyawan</th>
                    <th className="p-4 text-center">Tanggal Terdaftar</th>
                    <th className="p-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#26272d]">
                  {karyawanCuciList.length === 0 ? (
                    <tr>
                      <td colSpan="3" className="p-8 text-center text-xs text-slate-600 font-medium italic">
                        Belum ada karyawan cuci terdaftar.
                      </td>
                    </tr>
                  ) : (
                    karyawanCuciList.map((k) => (
                      <tr key={k.id} className="hover:bg-[#26272d]/10 transition-colors">
                        <td className="p-4 font-bold text-white text-sm">{k.nama}</td>
                        <td className="p-4 text-center text-xs text-[#bbcbb2] font-mono">
                          {new Date(k.created_at).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric'
                          })}
                        </td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => handleDeleteKaryawanCuci(k.id, k.nama)}
                            className="px-2.5 py-1 bg-[#18181c] hover:bg-rose-500/10 text-brand-rose border border-[#26272d] hover:border-brand-rose/20 rounded-lg text-[10px] font-bold transition-all active:scale-[0.98]"
                          >
                            Hapus
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
              </TableContainer>
          </div>
        </div>
      )}

      {/* CONTENT TAB 3: Daftar Karyawan Kantor */}
      {activeTab === 'office' && (
        <div className="bg-[#121215] border border-[#26272d] p-6 rounded-2xl border border-[#26272d] max-w-5xl mx-auto space-y-6 animate-fade-in">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#26272d] pb-4">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Briefcase className="text-[#00ffff]" size={20} />
                <span>Daftar Karyawan Kantor</span>
              </h3>
              <p className="text-xs text-[#6b7367] mt-1">
                Kelola daftar karyawan bagian kantor & staf operasional. Terintegrasi langsung dengan data registrasi staf baru.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-lg bg-[#18181c] border border-[#26272d] text-xs text-white font-semibold flex items-center gap-1.5">
                <Users size={14} className="text-[#00ffff]" />
                <span>Total: {karyawanKantorList.length} Orang</span>
              </span>
            </div>
          </div>

          {/* Banner Integrasi Otomatis */}
          <div className="p-4 rounded-xl bg-[#00ffff]/10 border border-brand-blue/20 text-[#00ffff] text-xs flex items-start gap-3">
            <Sparkles size={18} className="shrink-0 mt-0.5 text-[#00ffff]" />
            <div className="space-y-0.5">
              <p className="font-bold text-white">Sinkronisasi Otomatis Aktif</p>
              <p className="text-white leading-relaxed">
                Section Karyawan Kantor ini <strong>otomatis terisi</strong> jika ada data dari section <strong>Daftar Staf Baru</strong>. Anda juga dapat menambahkan staf operasional kantor non-login secara manual menggunakan form di bawah.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Form Tambah Karyawan Kantor Manual */}
            <div className="lg:col-span-4 bg-[#121215] border border-[#26272d] p-5 rounded-xl border border-[#26272d] h-fit space-y-4">
              <div>
                <h4 className="font-bold text-sm text-white flex items-center gap-2">
                  <Plus size={16} className="text-[#00ffff]" />
                  <span>Tambah Karyawan Manual</span>
                </h4>
                <p className="text-[11px] text-[#6b7367] mt-1">
                  Untuk staf kantor/operasional yang tidak memerlukan akses login aplikasi.
                </p>
              </div>
              <form onSubmit={handleAddKaryawanKantor} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-[#6b7367] font-bold uppercase tracking-wider block">
                    Nama Karyawan
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: INDAH"
                    value={newKaryawanKantor}
                    onChange={(e) => setNewKaryawanKantor(e.target.value)}
                    className="w-full bg-[#18181c] border border-[#26272d] rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-brand-blue font-bold uppercase font-sans tracking-wide"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-[#00ffff] hover:bg-[#00ffff]/90 active:scale-[0.98] text-slate-950 font-bold rounded-lg text-xs transition-all shadow-md shadow-brand-blue/15"
                >
                  Tambah Karyawan
                </button>
              </form>
            </div>

            {/* List Karyawan Kantor */}
            <TableContainer className="lg:col-span-8">
              <Table dense>
                <thead>
                  <tr className="border-b border-[#26272d] text-[#6b7367] font-semibold text-[10px] uppercase tracking-wider bg-[#18181c]/50">
                    <th className="p-3.5">Nama Karyawan</th>
                    <th className="p-3.5">Peran / Jabatan</th>
                    <th className="p-3.5">Sumber Data</th>
                    <th className="p-3.5 text-center">Terdaftar</th>
                    <th className="p-3.5 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#26272d]">
                  {karyawanKantorList.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="p-8 text-center text-xs text-slate-600 font-medium italic">
                        Belum ada karyawan kantor terdaftar.
                      </td>
                    </tr>
                  ) : (
                    karyawanKantorList.map((k, idx) => {
                      const roleBadge = getRoleBadgeConfig(k.role)
                      const isAutoSync = k.source === 'staff_registration' || k.email
                      return (
                        <tr key={k.id || idx} className="hover:bg-[#26272d]/10 transition-colors">
                          <td className="p-3.5">
                            <div className="font-bold text-white text-sm">{k.nama}</div>
                            {k.email && (
                              <div className="text-[11px] text-[#6b7367] font-mono mt-0.5">{k.email}</div>
                            )}
                          </td>
                          <td className="p-3.5">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${roleBadge.bgClass}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${roleBadge.dotClass}`} />
                              <span>{roleBadge.label}</span>
                            </span>
                          </td>
                          <td className="p-3.5">
                            {isAutoSync ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#00ffff]/10 border border-brand-blue/20 text-[#00ffff] text-[10px] font-medium">
                                <Sparkles size={11} />
                                <span>Daftar Staf Baru</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#18181c] border border-[#26272d] text-[#bbcbb2] text-[10px] font-medium">
                                <span>Manual</span>
                              </span>
                            )}
                          </td>
                          <td className="p-3.5 text-center text-xs text-[#bbcbb2] font-mono">
                            {k.created_at ? new Date(k.created_at).toLocaleDateString('id-ID', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric'
                            }) : '-'}
                          </td>
                          <td className="p-3.5 text-right">
                            <button
                              onClick={() => handleDeleteKaryawanKantor(k.id, k.nama)}
                              className="px-2.5 py-1 bg-[#18181c] hover:bg-rose-500/10 text-brand-rose border border-[#26272d] hover:border-brand-rose/20 rounded-lg text-[10px] font-bold transition-all active:scale-[0.98]"
                            >
                              Hapus
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </Table>
              </TableContainer>
          </div>
        </div>
      )}

      {/* CONTENT TAB 4: Registrasi Staff */}
      {activeTab === 'staff' && (
        <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
          {/* Header & Banner Penjelas Integrasi */}
          <div className="bg-[#121215] border border-[#26272d] p-6 rounded-2xl border border-[#26272d] space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <UserPlus className="text-[#00ffff]" />
                  <span>Daftarkan Staf Baru</span>
                </h3>
                <p className="text-xs text-[#6b7367] mt-1">
                  Buat akun login staf dan kasir. Akun staf baru otomatis tercatat ke dalam section Karyawan Kantor.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-lg bg-[#18181c] border border-[#26272d] text-xs text-white font-semibold flex items-center gap-1.5">
                  <UserCheck size={14} className="text-[#00ffff]" />
                  <span>Staf Terdaftar: {staffList.length} Akun</span>
                </span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#00ffff]/10 border border-brand-emerald/20 text-[#00ffff] text-xs flex items-start gap-3">
              <Sparkles size={18} className="shrink-0 mt-0.5 text-[#00ffff]" />
              <div className="space-y-0.5">
                <p className="font-bold text-white">Otomatis Terintegrasi ke Karyawan Kantor</p>
                <p className="text-white leading-relaxed">
                  Setiap staf yang didaftarkan di form ini akan <strong>langsung mengisi section Karyawan Kantor</strong> secara otomatis tanpa perlu penginputan manual berulang.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Form Registrasi Staf */}
            <div className="lg:col-span-5 bg-[#121215] border border-[#26272d] p-6 rounded-2xl border border-[#26272d] space-y-5 h-fit">
              <div>
                <h4 className="font-bold text-sm text-white flex items-center gap-2">
                  <UserPlus size={16} className="text-[#00ffff]" />
                  <span>Form Pendaftaran Akun Staf</span>
                </h4>
                <p className="text-[11px] text-[#6b7367] mt-1">
                  Kredensial login dapat digunakan untuk masuk ke RelayPOS.
                </p>
              </div>

              <form onSubmit={handleRegisterStaff} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[#bbcbb2] uppercase tracking-wider mb-1.5">
                    Nama Lengkap Staf
                  </label>
                  <input
                    type="text"
                    placeholder="Ketik nama (misal: Alexa Syafa)"
                    value={staffForm.nama}
                    onChange={(e) => setStaffForm(prev => ({ ...prev, nama: e.target.value }))}
                    className="w-full bg-[#18181c] border border-[#26272d] rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-brand-blue font-bold tracking-wide"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#bbcbb2] uppercase tracking-wider mb-1.5">
                    Username / Email Login
                  </label>
                  <input
                    type="text"
                    placeholder="Masukkan username (tanpa spasi)..."
                    value={staffForm.email}
                    onChange={(e) => setStaffForm(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full bg-[#18181c] border border-[#26272d] rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-brand-blue font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#bbcbb2] uppercase tracking-wider mb-1.5">
                    Kata Sandi
                  </label>
                  <input
                    type="password"
                    placeholder="Minimal 6 karakter"
                    value={staffForm.password}
                    onChange={(e) => setStaffForm(prev => ({ ...prev, password: e.target.value }))}
                    className="w-full bg-[#18181c] border border-[#26272d] rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-brand-blue font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#bbcbb2] uppercase tracking-wider mb-1.5">
                    Peran Hak Akses (Role)
                  </label>
                  <select
                    value={staffForm.role}
                    onChange={(e) => setStaffForm(prev => ({ ...prev, role: e.target.value }))}
                    className="w-full bg-[#18181c] border border-[#26272d] rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-brand-blue"
                  >
                    <option value="Kasir">Kasir (Akses Transaksi POS & Antrean)</option>
                    <option value="Admin">Admin (Supervisor Operasional & Logistik Toko)</option>
                    <option value="Owner">Owner (Akses Penuh Seluruh Modul & Finansial)</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-[#00ffff] hover:bg-[#00ffff]/90 active:scale-[0.98] text-slate-950 font-bold rounded-xl shadow-lg shadow-brand-blue/20 transition-all text-sm mt-2 disabled:opacity-50"
                >
                  {loading ? 'Mendaftarkan...' : 'Registrasikan Akun Staf'}
                </button>
              </form>
            </div>

            {/* Tabel Daftar Akun Staf Terdaftar */}
            <div className="lg:col-span-7 bg-[#121215] border border-[#26272d] p-6 rounded-2xl border border-[#26272d] space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h4 className="font-bold text-sm text-white flex items-center gap-2">
                    <Shield size={16} className="text-[#00ffff]" />
                    <span>Daftar Akun Staf Terdaftar</span>
                  </h4>
                  <p className="text-[11px] text-[#6b7367] mt-1">
                    Seluruh akun staf yang aktif dan otomatis mengisi section Karyawan Kantor.
                  </p>
                </div>
              </div>

              <TableContainer>
                <Table dense>
                  <thead>
                    <tr className="border-b border-[#26272d] text-[#6b7367] font-semibold text-[10px] uppercase tracking-wider bg-[#18181c]/50">
                      <th className="p-3.5">Nama Staf</th>
                      <th className="p-3.5">Peran</th>
                      <th className="p-3.5 text-center">Terdaftar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#26272d]">
                    {staffList.length === 0 ? (
                      <tr>
                        <td colSpan="3" className="p-8 text-center text-xs text-slate-600 font-medium italic">
                          Belum ada staf terdaftar di sistem.
                        </td>
                      </tr>
                    ) : (
                      staffList.map((staf, idx) => {
                        const badge = getRoleBadgeConfig(staf.role)
                        return (
                          <tr key={staf.id || idx} className="hover:bg-[#26272d]/10 transition-colors">
                            <td className="p-3.5">
                              <div className="font-bold text-white text-sm">{staf.nama}</div>
                              <div className="text-[11px] text-[#6b7367] font-mono">{staf.email || '-'}</div>
                            </td>
                            <td className="p-3.5">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${badge.bgClass}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${badge.dotClass}`} />
                                <span>{badge.label}</span>
                              </span>
                            </td>
                            <td className="p-3.5 text-center text-xs text-[#bbcbb2] font-mono">
                              {staf.created_at ? new Date(staf.created_at).toLocaleDateString('id-ID', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric'
                              }) : '-'}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </Table>
              </TableContainer>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Bayar Gaji Karyawan */}
      {showPayModal && (
        <div className="fixed inset-0 bg-[#18181c]/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-[#121215] border border-[#26272d] w-full max-w-md p-6 rounded-2xl shadow-2xl border border-[#26272d] space-y-4 animate-pop-in">
            <div className="flex justify-between items-center border-b border-[#26272d] pb-3">
              <div>
                <h3 className="font-extrabold text-sm text-white">
                  Form Pembayaran Gaji Karyawan
                </h3>
                <p className="text-[10px] text-[#6b7367]">Membayar langsung sisa gaji ke cashflow (Uang Owner)</p>
              </div>
              <button 
                onClick={() => setShowPayModal(false)}
                className="text-[#bbcbb2] hover:text-white text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleProcessWagePayment} className="space-y-4 text-xs">
              <div className="space-y-1">
                <span className="text-[10px] text-[#6b7367] font-bold uppercase tracking-wider block">Nama Karyawan</span>
                <input 
                  type="text" 
                  value={payForm.workerName} 
                  disabled 
                  readOnly 
                  className="w-full bg-[#18181c] border border-[#26272d] opacity-50 rounded-lg py-2 px-3 text-white text-sm font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <span className="text-[10px] text-[#6b7367] font-bold uppercase tracking-wider block">Sisa Gaji (Sistem)</span>
                  <span className="text-sm font-black text-[#00ffff] font-mono block pt-1.5">{formatRupiah(payForm.calculatedOutstanding)}</span>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-[#6b7367] font-bold uppercase tracking-wider block">Nominal Dibayarkan</span>
                  <input 
                    type="number" 
                    required 
                    value={payForm.amountToPay} 
                    onChange={(e) => setPayForm(prev => ({ ...prev, amountToPay: e.target.value }))}
                    className="w-full bg-[#18181c] border border-[#26272d] rounded-lg py-1.5 px-2.5 text-white text-sm font-bold font-mono focus:outline-none focus:border-brand-blue"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] text-[#6b7367] font-bold uppercase tracking-wider block">Sumber Dana Pembayaran (Cashflow POS)</span>
                <select 
                  value={payForm.fundSource} 
                  onChange={(e) => setPayForm(prev => ({ ...prev, fundSource: e.target.value }))}
                  className="w-full bg-[#18181c] border border-[#26272d] rounded-lg py-2 px-3 text-white text-xs font-bold focus:outline-none focus:border-brand-blue"
                >
                  <option value="REKENING Y">REKENING Y (Transfer Bank Y)</option>
                  <option value="REKENING N">REKENING N (Transfer Bank N)</option>
                  <option value="SALDO CASH">SALDO CASH (Dipotong dari Laci Kasir POS)</option>
                </select>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] text-[#6b7367] font-bold uppercase tracking-wider block">Keterangan Transaksi</span>
                <input 
                  type="text" 
                  required 
                  placeholder="Contoh: Pelunasan Gaji RAHMAN"
                  value={payForm.note} 
                  onChange={(e) => setPayForm(prev => ({ ...prev, note: e.target.value }))}
                  className="w-full bg-[#18181c] border border-[#26272d] rounded-lg py-2 px-3 text-white text-sm focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-[#26272d] mt-4">
                <button
                  type="button"
                  onClick={() => setShowPayModal(false)}
                  className="px-4 py-2 bg-[#18181c] hover:bg-[#26272d] font-bold rounded-xl text-xs text-white transition-colors w-24"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-[#00ffff] hover:bg-[#00ffff]/90 disabled:opacity-50 text-slate-950 font-bold rounded-xl text-xs transition-all w-24 active:scale-[0.98] shadow-md shadow-brand-emerald/15"
                >
                  {loading ? 'Menyimpan...' : 'Bayar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Crosscheck Detail Mobil Cuci */}
      {selectedJobForCrosscheck && (
        <div className="fixed inset-0 bg-[#18181c]/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-[#121215] border border-[#26272d] w-full max-w-md p-6 rounded-2xl shadow-2xl border border-[#26272d] space-y-4 animate-pop-in">
            <div className="flex justify-between items-center border-b border-[#26272d] pb-3">
              <div>
                <h3 className="font-black text-sm text-[#00ffff] tracking-wider uppercase font-mono">
                  Detail Transaksi Mobil {selectedJobForCrosscheck.platNomor}
                </h3>
                <p className="text-[10px] text-[#6b7367]">Crosscheck data transaksi & pembagian gaji</p>
              </div>
              <button 
                onClick={() => setSelectedJobForCrosscheck(null)}
                className="text-[#bbcbb2] hover:text-white text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-2.5 rounded-lg bg-[#18181c]/60 border border-[#26272d]">
                  <span className="text-[9px] text-[#6b7367] font-bold uppercase block">ID Transaksi</span>
                  <span className="font-mono text-[9px] font-bold text-white select-all">{selectedJobForCrosscheck.id}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-[#18181c]/60 border border-[#26272d]">
                  <span className="text-[9px] text-[#6b7367] font-bold uppercase block">Waktu Input</span>
                  <span className="font-mono text-[9.5px] font-semibold text-white">
                    {(() => {
                      const dParts = selectedJobForCrosscheck.tanggal ? String(selectedJobForCrosscheck.tanggal).split('T')[0].split('-') : []
                      const dStr = dParts.length === 3
                        ? `${parseInt(dParts[2], 10)} ${['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][parseInt(dParts[1], 10) - 1]} ${dParts[0]}`
                        : (selectedJobForCrosscheck.tanggal || '');
                      
                      let jStr = selectedJobForCrosscheck.jam ? selectedJobForCrosscheck.jam.substring(0, 5) : ''
                      if (!jStr && selectedJobForCrosscheck.created_at) {
                        const d = new Date(selectedJobForCrosscheck.created_at)
                        if (!isNaN(d.getTime())) {
                          jStr = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
                        }
                      }
                      return `${dStr}${jStr ? ` • ${jStr} WIB` : ''}`
                    })()}
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-[#18181c]/60 border border-[#26272d] space-y-2">
                <h5 className="font-bold text-[10px] text-[#bbcbb2] uppercase tracking-wider border-b border-[#26272d] pb-1 mb-1">Spesifikasi Layanan</h5>
                <div className="flex justify-between">
                  <span className="text-[#bbcbb2] font-medium">Jenis Paket:</span>
                  <span className="font-bold text-white">{selectedJobForCrosscheck.paket}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#bbcbb2] font-medium">Ukuran & Variant:</span>
                  <span className="font-bold text-white">{selectedJobForCrosscheck.ukuran} • {selectedJobForCrosscheck.variant}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-[#26272d]/50">
                  <span className="text-[#bbcbb2] font-medium">Total Harga Jasa:</span>
                  <span className="font-black text-[#00ffff]">{formatRupiah(selectedJobForCrosscheck.totalHarga)}</span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-[#18181c]/60 border border-[#26272d] space-y-2">
                <h5 className="font-bold text-[10px] text-[#bbcbb2] uppercase tracking-wider border-b border-[#26272d] pb-1 mb-1">Rincian Pembagian Gaji</h5>
                <div className="flex justify-between">
                  <span className="text-[#bbcbb2] font-medium">Kru Pencuci 1:</span>
                  <span className="font-bold text-white">{selectedJobForCrosscheck.rawItem?.anggota_1 || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#bbcbb2] font-medium">Kru Pencuci 2:</span>
                  <span className="font-bold text-white">{selectedJobForCrosscheck.rawItem?.anggota_2 || 'Tidak ada (Solo)'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#bbcbb2] font-medium">Tipe Pengerjaan:</span>
                  <span className="font-bold text-white font-mono text-[10px]">{selectedJobForCrosscheck.split}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-[#26272d]/50">
                  <span className="text-[#bbcbb2] font-bold">Porsi Gaji Diterima:</span>
                  <span className="font-black text-[#00ffff] text-sm">{formatRupiah(selectedJobForCrosscheck.shareWage)}</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setSelectedJobForCrosscheck(null)}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 font-bold rounded-xl text-xs text-white transition-colors"
            >
              Tutup Rincian
            </button>
          </div>
        </div>
      )}

      {/* CUSTOM ALERT/CONFIRM MODAL */}
      {customAlert && (
        <div className="fixed inset-0 bg-[#18181c]/80 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] animate-fade-in">
          <div className="bg-[#121215] border border-[#26272d] w-full max-w-sm p-6 rounded-2xl shadow-2xl border border-[#26272d] shadow-[0_0_50px_rgba(16,185,129,0.08)] animate-pop-in text-center">
            <div className="mb-4">
              {customAlert.title === 'Sukses' ? (
                <div className="w-12 h-12 mx-auto rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle className="text-[#00ffff]" size={24} />
                </div>
              ) : customAlert.title === 'Error' || customAlert.title === 'Hapus Karyawan Cuci' || customAlert.title === 'Hapus Karyawan Kantor' ? (
                <div className="w-12 h-12 mx-auto rounded-full bg-rose-500/10 flex items-center justify-center">
                  <AlertCircle className="text-rose-400" size={24} />
                </div>
              ) : (
                <div className="w-12 h-12 mx-auto rounded-full bg-amber-500/10 flex items-center justify-center">
                  <AlertCircle className="text-amber-400" size={24} />
                </div>
              )}
            </div>
            
            <h4 className="text-base font-extrabold text-white mb-2">
              {customAlert.title}
            </h4>
            <p className="text-xs text-[#bbcbb2] leading-relaxed mb-6">
              {customAlert.message}
            </p>
            
            <div className="flex justify-center gap-3">
              {customAlert.type === 'confirm' && (
                <button
                  type="button"
                  onClick={customAlert.onCancel}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 active:scale-[0.98] text-white font-bold rounded-xl text-xs transition-all w-24"
                >
                  Batal
                </button>
              )}
              <button
                type="button"
                onClick={customAlert.onConfirm}
                className={`px-4 py-2 active:scale-[0.98] font-bold rounded-xl text-xs transition-all w-24 ${
                  customAlert.title === 'Error' || customAlert.title === 'Hapus Karyawan Cuci' || customAlert.title === 'Hapus Karyawan Kantor'
                    ? 'bg-rose-500 hover:bg-rose-600 text-white'
                    : 'bg-[#00ffff] hover:bg-[#00ffff]/90 text-slate-950'
                }`}
              >
                {customAlert.type === 'confirm' ? 'Ya' : 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Karyawan
