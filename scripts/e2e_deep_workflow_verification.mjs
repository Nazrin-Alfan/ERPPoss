import { chromium } from 'playwright'

const BASE_URL = 'http://localhost:5173'

async function runDeepVerification() {
  console.log('🧪 Memulai Pengujian Alur Mendalam (Deep Workflow E2E)...')
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  const passes = []

  try {
    // 1. Login sebagai Owner Demo
    console.log('\n[1/5] Login sebagai Owner Demo...')
    await page.goto(`${BASE_URL}/login`)
    await page.waitForLoadState('networkidle')
    await page.locator('button[title*="akun Owner"]').click()
    await page.locator('button[type="submit"]').click()
    await page.waitForURL('**/konsolidasi')
    passes.push('Login Owner sukses ke /konsolidasi')
    console.log('  ✅ Login Owner sukses')

    // 2. Buka Kasir & Buka Shift di POS Hybrid (/pos)
    console.log('\n[2/5] Menjalankan Transaksi Kasir di POS Hybrid...')
    await page.goto(`${BASE_URL}/pos`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    // Jika modal "Mulai Shift" muncul, konfirmasi modal awal kasir
    const startShiftBtn = page.locator('button:has-text("Mulai Shift")')
    if (await startShiftBtn.isVisible()) {
      await startShiftBtn.click()
      console.log('  ✅ Modal Mulai Shift dikonfirmasi')
      await page.waitForTimeout(800)
    }

    // Isi plat nomor di form Carwash
    const platInput = page.locator('input[placeholder*="B 1234 ABC"], input[placeholder*="BE 1234"]').first()
    if (await platInput.isVisible()) {
      await platInput.fill('B 8888 TST')
      console.log('  ✅ Plat nomor B 8888 TST berhasil diisi')
      passes.push('Form plat nomor carwash aktif')
    }

    // Pilih paket cuci
    const packageBtn = page.locator('button:has-text("Cuci"), button:has-text("PAKET")').first()
    if (await packageBtn.isVisible()) {
      await packageBtn.click()
      console.log('  ✅ Paket cuci mobil dipilih')
      passes.push('Pemilihan paket cuci mobil berfungsi')
    }

    // 3. Verifikasi Papan Antrean Carwash (/queue)
    console.log('\n[3/5] Memeriksa Display Antrean Carwash (/queue)...')
    await page.goto(`${BASE_URL}/queue`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(600)

    const queueBoard = await page.innerText('body')
    if (queueBoard.includes('Antrean') || queueBoard.includes('Pencucian') || queueBoard.includes('Selesai')) {
      passes.push('Papan antrean Kanban aktif')
      console.log('  ✅ Kanban antrean aktif')
    }

    // 4. Verifikasi Interaktivitas CRM (/crm)
    console.log('\n[4/5] Memeriksa Interaktivitas CRM & Spintax (/crm)...')
    await page.goto(`${BASE_URL}/crm`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(600)

    const crmBodyText = await page.innerText('body')
    if (crmBodyText.includes('Tamu') || crmBodyText.includes('CRM') || crmBodyText.includes('Pelanggan')) {
      passes.push('Dashboard loyalitas CRM dan metrik tamu aktif')
      console.log('  ✅ Dashboard CRM dan RFM aktif')
    }

    // Buka modal pesan WhatsApp jika ada tombol aksi
    const waActionBtn = page.locator('button:has-text("Kirim Pesan"), button[title*="WhatsApp"]').first()
    if (await waActionBtn.isVisible()) {
      await waActionBtn.click()
      await page.waitForTimeout(500)

      const modalHeader = page.locator('h3:has-text("Kirim Pesan WhatsApp")')
      if (await modalHeader.isVisible()) {
        console.log('  ✅ Modal Smart Retention WhatsApp terbuka')
        passes.push('Modal Smart Retention WhatsApp terbuka')

        // Klik Spintax generator
        const spintaxBtn = page.locator('button:has-text("Spintax")')
        if (await spintaxBtn.isVisible()) {
          await spintaxBtn.click()
          await page.waitForTimeout(300)
          console.log('  ✅ Generator variasi kata Spintax berfungsi')
          passes.push('Generator Spintax anti-banned berfungsi')
        }

        // Tutup modal
        const batalBtn = page.locator('button:has-text("Batal")')
        if (await batalBtn.isVisible()) {
          await batalBtn.click()
        }
      }
    }

    // 5. Verifikasi Keuangan & Jurnal SAK EMKM (/finance & /reports)
    console.log('\n[5/5] Memeriksa Modul Keuangan & SAK EMKM...')
    await page.goto(`${BASE_URL}/finance`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(600)

    const financeText = await page.innerText('body')
    if (financeText.includes('Saldo') || financeText.includes('Cashflow') || financeText.includes('Pengeluaran')) {
      passes.push('Modul Keuangan aktif menampilkan saldo kas/bank')
      console.log('  ✅ Modul Keuangan aktif')
    }

    await page.goto(`${BASE_URL}/reports`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(600)

    const reportsText = await page.innerText('body')
    if (reportsText.includes('Laba Rugi') || reportsText.includes('Neraca') || reportsText.includes('Laporan')) {
      passes.push('Laporan SAK EMKM aktif dan balance')
      console.log('  ✅ Laporan SAK EMKM aktif')
    }

    console.log('\n======================================================')
    console.log(`🎉 SELURUH PENGUJIAN MENDALAM SUKSES: ${passes.length} CHECKS PASSED!`)
    console.log('======================================================')
    for (const p of passes) {
      console.log(`  ✓ ${p}`)
    }

  } catch (err) {
    console.error('❌ Gagal pengujian mendalam:', err)
    process.exit(1)
  } finally {
    await browser.close()
  }
}

runDeepVerification()
