import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { getTenantFeatures } from '../utils/businessCapabilities'
import { 
  Database as DbIcon, 
  Search, 
  Plus, 
  Edit3, 
  Trash2, 
  Eye, 
  X, 
  ChevronLeft, 
  ChevronRight, 
  CheckCircle, 
  AlertCircle, 
  Calendar,
  Filter,
  FileText
} from 'lucide-react'
import { formatRupiah } from '../utils/helpers'

const TABLES_METADATA = {
  carwash: {
    name: 'Transaksi Carwash',
    dateField: 'tanggal',
    keyField: 'id_transaksi',
    columns: [
      { name: 'id_transaksi', label: 'ID Transaksi', type: 'text', readOnly: true, placeholder: 'Otomatis' },
      { name: 'plat', label: 'Plat Nomor', type: 'text', required: true },
      { name: 'ukuran', label: 'Ukuran', type: 'select', options: ['Small', 'Medium', 'Large', 'Extra Large', 'Custom'], required: true },
      { name: 'variant', label: 'Varian', type: 'select', options: ['Regular', 'Body only'], required: true },
      { name: 'paket', label: 'Paket', type: 'text' },
      { name: 'harga', label: 'Harga Total', type: 'number', required: true },
      { name: 'harga_cuci', label: 'Harga Jasa Cuci', type: 'number' },
      { name: 'harga_paket', label: 'Harga Paket', type: 'number' },
      { name: 'gaji_pencuci', label: 'Upah Pencuci', type: 'number' },
      { name: 'anggota_1', label: 'Pencuci 1', type: 'text' },
      { name: 'anggota_2', label: 'Pencuci 2', type: 'text' },
      { name: 'status', label: 'Status', type: 'select', options: ['Antrean', 'Sedang Dicuci', 'Selesai', 'Batal'], required: true },
      { name: 'tanggal', label: 'Tanggal (YYYY-MM-DD)', type: 'date', required: true },
      { name: 'jam', label: 'Jam (HH:MM:SS)', type: 'text' }
    ]
  },
  struk: {
    name: 'Struk POS Cafe',
    dateField: 'tanggal',
    keyField: 'id_struk',
    columns: [
      { name: 'id_struk', label: 'ID Struk', type: 'text', readOnly: true, placeholder: 'Otomatis' },
      { name: 'tanggal', label: 'Tanggal (YYYY-MM-DD)', type: 'date', required: true },
      { name: 'jam', label: 'Jam (HH:MM:SS)', type: 'text' },
      { name: 'nama_pelanggan', label: 'Nama Pelanggan', type: 'text' },
      { name: 'metode_bayar', label: 'Metode Pembayaran', type: 'text', required: true },
      { name: 'status_bayar', label: 'Status Bayar', type: 'select', options: ['Pending', 'Selesai', 'Batal'], required: true },
      { name: 'kasir', label: 'Kasir', type: 'text', required: true },
      { name: 'diskon_carwash', label: 'Diskon Carwash', type: 'number' },
      { name: 'diskon_cafe', label: 'Diskon Cafe', type: 'number' },
      { name: 'total_tagihan', label: 'Total Tagihan', type: 'number', required: true }
    ]
  },
  cafe: {
    name: 'Item Transaksi Cafe',
    dateField: null,
    keyField: 'id_detail',
    columns: [
      { name: 'id_detail', label: 'ID Detail', type: 'text', readOnly: true, placeholder: 'Otomatis' },
      { name: 'id_struk', label: 'ID Struk', type: 'text', required: true },
      { name: 'nama_menu', label: 'Nama Menu', type: 'text', required: true },
      { name: 'qty', label: 'Jumlah', type: 'number', required: true },
      { name: 'harga_satuan', label: 'Harga Satuan', type: 'number', required: true },
      { name: 'subtotal', label: 'Subtotal', type: 'number', required: true },
      { name: 'status', label: 'Status', type: 'text' }
    ]
  },
  cashflow: {
    name: 'Alur Kas (Cashflow)',
    dateField: 'tanggal',
    keyField: 'id_cashflow',
    columns: [
      { name: 'id_cashflow', label: 'ID Cashflow', type: 'text', readOnly: true, placeholder: 'Otomatis' },
      { name: 'tanggal', label: 'Tanggal (YYYY-MM-DD)', type: 'date', required: true },
      { name: 'jenis', label: 'Jenis', type: 'text', required: true },
      { name: 'kategori', label: 'Kategori', type: 'text' },
      { name: 'keterangan_transaksi', label: 'Keterangan Transaksi', type: 'text', required: true },
      { name: 'pemasukan', label: 'Pemasukan', type: 'number' },
      { name: 'pengeluaran', label: 'Pengeluaran', type: 'number' },
      { name: 'saldo_cash', label: 'Saldo Cash', type: 'number' },
      { name: 'saldo_rekening_y', label: 'Saldo Rekening Y', type: 'number' },
      { name: 'saldo_rekening_n', label: 'Saldo Rekening N', type: 'number' }
    ]
  },
  stok_barang: {
    name: 'Stok Barang (Bahan Baku)',
    dateField: null,
    keyField: 'id_bahan_baku',
    columns: [
      { name: 'id_bahan_baku', label: 'ID Bahan Baku', type: 'text', readOnly: true, placeholder: 'Otomatis' },
      { name: 'nama_produk', label: 'Nama Produk', type: 'text', required: true },
      { name: 'satuan', label: 'Satuan', type: 'text', required: true },
      { name: 'stok', label: 'Stok', type: 'number', required: true },
      { name: 'harga_satuan', label: 'Harga Satuan', type: 'number' }
    ]
  },
  barang_masuk: {
    name: 'Log Barang Masuk',
    dateField: 'tanggal',
    keyField: 'id_masuk',
    columns: [
      { name: 'id_masuk', label: 'ID Masuk', type: 'text', readOnly: true, placeholder: 'Otomatis' },
      { name: 'id_pengeluaran', label: 'ID Pengeluaran', type: 'text' },
      { name: 'id_bahan_baku', label: 'ID Bahan Baku', type: 'text', required: true },
      { name: 'nama_produk', label: 'Nama Produk', type: 'text', required: true },
      { name: 'jumlah_masuk', label: 'Jumlah Masuk', type: 'number', required: true },
      { name: 'harga_satuan', label: 'Harga Satuan', type: 'number', required: true },
      { name: 'tanggal', label: 'Tanggal (YYYY-MM-DD)', type: 'date', required: true }
    ]
  },
  barang_keluar: {
    name: 'Log Barang Keluar (Opname)',
    dateField: 'tanggal',
    keyField: 'id_keluar',
    columns: [
      { name: 'id_keluar', label: 'ID Keluar', type: 'text', readOnly: true, placeholder: 'Otomatis' },
      { name: 'id_detail', label: 'ID Detail', type: 'text' },
      { name: 'id_bahan_baku', label: 'ID Bahan Baku', type: 'text', required: true },
      { name: 'nama_bahan_baku', label: 'Nama Bahan Baku', type: 'text', required: true },
      { name: 'jumlah_keluar', label: 'Jumlah Keluar', type: 'number', required: true },
      { name: 'tanggal', label: 'Tanggal (YYYY-MM-DD)', type: 'date', required: true }
    ]
  },
  daftar_harga_menu: {
    name: 'Daftar Menu & Harga',
    dateField: null,
    keyField: 'id_menu',
    columns: [
      { name: 'id_menu', label: 'ID Menu', type: 'text', readOnly: true, placeholder: 'Otomatis' },
      { name: 'daftar_menu', label: 'Nama Menu', type: 'text', required: true },
      { name: 'harga', label: 'Harga Jual', type: 'number', required: true },
      { name: 'kategori', label: 'Kategori', type: 'text', required: true },
      { name: 'is_active', label: 'Aktif?', type: 'select', options: ['true', 'false'], required: true }
    ]
  },
  resep: {
    name: 'Buku Resep Menu',
    dateField: null,
    keyField: 'id_resep',
    columns: [
      { name: 'id_resep', label: 'ID Resep', type: 'text', readOnly: true, placeholder: 'Otomatis' },
      { name: 'id_menu', label: 'ID Menu', type: 'text', required: true },
      { name: 'id_bahan_baku', label: 'ID Bahan Baku', type: 'text', required: true },
      { name: 'nama_menu', label: 'Nama Menu', type: 'text', required: true },
      { name: 'nama_bahan', label: 'Nama Bahan', type: 'text', required: true },
      { name: 'jumlah', label: 'Jumlah', type: 'number', required: true },
      { name: 'satuan', label: 'Satuan', type: 'text', required: true }
    ]
  },
  kasir: {
    name: 'Daftar Akun Kasir',
    dateField: null,
    keyField: 'nama',
    columns: [
      { name: 'nama', label: 'Nama Kasir', type: 'text', required: true },
      { name: 'is_active', label: 'Aktif?', type: 'select', options: ['true', 'false'], required: true }
    ]
  },
  metode_bayar: {
    name: 'Daftar Metode Pembayaran',
    dateField: null,
    keyField: 'nama',
    columns: [
      { name: 'nama', label: 'Nama Metode', type: 'text', required: true },
      { name: 'is_active', label: 'Aktif?', type: 'select', options: ['true', 'false'], required: true }
    ]
  },
  pengeluaran: {
    name: 'Log Pengeluaran Toko',
    dateField: 'tanggal',
    keyField: 'id_pengeluaran',
    columns: [
      { name: 'id_pengeluaran', label: 'ID Pengeluaran', type: 'text', readOnly: true, placeholder: 'Otomatis' },
      { name: 'id_cashflow', label: 'ID Cashflow', type: 'text' },
      { name: 'no', label: 'Nomor Urut', type: 'number' },
      { name: 'tanggal', label: 'Tanggal (YYYY-MM-DD)', type: 'date', required: true },
      { name: 'jam', label: 'Jam (HH:MM:SS)', type: 'text' },
      { name: 'nama_pengeluaran', label: 'Nama Pengeluaran', type: 'text', required: true },
      { name: 'jenis', label: 'Jenis', type: 'text', required: true },
      { name: 'kategori', label: 'Kategori', type: 'text' },
      { name: 'nominal', label: 'Nominal (Rp)', type: 'number', required: true },
      { name: 'id_bahan_baku', label: 'ID Bahan Baku', type: 'text' },
      { name: 'qty', label: 'Qty', type: 'number' },
      { name: 'apakah_stok', label: 'Apakah Stok?', type: 'select', options: ['true', 'false'] }
    ]
  }
}

