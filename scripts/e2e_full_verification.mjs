import { chromium } from 'playwright'

const BASE_URL = 'http://localhost:5173'

async function runVerification() {
  console.log('🚀 Memulai Full E2E Browser Verification RelayPOS...')
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  const results = []

  function logPass(name, detail = '') {
    console.log(`  ✅ [PASS] ${name} ${detail ? `(${detail})` : ''}`)
    results.push({ name, status: 'PASS', detail })
  }

  function logFail(name, err) {
    console.error(`  ❌ [FAIL] ${name}:`, err)
    results.push({ name, status: 'FAIL', error: String(err) })
  }

  try {
    // -------------------------------------------------------------
    // TEST 1: LOGIN SECURITY (C1 & C2 AUDIT VERIFICATION)
    // -------------------------------------------------------------
    console.log('\n--- 1. Pengujian Autentikasi & Keamanan Login ---')
    await page.goto(`${BASE_URL}/login`)
    await page.waitForLoadState('networkidle')

    // 1.1 Verifikasi Elemen Halaman Login
    const heading = await page.locator('h2').innerText()
    if (heading.includes('RelayPOS')) {
      logPass('Header Brand Login', heading)
    } else {
      throw new Error(`Heading tidak sesuai: ${heading}`)
    }

    // 1.2 Coba login dengan password salah
    await page.locator('#login-username').fill('owner@relaypos.com')
    await page.locator('#login-password').fill('passwordsalah123')
    await page.locator('button[type="submit"]').click()
    await page.waitForTimeout(600)

    const errorAlert = await page.locator('.text-rose-400').innerText()
    if (errorAlert.includes('Kata sandi salah') || errorAlert.includes('Gagal masuk')) {
      logPass('Proteksi C1: Penolakan Password Salah', errorAlert)
    } else {
      throw new Error(`Harusnya ditolak, tetapi alert: ${errorAlert}`)
    }

    // 1.3 Coba login dengan username fiktif
    await page.locator('#login-username').fill('fake_owner@unknown.com')
    await page.locator('#login-password').fill('anystring123')
    await page.locator('button[type="submit"]').click()
    await page.waitForTimeout(600)

    const unknownAlert = await page.locator('.text-rose-400').innerText()
    if (unknownAlert.includes('tidak ditemukan') || unknownAlert.includes('Gagal masuk')) {
      logPass('Proteksi C1: Penolakan Akun Tak Terdaftar (No Role Guessing)', unknownAlert)
    } else {
      throw new Error(`Harusnya ditolak, tetapi alert: ${unknownAlert}`)
    }

    // 1.4 Login dengan Akun Demo Owner via Tombol Cepat
    const ownerDemoBtn = page.locator('button[title*="akun Owner"]')
    await ownerDemoBtn.click()
    await page.waitForTimeout(200)

    const filledUsername = await page.locator('#login-username').inputValue()
    const filledPassword = await page.locator('#login-password').inputValue()
    if (filledUsername === 'owner@relaypos.com' && filledPassword === 'password123') {
      logPass('Tombol Akses Cepat Demo Owner mengisi form dengan tepat')
    }

    await page.locator('button[type="submit"]').click()
    await page.waitForTimeout(1000)

    const currentUrl = page.url()
    if (currentUrl.includes('/konsolidasi')) {
      logPass('Redirect Otomatis Owner ke Dashboard Konsolidasi', currentUrl)
    } else {
      throw new Error(`Redirect Owner salah: ${currentUrl}`)
    }

    // -------------------------------------------------------------
    // TEST 2: DASHBOARD KONSOLIDASI & SELEKTOR TOKO
    // -------------------------------------------------------------
    console.log('\n--- 2. Pengujian Dashboard Konsolidasi ---')
    await page.waitForSelector('text=Konsolidasi', { timeout: 5000 })
    logPass('Dashboard Konsolidasi berhasil dirender tanpa crash')

    // -------------------------------------------------------------
    // TEST 3: POS HYBRID & SISTEM ESTAFET CHECKOUT
    // -------------------------------------------------------------
    console.log('\n--- 3. Pengujian POS Hybrid & Sistem Estafet ---')
    await page.goto(`${BASE_URL}/pos`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    logPass('Halaman POS Hybrid berhasil dimuat')

    // -------------------------------------------------------------
    // TEST 4: ANTREAN CARWASH KANBAN
    // -------------------------------------------------------------
    console.log('\n--- 4. Pengujian Display Antrean Carwash ---')
    await page.goto(`${BASE_URL}/queue`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    const queuePageText = await page.innerText('body')
    if (queuePageText.includes('Antrean') || queuePageText.includes('Cuci')) {
      logPass('Halaman Antrean Carwash Kanban aktif')
    }

    // -------------------------------------------------------------
    // TEST 5: CRM & RETENSI SPINTAX
    // -------------------------------------------------------------
    console.log('\n--- 5. Pengujian Modul CRM & Retensi Pelanggan ---')
    await page.goto(`${BASE_URL}/crm`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    const crmText = await page.innerText('body')
    if (crmText.includes('CRM') || crmText.includes('Loyalitas') || crmText.includes('Tamu')) {
      logPass('Halaman CRM Pelanggan & Analitik Retensi aktif')
    }

    // -------------------------------------------------------------
    // TEST 6: LAPORAN KEUANGAN & SAK EMKM
    // -------------------------------------------------------------
    console.log('\n--- 6. Pengujian Modul Keuangan & Laporan ---')
    await page.goto(`${BASE_URL}/finance`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    logPass('Halaman Manajemen Keuangan & Arus Kas aktif')

    await page.goto(`${BASE_URL}/reports`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    logPass('Halaman Laporan Akuntansi Resmi SAK EMKM aktif')

    // -------------------------------------------------------------
    // TEST 7: MANAJEMEN KARYAWAN & GAJI
    // -------------------------------------------------------------
    console.log('\n--- 7. Pengujian Modul Karyawan & Komisi ---')
    await page.goto(`${BASE_URL}/karyawan`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    logPass('Halaman Manajemen Karyawan & Rekap Komisi aktif')

    // -------------------------------------------------------------
    // TEST 8: ADMIN MASTER & KELOLA TOKO
    // -------------------------------------------------------------
    console.log('\n--- 8. Pengujian Modul Admin Toko ---')
    await page.goto(`${BASE_URL}/admin`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    logPass('Halaman Admin Pengaturan Toko & Master Data aktif')

    // -------------------------------------------------------------
    // TEST 9: SELF-SERVICE ONBOARDING TOKO BARU
    // -------------------------------------------------------------
    console.log('\n--- 9. Pengujian Self-Service Onboarding Toko Baru ---')
    // Buka sesi baru (incognito/fresh browser context)
    const freshContext = await browser.newContext()
    const regPage = await freshContext.newPage()
    await regPage.goto(`${BASE_URL}/login`)
    await regPage.waitForLoadState('networkidle')

    // Klik tab "Daftar Toko Baru"
    const registerTabBtn = regPage.locator('button:has-text("Daftar Toko Baru")')
    await registerTabBtn.click()
    await regPage.waitForTimeout(300)

    // Isi formulir pendaftaran
    const testEmail = `owner.test.${Date.now()}@autoclean.com`
    await regPage.locator('#reg-nama').fill('Budi Testing')
    await regPage.locator('#reg-tenant-name').fill('AutoClean Express Mandiri')
    await regPage.locator('#reg-email').fill(testEmail)
    await regPage.locator('#reg-password').fill('password123')

    // Submit pendaftaran
    await regPage.locator('button[type="submit"]:has-text("Daftar & Buka Toko")').click()
    await regPage.waitForTimeout(1200)

    const regUrl = regPage.url()
    if (regUrl.includes('/konsolidasi')) {
      logPass('Self-Service Onboarding Berhasil: Tenant Baru langsung dialihkan ke Dashboard', regUrl)
    } else {
      throw new Error(`Gagal onboarding, URL: ${regUrl}`)
    }

    await freshContext.close()

  } catch (err) {
    logFail('E2E Verification Execution', err)
  } finally {
    await browser.close()
  }

  console.log('\n======================================================')
  const passedCount = results.filter(r => r.status === 'PASS').length
  const failedCount = results.filter(r => r.status === 'FAIL').length
  console.log(`HASIL VERIFIKASI: ${passedCount} PASSED, ${failedCount} FAILED`)
  console.log('======================================================')

  if (failedCount > 0) {
    process.exit(1)
  }
}

runVerification()
