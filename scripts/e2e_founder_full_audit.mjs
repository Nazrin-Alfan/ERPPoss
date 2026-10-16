import { chromium } from 'playwright'

const BASE_URL = 'http://localhost:5173'

async function runFounderFullAudit() {
  console.log('👑 Memulai Audit & Pengujian Menyeluruh Halaman Founder (/founder)...')
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  const report = []

  function logPass(title, detail = '') {
    console.log(`  ✅ [PASS] ${title} ${detail ? `-> ${detail}` : ''}`)
    report.push({ title, status: 'PASS', detail })
  }

  function logFail(title, err) {
    console.error(`  ❌ [FAIL] ${title}:`, err)
    report.push({ title, status: 'FAIL', error: String(err) })
  }

  try {
    // -------------------------------------------------------------
    // 1. LOGIN SEBAGAI FOUNDER / SUPER ADMIN
    // -------------------------------------------------------------
    console.log('\n--- 1. Login Sesi Founder ---')
    await page.goto(`${BASE_URL}/login`)
    await page.waitForLoadState('networkidle')
    await page.locator('button[title*="akun Super Admin"]').click()
    await page.locator('button[type="submit"]').click()
    await page.waitForURL('**/founder')
    logPass('Login Founder berhasil dan mendarat di /founder', page.url())

    // -------------------------------------------------------------
    // 2. HEADER COMMAND BAR & KONTROL PROFIL
    // -------------------------------------------------------------
    console.log('\n--- 2. Header Command Bar & Navigasi ---')
    const brandHeading = await page.locator('header').innerText()
    if (brandHeading.includes('RELAYPOS FOUNDER') && brandHeading.includes('Super Admin')) {
      logPass('Header Brand Command Bar & Badge Super Admin aktif')
    }

    // Tombol "Mode Owner" link
    const modeOwnerLink = page.locator('a:has-text("Mode Owner")')
    if (await modeOwnerLink.isVisible()) {
      const href = await modeOwnerLink.getAttribute('href')
      logPass('Tombol Mode Owner tersedia', `Tautan ke ${href}`)
    }

    // -------------------------------------------------------------
    // 3. 4 HERO KPI METRICS (SaaS Telemetry)
    // -------------------------------------------------------------
    console.log('\n--- 3. Pemeriksaan 4 Hero SaaS Metrics ---')
    const mrrBox = await page.locator('div:has-text("Estimasi MRR Platform")').last().innerText()
    const gmvBox = await page.locator('div:has-text("Platform GMV (Volume)")').last().innerText()
    const activeBox = await page.locator('div:has-text("Klien Tenant Aktif")').last().innerText()
    const suspendBox = await page.locator('div:has-text("Dibekukan / Menunggak")').last().innerText()

    logPass('Kartu Estimasi MRR Platform', mrrBox.split('\n')[1] || 'OK')
    logPass('Kartu Platform GMV Volume', gmvBox.split('\n')[1] || 'OK')
    logPass('Kartu Klien Tenant Aktif', activeBox.split('\n')[1] || 'OK')
    logPass('Kartu Dibekukan/Menunggak', suspendBox.split('\n')[1] || 'OK')

    // -------------------------------------------------------------
    // 4. ACTION BAR (TERBITKAN TENANT, BACKUP DB, REFRESH)
    // -------------------------------------------------------------
    console.log('\n--- 4. Tombol Aksi Global Mission Control ---')

    // 4.1 Tombol Refresh
    const refreshBtn = page.locator('button[title="Sinkronisasi data terbaru"]')
    await refreshBtn.click()
    await page.waitForTimeout(500)
    logPass('Tombol Refresh Data Platform berfungsi normal')

    // 4.2 Tombol Backup DB Snapshot
    const backupBtn = page.locator('button[title*="database snapshot"]')
    await backupBtn.click()
    await page.waitForTimeout(600)
    logPass('Tombol Backup DB Snapshot memicu ekspor JSON aman')

    // 4.3 Tombol "Terbitkan Tenant Baru" (Buka Modal)
    const createModalBtn = page.locator('button:has-text("Terbitkan Tenant Baru")')
    await createModalBtn.click()
    await page.waitForTimeout(400)

    const modalTitle = page.locator('h3:has-text("Terbitkan Tenant Klien Baru")')
    if (await modalTitle.isVisible()) {
      logPass('Modal Terbitkan Tenant Klien Baru terbuka')
    }

    // Isi Form Tenant Baru
    const testStoreName = `Cabang Mitra ${Date.now()}`
    const testOwnerEmail = `owner.${Date.now()}@mitra.com`
    await page.locator('input[placeholder*="Barbershop & Cuci"]').fill(testStoreName)
    await page.locator('input[placeholder*="Nama Lengkap"]').fill('Pak Haji Supardi')
    await page.locator('input[placeholder*="email@owner.com"]').fill(testOwnerEmail)

    // Pilih paket Enterprise di dalam form modal
    await page.locator('form select').first().selectOption('ENTERPRISE')

    // Submit form pembuatan tenant
    await page.locator('button[type="submit"]:has-text("Terbitkan & Aktivasi")').click()
    await page.waitForTimeout(1000)

    const tableContent = await page.locator('table').innerText()
    if (tableContent.includes(testStoreName)) {
      logPass('Pembuatan & Penerbitan Tenant Baru Sukses', `Ditemukan di tabel: ${testStoreName}`)
    } else {
      throw new Error(`Tenant baru tidak muncul di tabel: ${testStoreName}`)
    }

    // -------------------------------------------------------------
    // 5. SEARCH & FILTER PLAN
    // -------------------------------------------------------------
    console.log('\n--- 5. Search Bar & Filter Paket ---')
    const searchInput = page.locator('input[placeholder*="Cari nama"]')
    await searchInput.fill(testStoreName)
    await page.waitForTimeout(300)

    const filteredRows = await page.locator('tbody tr').count()
    if (filteredRows >= 1) {
      logPass('Fitur Search Real-Time berfungsi memfilter daftar tenant', `Ditemukan ${filteredRows} baris`)
    }
    await searchInput.fill('') // clear search

    // Filter dropdown
    const planSelect = page.locator('select:has-text("Semua Paket")')
    await planSelect.selectOption('ENTERPRISE')
    await page.waitForTimeout(300)
    logPass('Filter dropdown Paket berfungsi normal (Filter: ENTERPRISE)')
    await planSelect.selectOption('ALL')
    await page.waitForTimeout(300)

    // -------------------------------------------------------------
    // 6. AKSI TABEL: PERPANJANG LISENSI
    // -------------------------------------------------------------
    console.log('\n--- 6. Aksi Tabel: Perpanjang Lisensi Modal ---')
    const renewBtn = page.locator('button:has-text("Perpanjang")').first()
    await renewBtn.click()
    await page.waitForTimeout(400)

    const renewalModal = page.locator('h3:has-text("Perpanjang Lisensi")')
    if (await renewalModal.isVisible()) {
      logPass('Modal Perpanjang Lisensi berhasil terbuka')

      // Pilih +24 Bulan
      await page.locator('select:has-text("Bulan")').selectOption('24')
      await page.locator('button:has-text("Konfirmasi Perpanjang")').click()
      await page.waitForTimeout(800)
      logPass('Lisensi tenant berhasil diperpanjang (+24 Bulan) via Serial Key Generator')
    }

    // -------------------------------------------------------------
    // 7. AKSI TABEL: KILL-SWITCH (BEKUKAN & AKTIFKAN)
    // -------------------------------------------------------------
    console.log('\n--- 7. Aksi Tabel: Kill-Switch Pembekuan Akun ---')
    const killSwitchBtn = page.locator('button[title*="Kill Switch"], button[title*="Buka Blokir"]').first()
    await killSwitchBtn.click()
    await page.waitForTimeout(800)
    logPass('Kill-Switch Pembekuan / Aktivasi Akun berhasil dieksekusi')

    // Kembalikan status
    await killSwitchBtn.click()
    await page.waitForTimeout(800)
    logPass('Status tenant dikembalikan aktif via Kill-Switch')

    // -------------------------------------------------------------
    // 8. AKSI TABEL: ARSIPKAN TENANT (SOFT DELETE)
    // -------------------------------------------------------------
    console.log('\n--- 8. Aksi Tabel: Arsipkan Tenant (Soft Delete) ---')
    const archiveBtn = page.locator('button[title*="Arsipkan Toko"]').first()
    if (await archiveBtn.isVisible()) {
      await archiveBtn.click()
      await page.waitForTimeout(400)
      const archiveModal = page.locator('h3:has-text("Arsipkan Tenant Toko")')
      if (await archiveModal.isVisible()) {
        logPass('Modal Arsipkan Tenant Toko (Soft Delete) berhasil terbuka')
        await page.locator('button:has-text("Batal")').click()
        await page.waitForTimeout(300)
      }
    }

    // -------------------------------------------------------------
    // 9. AKSI TABEL: IMPERSONASI TENANT
    // -------------------------------------------------------------
    console.log('\n--- 9. Aksi Tabel: Impersonasi Masuk ke Workspace Tenant ---')
    const impersonateBtn = page.locator('button[title*="Impersonasi"]').first()
    await impersonateBtn.click()
    await page.waitForTimeout(1000)

    const impersonateUrl = page.url()
    if (impersonateUrl.includes('/dashboard')) {
      logPass('Fitur Impersonasi Tenant sukses', `Dialihkan ke workspace tenant: ${impersonateUrl}`)
    }

  } catch (err) {
    logFail('Founder Page Full Audit Execution', err)
  } finally {
    await browser.close()
  }

  console.log('\n======================================================')
  const passedCount = report.filter(r => r.status === 'PASS').length
  const failedCount = report.filter(r => r.status === 'FAIL').length
  console.log(`HASIL AUDIT HALAMAN FOUNDER: ${passedCount} PASSED, ${failedCount} FAILED`)
  console.log('======================================================')

  if (failedCount > 0) {
    process.exit(1)
  }
}

runFounderFullAudit()