const DatabaseManager = () => {
  const { activeTenant } = useAuth()
  const features = getTenantFeatures(activeTenant?.business_type)

  const availableTables = useMemo(() => {
    return Object.keys(TABLES_METADATA).filter(key => {
      if (features.isCafeOnly) {
        return key !== 'carwash' && key !== 'karyawan_cuci'
      }
      if (features.isCarwashOnly) {
        return key !== 'cafe' && key !== 'daftar_harga_menu' && key !== 'resep'
      }
      return true
    })
  }, [features.isCafeOnly, features.isCarwashOnly])

  const defaultTable = features.isCafeOnly ? 'struk' : 'carwash'
  const [selectedTable, setSelectedTable] = useState(defaultTable)

  useEffect(() => {
    if (!availableTables.includes(selectedTable)) {
      setSelectedTable(availableTables[0] || 'struk')
    }
  }, [availableTables, selectedTable])

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Filter States
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [searchQuery, setSearchQuery] = useState('')

  // Pagination States
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const pageSize = 50

  // Sorting
  const [sortColumn, setSortColumn] = useState('')
  const [sortAscending, setSortAscending] = useState(false)

  // Form Modal States
  const [showFormModal, setShowFormModal] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState({})
  
  // JSON Detail Viewer Modal
  const [viewingRowJson, setViewingRowJson] = useState(null)

  // Custom Modal Alert/Confirm
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

  const monthOptions = useMemo(() => {
    const options = []
    const now = new Date()
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const label = d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      options.push({ val, label })
    }
    options.push({ val: 'Semua', label: 'Semua Bulan' })
    return options
  }, [])

  // Fetch Table Data
  const fetchTableData = async () => {
    if (!selectedTable) return
    setLoading(true)
    setError('')
    try {
      const meta = TABLES_METADATA[selectedTable]
      let query = supabase.from(selectedTable).select('*', { count: 'exact' })
      
      // Apply monthly date filter if the table has a dateField and selectedMonth !== 'Semua'
      if (meta.dateField && selectedMonth !== 'Semua') {
        const [year, month] = selectedMonth.split('-').map(Number)
        const startDate = `${selectedMonth}-01`
        let nextYear = year
        let nextMonth = month + 1
        if (nextMonth > 12) {
          nextMonth = 1
          nextYear += 1
        }
        const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`
        
        query = query.gte(meta.dateField, startDate).lt(meta.dateField, endDate)
      }
      
      // Sorting
      if (sortColumn) {
        query = query.order(sortColumn, { ascending: sortAscending })
      } else if (meta.keyField) {
        query = query.order(meta.keyField, { ascending: false })
      }
      
      // Pagination
      const from = (currentPage - 1) * pageSize
      const to = from + pageSize - 1
      query = query.range(from, to)
      
      const { data, count, error: err } = await query
      if (err) throw err
      
      setRows(data || [])
      setTotalCount(count || 0)
    } catch (err) {
      console.error('Error fetching table data:', err)
      setError(`Gagal memuat data dari ${TABLES_METADATA[selectedTable].name}: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTableData()
  }, [selectedTable, selectedMonth, currentPage, sortColumn, sortAscending])

  const colToCsvLabel = (label) => {
    let str = String(label).replace(/"/g, '""')
    return `"${str}"`
  }

  // Export Table Data to CSV bypassing pagination
  const handleExportCSV = async () => {
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const meta = TABLES_METADATA[selectedTable]
      let allRows = []
      let from = 0
      const step = 1000
      
      while (true) {
        let query = supabase.from(selectedTable).select('*')
        
        // Apply monthly date filter
        if (meta.dateField && selectedMonth !== 'Semua') {
          const [year, month] = selectedMonth.split('-').map(Number)
          const startDate = `${selectedMonth}-01`
          let nextYear = year
          let nextMonth = month + 1
          if (nextMonth > 12) {
            nextMonth = 1
            nextYear += 1
          }
          const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`
          query = query.gte(meta.dateField, startDate).lt(meta.dateField, endDate)
        }
        
        // range
        query = query.range(from, from + step - 1)
        
        if (meta.keyField) {
          query = query.order(meta.keyField, { ascending: false })
        }
        
        const { data, error: err } = await query
        if (err) throw err
        
        if (!data || data.length === 0) break
        allRows = allRows.concat(data)
        if (data.length < step) break
        from += step
      }
      
      if (allRows.length === 0) {
        await showAlert('Tidak ada data untuk diekspor pada filter terpilih.', 'Informasi')
        return
      }

      // Convert rows to CSV
      const headers = meta.columns.map(c => c.name)
      const headerLabels = meta.columns.map(c => colToCsvLabel(c.label))
      
      const csvRows = [headerLabels.join(',')]
      
      allRows.forEach(row => {
        const values = headers.map(header => {
          let val = row[header]
          if (val === null || val === undefined) {
            return '""'
          }
          let str = String(val).replace(/"/g, '""')
          return `"${str}"`
        })
        csvRows.push(values.join(','))
      })
      
      const csvContent = '\uFEFF' + csvRows.join('\n') // BOM for Excel UTF-8
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.setAttribute('href', url)
      
      const fileName = `${selectedTable}_${selectedMonth !== 'Semua' ? selectedMonth : 'all'}.csv`
      link.setAttribute('download', fileName)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      setSuccess(`Berhasil mengekspor ${allRows.length} baris data ke file ${fileName}!`)
    } catch (err) {
      console.error('Error exporting CSV:', err)
      setError(`Gagal mengekspor CSV: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  // Reset page when switching table
  const handleTableChange = (e) => {
    setSelectedTable(e.target.value)
    setCurrentPage(1)
    setSortColumn('')
    setSortAscending(false)
    setSearchQuery('')
    setError('')
    setSuccess('')
  }

  // Filter local rows by client-side search
  const filteredRows = useMemo(() => {
    if (!searchQuery) return rows
    const q = searchQuery.toLowerCase()
    return rows.filter(r => {
      return Object.values(r).some(val => 
        String(val || '').toLowerCase().includes(q)
      )
    })
  }, [rows, searchQuery])

  // Open Form modal for creation
  const handleOpenCreateModal = () => {
    setError('')
    setSuccess('')
    setIsEditing(false)
    const initialForm = {}
    TABLES_METADATA[selectedTable].columns.forEach(col => {
      initialForm[col.name] = col.type === 'select' ? col.options[0] : ''
    })
    setFormData(initialForm)
    setShowFormModal(true)
  }

  // Open Form modal for editing
  const handleOpenEditModal = (row) => {
    setError('')
    setSuccess('')
    setIsEditing(true)
    const editableForm = { ...row }
    // Convert boolean values to strings for easy select handling
    TABLES_METADATA[selectedTable].columns.forEach(col => {
      if (col.type === 'select' && (editableForm[col.name] === true || editableForm[col.name] === false)) {
        editableForm[col.name] = String(editableForm[col.name])
      }
    })
    setFormData(editableForm)
    setShowFormModal(true)
  }

  // CRUD: Delete Row
  const handleDeleteRow = async (row) => {
    const meta = TABLES_METADATA[selectedTable]
    const idVal = row[meta.keyField]
    const confirmed = await showConfirm(`Apakah Anda yakin ingin menghapus baris dengan ${meta.keyField} = "${idVal}" secara permanen dari ${meta.name}?`, 'Konfirmasi Hapus')
    if (!confirmed) return
    
    setSubmitting(true)
    setError('')
    setSuccess('')
    try {
      const { error: err } = await supabase
        .from(selectedTable)
        .delete()
        .eq(meta.keyField, idVal)
      
      if (err) throw err
      
      setSuccess('Data berhasil dihapus!')
      await fetchTableData()
    } catch (err) {
      console.error('Error deleting row:', err)
      setError(`Gagal menghapus data: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  // CRUD: Insert or Update Submit Handler
  const handleSubmitForm = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setSubmitting(true)
    
    const meta = TABLES_METADATA[selectedTable]
    const submitData = {}
    
    meta.columns.forEach(col => {
      if (col.readOnly && !isEditing) return
      
      let val = formData[col.name]
      
      // Parse numbers
      if (col.type === 'number') {
        val = val === '' ? null : parseFloat(val)
      }
      
      // Convert boolean string select back to boolean
      if (col.name === 'is_available' || col.name === 'is_active' || col.name === 'apakah_stok' || col.type === 'boolean') {
        val = val === 'true' || val === true
      }
      
      submitData[col.name] = val
    })
    
    try {
      if (isEditing) {
        const { error: err } = await supabase
          .from(selectedTable)
          .update(submitData)
          .eq(meta.keyField, formData[meta.keyField])
        if (err) throw err
        setSuccess('Data berhasil diperbarui!')
      } else {
        // If the keyField is auto/readOnly, remove it from submitData so Postgres generates it
        if (meta.keyField && meta.columns.find(c => c.name === meta.keyField)?.readOnly) {
          delete submitData[meta.keyField]
        }
        
        const { error: err } = await supabase
          .from(selectedTable)
          .insert(submitData)
        if (err) throw err
        setSuccess('Data berhasil ditambahkan!')
      }
      
      setShowFormModal(false)
      await fetchTableData()
    } catch (err) {
      console.error('Error saving data:', err)
      setError(`Gagal menyimpan data: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  // Toggle sorting order
  const handleSort = (columnName) => {
    if (sortColumn === columnName) {
      setSortAscending(!sortAscending)
    } else {
      setSortColumn(columnName)
      setSortAscending(true)
    }
    setCurrentPage(1)
  }

  const meta = TABLES_METADATA[selectedTable]
  const totalPages = Math.ceil(totalCount / pageSize) || 1

  return (
    <div className="p-6 pb-24 md:pb-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <DbIcon size={32} className="text-brand-blue animate-pulse" />
            Database Manager
          </h1>
          <p className="text-slate-400 text-sm mt-1">Kelola, sunting, cari, dan lakukan pemeliharaan data database secara langsung</p>
        </div>
      </div>

      {/* Alert Banner */}
      {success && (
        <div className="p-4 rounded-xl bg-brand-emerald/10 border border-brand-emerald/20 text-brand-emerald text-sm flex items-center gap-3 animate-fade-in">
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

      {/* Toolbar / Filters Panel */}
      <div className="glass-panel p-4 rounded-2xl border border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Table Selector */}
          <div className="space-y-1">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Pilih Tabel</span>
            <select
              value={selectedTable}
              onChange={handleTableChange}
              className="bg-slate-900 border border-slate-800 rounded-xl py-2 px-3 text-white text-xs font-bold focus:outline-none focus:border-brand-blue min-w-[200px]"
            >
              {availableTables.map(key => (
                <option key={key} value={key}>{TABLES_METADATA[key].name} ({key})</option>
              ))}
            </select>
          </div>

          {/* Month Selector (if table has dateField) */}
          {meta.dateField && (
            <div className="space-y-1">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Filter Bulan</span>
              <select
                value={selectedMonth}
                onChange={(e) => { setSelectedMonth(e.target.value); setCurrentPage(1) }}
                className="bg-slate-900 border border-slate-800 rounded-xl py-2 px-3 text-white text-xs font-bold focus:outline-none focus:border-brand-blue"
              >
                {monthOptions.map(opt => (
                  <option key={opt.val} value={opt.val}>{opt.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Export CSV Button */}
          <div className="space-y-1 self-end">
            <button
              onClick={handleExportCSV}
              disabled={loading}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-brand-emerald border border-slate-800 hover:border-slate-700 disabled:opacity-50 font-bold rounded-xl py-[8.5px] text-xs transition-all flex items-center gap-1.5 active:scale-95"
            >
              <FileText size={13} />
              Cetak CSV
            </button>
          </div>
        </div>

        {/* Search & Actions */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          {/* Client Search */}
          <div className="relative flex-1 md:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Cari data di halaman ini..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 pl-9 pr-4 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-brand-blue"
            />
          </div>

          {/* Create Button */}
          <button
            onClick={handleOpenCreateModal}
            className="flex items-center gap-1.5 px-4 py-2 bg-brand-emerald hover:bg-emerald-500 active:scale-95 text-slate-950 font-bold rounded-xl text-xs transition-all shadow-md shadow-brand-emerald/15 shrink-0"
          >
            <Plus size={14} />
            Tambah Baris
          </button>
        </div>
      </div>

      {/* Main Grid / Data Table */}
      <div className="glass-panel rounded-2xl border border-slate-800/80 overflow-hidden relative min-h-[300px]">
        {loading && (
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-10">
            <div className="w-8 h-8 border-4 border-brand-blue border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500 font-semibold uppercase tracking-wider bg-slate-900/60 select-none">
                {meta.columns.map(col => (
                  <th 
                    key={col.name} 
                    onClick={() => handleSort(col.name)}
                    className="p-4 cursor-pointer hover:bg-slate-800/20 hover:text-white transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{col.label}</span>
                      <span className="text-[9px] text-slate-600">
                        {sortColumn === col.name ? (sortAscending ? '▲' : '▼') : '↕'}
                      </span>
                    </div>
                  </th>
                ))}
                <th className="p-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={meta.columns.length + 1} className="p-12 text-center text-slate-500 italic">
                    {loading ? 'Sedang memuat data...' : 'Tidak ditemukan data di halaman ini.'}
                  </td>
                </tr>
              ) : (
                filteredRows.map((row, idx) => (
                  <tr key={row[meta.keyField] || idx} className="hover:bg-slate-800/10 transition-colors">
                    {meta.columns.map(col => {
                      const val = row[col.name]
                      let displayVal = String(val !== null && val !== undefined ? val : '')
                      
                      // Format rupiah if type is number and name has harga / gaji / pemasukan / pengeluaran
                      if (col.type === 'number' && val !== null && val !== undefined) {
                        if (
                          col.name.includes('harga') || 
                          col.name.includes('gaji') || 
                          col.name.includes('pemasukan') || 
                          col.name.includes('pengeluaran') ||
                          col.name.includes('kerugian') ||
                          col.name.includes('saldo') ||
                          col.name.includes('total')
                        ) {
                          displayVal = formatRupiah(val)
                        }
                      }
                      
                      // Format boolean display
                      if (val === true) displayVal = 'AKTIF / TERSEDIA'
                      if (val === false) displayVal = 'NON-AKTIF'

                      return (
                        <td key={col.name} className="p-4 font-medium text-slate-300 max-w-[200px] truncate" title={displayVal}>
                          {col.name === meta.keyField ? (
                            <span className="font-mono text-[10px] text-slate-400 select-all">{displayVal}</span>
                          ) : (
                            displayVal
                          )}
                        </td>
                      )
                    })}
                    <td className="p-4 text-right space-x-1 shrink-0 whitespace-nowrap">
                      {/* JSON viewer */}
                      <button
                        onClick={() => setViewingRowJson(row)}
                        title="Lihat Detail JSON"
                        className="p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg border border-slate-800 transition-colors active:scale-95 inline-flex"
                      >
                        <Eye size={12} />
                      </button>
                      {/* Edit Button */}
                      <button
                        onClick={() => handleOpenEditModal(row)}
                        title="Sunting Baris"
                        className="p-1.5 bg-slate-900 hover:bg-brand-blue/10 text-brand-blue rounded-lg border border-slate-800 hover:border-brand-blue/20 transition-colors active:scale-95 inline-flex"
                      >
                        <Edit3 size={12} />
                      </button>
                      {/* Delete Button */}
                      <button
                        onClick={() => handleDeleteRow(row)}
                        title="Hapus Baris"
                        className="p-1.5 bg-slate-900 hover:bg-rose-500/10 text-brand-rose rounded-lg border border-slate-800 hover:border-brand-rose/20 transition-colors active:scale-95 inline-flex"
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Panel */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-900/40 flex items-center justify-between flex-wrap gap-4 text-[11px] text-slate-400 font-medium">
          <div>
            Menampilkan <span className="font-bold text-slate-200">{filteredRows.length}</span> baris dari{' '}
            <span className="font-bold text-slate-200">{totalCount}</span> total baris
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1 || loading}
              className="p-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white rounded-lg border border-slate-800 transition-colors"
            >
              <ChevronLeft size={12} />
            </button>
            <span>Halaman <span className="font-bold text-white">{currentPage}</span> dari <span className="font-bold text-white">{totalPages}</span></span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages || loading}
              className="p-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white rounded-lg border border-slate-800 transition-colors"
            >
              <ChevronRight size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* FORM CREATE / EDIT MODAL */}
      {showFormModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="glass-panel w-full max-w-xl p-6 rounded-2xl shadow-2xl border border-slate-800 max-h-[90vh] flex flex-col justify-between animate-pop-in">
            <div>
              <div className="flex justify-between items-center border-b border-slate-800 pb-4 mb-4">
                <h3 className="text-lg font-bold text-white">
                  {isEditing ? 'Sunting Data Baris' : 'Tambah Baris Baru'}
                </h3>
                <button 
                  onClick={() => setShowFormModal(false)}
                  className="text-slate-400 hover:text-slate-200"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSubmitForm} className="space-y-4 overflow-y-auto max-h-[60vh] pr-2 scrollbar-thin">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {meta.columns.map(col => {
                    const isReadOnly = col.readOnly
                    
                    return (
                      <div key={col.name} className="space-y-1.5">
                        <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">
                          {col.label} {col.required && <span className="text-brand-rose">*</span>}
                        </label>
                        
                        {col.type === 'select' ? (
                          <select
                            value={formData[col.name] !== undefined ? formData[col.name] : ''}
                            onChange={(e) => setFormData(prev => ({ ...prev, [col.name]: e.target.value }))}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-brand-blue"
                            required={col.required}
                          >
                            {col.options.map(opt => (
                              <option key={opt} value={opt}>{opt === 'true' ? 'AKTIF' : opt === 'false' ? 'NON-AKTIF' : opt}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
                            step={col.type === 'number' ? 'any' : undefined}
                            placeholder={col.placeholder || `Ketik ${col.label}...`}
                            value={formData[col.name] !== undefined && formData[col.name] !== null ? formData[col.name] : ''}
                            onChange={(e) => setFormData(prev => ({ ...prev, [col.name]: e.target.value }))}
                            readOnly={isReadOnly}
                            disabled={isReadOnly}
                            className={`w-full bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-brand-blue ${
                              isReadOnly ? 'opacity-40 cursor-not-allowed font-mono text-xs' : ''
                            }`}
                            required={col.required}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>

                <div className="flex justify-end gap-3 pt-6 border-t border-slate-800 mt-6">
                  <button
                    type="button"
                    onClick={() => setShowFormModal(false)}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 active:scale-95 text-slate-300 font-bold rounded-xl text-xs transition-all w-24"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 bg-brand-emerald hover:bg-emerald-500 active:scale-95 text-slate-950 font-bold rounded-xl text-xs transition-all w-24 shadow-md shadow-brand-emerald/10 disabled:opacity-50"
                  >
                    {submitting ? 'Menyimpan...' : 'Simpan'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* JSON VIEW DETAIL MODAL */}
      {viewingRowJson && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="glass-panel w-full max-w-xl p-6 rounded-2xl shadow-2xl border border-slate-800 max-h-[90vh] flex flex-col justify-between animate-pop-in">
            <div>
              <div className="flex justify-between items-center border-b border-slate-800 pb-4 mb-4">
                <div>
                  <h3 className="text-sm font-bold text-brand-blue font-mono uppercase tracking-wider">
                    Detail JSON Baris Data
                  </h3>
                  <p className="text-[10px] text-slate-500">Tabel: {selectedTable} • Key: {meta.keyField}</p>
                </div>
                <button 
                  onClick={() => setViewingRowJson(null)}
                  className="text-slate-400 hover:text-slate-200"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="bg-slate-950 border border-slate-900 p-4 rounded-xl max-h-[55vh] overflow-auto">
                <pre className="text-[10px] font-mono text-emerald-400 select-all overflow-x-auto whitespace-pre-wrap leading-relaxed">
                  {JSON.stringify(viewingRowJson, null, 2)}
                </pre>
              </div>

              <div className="flex justify-end pt-6">
                <button
                  onClick={() => setViewingRowJson(null)}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 font-bold rounded-xl text-xs text-slate-200 transition-colors"
                >
                  Tutup Rincian
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM ALERT/CONFIRM MODAL */}
      {customAlert && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] animate-fade-in">
          <div className="glass-panel w-full max-w-sm p-6 rounded-2xl shadow-2xl border border-slate-800 text-center animate-pop-in">
            <div className="mb-4">
              {customAlert.title === 'Sukses' ? (
                <div className="w-12 h-12 mx-auto rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle className="text-emerald-400" size={24} />
                </div>
              ) : customAlert.title === 'Konfirmasi Hapus' ? (
                <div className="w-12 h-12 mx-auto rounded-full bg-rose-500/10 flex items-center justify-center">
                  <Trash2 className="text-rose-400" size={24} />
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
            <p className="text-xs text-slate-350 leading-relaxed mb-6">
              {customAlert.message}
            </p>
            
            <div className="flex justify-center gap-3">
              {customAlert.type === 'confirm' && (
                <button
                  type="button"
                  onClick={customAlert.onCancel}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 font-bold rounded-xl text-xs transition-all w-24"
                >
                  Batal
                </button>
              )}
              <button
                type="button"
                onClick={customAlert.onConfirm}
                className={`px-4 py-2 active:scale-95 font-bold rounded-xl text-xs transition-all w-24 ${
                  customAlert.title === 'Konfirmasi Hapus'
                    ? 'bg-rose-500 hover:bg-rose-600 text-white'
                    : 'bg-brand-blue hover:bg-cyan-500 text-slate-950'
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

export default DatabaseManager
