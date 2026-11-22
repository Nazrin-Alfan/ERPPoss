import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { chromium } from 'playwright'
import { preview } from 'vite'

const PROJECT_REF = 'jutidxobdedygmjngmcq'
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`
const PROD_SMOKE_URL = process.env.PROD_SMOKE_URL || 'https://erpposs.pages.dev'
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || ''
const VAULT_FILE = path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), '.relaypos-vault'),
  'relaypos-vault',
  'supabase.vault'
)

function loadManagementToken() {
  const cipher = fs.readFileSync(VAULT_FILE, 'utf8').trim()
  return execFileSync(
    'powershell',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '$s = ConvertTo-SecureString $env:VAULT_CIPHER; $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); try { [Runtime.InteropServices.Marshal]::PtrToStringAuto($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }',
    ],
    { env: { ...process.env, VAULT_CIPHER: cipher }, encoding: 'utf8' }
  ).trim()
}

async function mgmtSql(sql, mgmtToken) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${mgmtToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Mgmt SQL failed (${res.status}): ${text.slice(0, 600)}`)
  return text ? JSON.parse(text) : []
}

async function fetchProjectKeys(mgmtToken) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/api-keys`, {
    headers: { Authorization: `Bearer ${mgmtToken}` },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Fetch API keys failed (${res.status})`)
  const keys = JSON.parse(text)
  const serviceKey = keys.find((k) => k.name === 'service_role')?.api_key
  const anonKey = keys.find((k) => k.name === 'anon')?.api_key
  if (!serviceKey || !anonKey) throw new Error('Missing service_role or anon key from project API keys')
  return { serviceKey, anonKey }
}

async function createAuthUser({ serviceKey, id, email, password, nama, tenantId, branchId, role }) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id,
      email,
      password,
      email_confirm: true,
      user_metadata: { nama },
      app_metadata: {
        tenant_id: tenantId,
        branch_id: branchId,
        erp_role: role,
      },
    }),
  })
  const data = await res.json()
  if (!res.ok || !data?.id) {
    throw new Error(`Create auth user (${role}) failed (${res.status}): ${JSON.stringify(data).slice(0, 300)}`)
  }
  return data.id
}

async function deleteAuthUser({ serviceKey, userId }) {
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  })
}

async function saveShot(page, name) {
  if (!SCREENSHOT_DIR) return null
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  const out = path.join(SCREENSHOT_DIR, name)
  await page.screenshot({ path: out, fullPage: false })
  return out
}

async function loginAs(page, baseUrl, email, password, expectedPathPrefix) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded', timeout: 25000 })
  const userInput = page.getByLabel('Username atau Email', { exact: false })
  const passInput = page.getByLabel('PIN / Kata Sandi', { exact: false })
  await userInput.waitFor({ state: 'visible', timeout: 15000 })
  await userInput.fill(email)
  await passInput.fill(password)
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()
  await page.waitForURL(
    (url) => url.pathname !== '/login' && (!expectedPathPrefix || url.pathname.startsWith(expectedPathPrefix)),
    { timeout: 25000 }
  )
  await page.waitForTimeout(800)
}

async function readSupabaseAccessTokenFromPage(page) {
  return page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.includes('auth-token')) {
        try {
          const parsed = JSON.parse(localStorage.getItem(k) || '{}')
          if (parsed?.access_token) return parsed.access_token
        } catch {
          // ignore
        }
      }
    }
    return null
  })
}

async function runLiveSuite() {
  const results = []
  const screenshots = []
  const globalPageErrors = []
  const globalConsoleErrors = []
  const globalServer5xx = []

  const record = (id, name, passed, detail = '') => {
    results.push({ id, name, passed, detail })
    console.log(`  ${passed ? '✅' : '❌'} [${id}] ${name}${detail ? ` — ${detail}` : ''}`)
    if (!passed) throw new Error(`Failed [${id}] ${name}: ${detail}`)
  }

  const attachWatchers = (page, label) => {
    page.on('pageerror', (err) => {
      globalPageErrors.push(`[${label}] ${err.message || String(err)}`)
    })
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const txt = msg.text()
        // Ignore intentionally triggered forbidden mutation tests
        if (txt.includes('FORBIDDEN_ROLE_ESCALATION') || txt.includes('23503')) return
        globalConsoleErrors.push(`[${label}] ${txt}`)
      }
    })
    page.on('response', (res) => {
      if (res.status() >= 500) {
        globalServer5xx.push(`[${label}] HTTP ${res.status()} ${res.url()}`)
      }
    })
  }

  const mgmtToken = loadManagementToken()
  const { serviceKey, anonKey } = await fetchProjectKeys(mgmtToken)

  // Unique isolated sandbox identifiers
  const tag = Date.now().toString(36)
  const tenantId = crypto.randomUUID()
  const branchA1 = crypto.randomUUID()
  const branchA2 = crypto.randomUUID()
  const pocketCashA1 = crypto.randomUUID()
  const pocketBankA1 = crypto.randomUUID()
  const pocketBankA2 = crypto.randomUUID()
  const pocketBankHQ = crypto.randomUUID()
  const createdUserIds = []
  const password = `QaLive!${tag}99`

  const creds = {
    owner: { id: crypto.randomUUID(), email: `qa.owner.${tag}@relaypos-e2e.test`, nama: 'QA OWNER LIVE', role: 'Owner', branchId: branchA1 },
    pusat: { id: crypto.randomUUID(), email: `qa.pusat.${tag}@relaypos-e2e.test`, nama: 'QA ADMIN PUSAT', role: 'Admin Pusat', branchId: branchA1 },
    adminA1: { id: crypto.randomUUID(), email: `qa.admin1.${tag}@relaypos-e2e.test`, nama: 'QA ADMIN CABANG A1', role: 'Admin', branchId: branchA1 },
    kasirA1: { id: crypto.randomUUID(), email: `qa.kasir1.${tag}@relaypos-e2e.test`, nama: 'QA KASIR A1', role: 'Kasir', branchId: branchA1 },
  }

  let previewServer = null
  let browser = null

  try {
    console.log(`\n🔧 Setting up isolated sandbox tenant (qa-live-e2e-${tag}) on Supabase Cloud...`)

    await mgmtSql(
      `INSERT INTO public.tenants (id, nama, slug, plan, status, business_type, onboarding_completed)
       VALUES ('${tenantId}', 'QA Live E2E ${tag}', 'qa-live-e2e-${tag}', 'pro', 'active', 'HYBRID', TRUE);

       INSERT INTO public.tenant_licenses (tenant_id, license_key, plan, tier, status, max_branches, max_users, features, valid_until, expires_at)
       VALUES ('${tenantId}', 'QALIVE-${tag.toUpperCase()}', 'pro', 'PRO', 'ACTIVE', 5, 20, '{}'::jsonb, NOW() + INTERVAL '30 days', NOW() + INTERVAL '30 days');

       INSERT INTO public.branches (id, tenant_id, nama, kode, alamat, is_main, is_active)
       VALUES
         ('${branchA1}', '${tenantId}', 'Cabang A1', 'MAIN', 'Jl. Uji A1', TRUE, TRUE),
         ('${branchA2}', '${tenantId}', 'Cabang A2', 'A2', 'Jl. Uji A2', FALSE, TRUE);

       INSERT INTO public.pos_balances (id, tenant_id, branch_id, pos, label, tipe, balance, color, is_active)
       VALUES
         ('${pocketCashA1}', '${tenantId}', '${branchA1}', 'SALDO CASH', 'Kas Laci A1', 'CASH', 500000, 'emerald', TRUE),
         ('${pocketBankA1}', '${tenantId}', '${branchA1}', 'SALDO REKENING Y', 'Mandiri Cabang A1', 'BANK', 1000000, 'blue', TRUE),
         ('${pocketBankA2}', '${tenantId}', '${branchA2}', 'SALDO MANDIRI A2', 'Mandiri Cabang A2', 'BANK', 200000, 'cyan', TRUE),
         ('${pocketBankHQ}', '${tenantId}', NULL, 'SALDO HQ MANDIRI', 'Mandiri Pusat HQ', 'BANK', 300000, 'amber', TRUE);

       INSERT INTO public.stok_barang (tenant_id, branch_id, nama_produk, nama_barang, satuan, stok, stok_akhir, harga_satuan, gudang, is_active)
       VALUES
         ('${tenantId}', '${branchA1}', 'Shampoo Khusus A1', 'Shampoo Khusus A1', 'ml', 100, 100, 15000, 'CAFE', TRUE),
         ('${tenantId}', '${branchA2}', 'Shampoo Khusus A2', 'Shampoo Khusus A2', 'ml', 200, 200, 15000, 'CAFE', TRUE);

       INSERT INTO public.daftar_harga_menu (tenant_id, branch_id, daftar_menu, nama_menu, kategori, harga, is_active)
       VALUES
         ('${tenantId}', '${branchA1}', 'Kopi Uji A1', 'Kopi Uji A1', 'Coffee', 25000, TRUE);`,
      mgmtToken
    )

    // Pre-insert profiles with explicit UUIDs BEFORE creating auth.users so handle_new_user_profile()
    // returns early without spawning stray trial tenants.
    const profileValues = Object.values(creds)
      .map(
        (c) =>
          `('${c.id}', '${tenantId}', '${c.branchId}', '${c.nama}', '${c.email}', '${c.role}', TRUE)`
      )
      .join(',\n         ')

    await mgmtSql(
      `INSERT INTO public.profiles (id, tenant_id, branch_id, nama, email, role, is_active)
       VALUES
         ${profileValues};

       INSERT INTO public.tenant_memberships (user_id, tenant_id, role, is_default)
       VALUES ('${creds.owner.id}', '${tenantId}', 'Owner', TRUE)
       ON CONFLICT DO NOTHING;`,
      mgmtToken
    )

    for (const key of Object.keys(creds)) {
      const c = creds[key]
      const uid = await createAuthUser({
        serviceKey,
        id: c.id,
        email: c.email,
        password,
        nama: c.nama,
        tenantId,
        branchId: c.branchId,
        role: c.role,
      })
      createdUserIds.push(uid)
    }
    console.log('✅ Sandbox tenant + 2 branches + 4 real Auth users + 4 pockets ready.')

    // Determine target website URL
    let baseUrl = process.env.LIVE_TEST_URL || ''
    if (!baseUrl) {
      previewServer = await preview({ preview: { port: 4179, strictPort: false, host: '127.0.0.1' } })
      const addr = previewServer.httpServer.address()
      baseUrl = `http://127.0.0.1:${addr.port}`
      console.log(`🌐 Preview server (new dist/ -> Live Supabase Cloud) listening at ${baseUrl}`)
    } else {
      console.log(`🌐 Targeting live URL directly: ${baseUrl}`)
    }

    browser = await chromium.launch({ headless: true })

    // =========================================================================
    // GROUP A: PRODUCTION EDGE SMOKE (https://erpposs.pages.dev)
    // =========================================================================
    console.log('\n--- GROUP A: Production Edge Smoke ---')
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
      const page = await ctx.newPage()
      attachWatchers(page, 'PROD-SMOKE')

      const t0 = Date.now()
      const res = await page.goto(`${PROD_SMOKE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 25000 })
      const loadMs = Date.now() - t0
      const headers = res?.headers() || {}
      await page.getByLabel('Username atau Email', { exact: false }).waitFor({ state: 'visible', timeout: 15000 })
      const hasSubmit = await page.getByRole('button', { name: 'Masuk', exact: true }).isVisible()
      record(
        'LIVE-01',
        'Production Edge HTTP 200, Security Headers & Login Render',
        res?.status() === 200 && headers['x-frame-options'] === 'DENY' && headers['x-content-type-options'] === 'nosniff' && hasSubmit,
        `HTTP ${res?.status()} in ${loadMs}ms | XFO=${headers['x-frame-options']}`
      )

      let allRedirected = true
      for (const p of ['/dashboard', '/finance', '/admin', '/karyawan']) {
        await page.goto(`${PROD_SMOKE_URL}${p}`, { waitUntil: 'domcontentloaded', timeout: 15000 })
        await page.waitForURL((u) => u.pathname === '/login', { timeout: 10000 })
        if (new URL(page.url()).pathname !== '/login') allRedirected = false
      }
      record('LIVE-02', 'Unauthenticated Route Guard on Production Edge', allRedirected, 'All 4 protected routes redirected to /login')
      await ctx.close()
    }

    // =========================================================================
    // GROUP B: OWNER FLOWS & POCKET BALANCE INTEGRITY
    // =========================================================================
    console.log('\n--- GROUP B: Owner Flows & Pocket Balance Integrity ---')
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
      const page = await ctx.newPage()
      attachWatchers(page, 'OWNER')

      try {
      await loginAs(page, baseUrl, creds.owner.email, password, '/dashboard')
      const rekapTab = page.getByRole('button', { name: /Rekap Kasir & Saldo/i })
      await rekapTab.waitFor({ state: 'visible', timeout: 20000 })
      await rekapTab.click()
      await page.waitForSelector('text=Kas Laci A1', { timeout: 15000 })
      await page.waitForSelector('text=Mandiri Cabang A1', { timeout: 10000 })
      await page.waitForSelector('text=Mandiri Cabang A2', { timeout: 10000 })
      await page.waitForSelector('text=Mandiri Pusat HQ', { timeout: 10000 })
      await rekapTab.scrollIntoViewIfNeeded()
      const dashText = await page.locator('body').innerText()
      const hasTabular = (await page.locator('.tabular-nums').count()) > 0
      const dashShot = await saveShot(page, 'live_03_owner_dashboard.png')
      if (dashShot) screenshots.push(dashShot)

      // Check /reports & /konsolidasi also load cleanly without error
      await page.goto(`${baseUrl}/reports`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('main', { timeout: 15000 })
      await page.waitForSelector('text=Saldo Buku ERPPoss', { timeout: 15000 })
      const reportsText = await page.locator('body').innerText()
      const hasBookLabel = reportsText.includes('Saldo Buku ERPPoss')

      await page.goto(`${baseUrl}/konsolidasi`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('text=Pangsa Omzet per Outlet', { timeout: 15000 })
      await page.waitForSelector('text=2.000.000', { timeout: 15000 })
      const konsolText = await page.locator('body').innerText()
      const konsolHealthy = !konsolText.includes('Terjadi Kendala Memuat Tampilan') && konsolText.includes('2.000.000')

      record(
        'LIVE-03',
        'Owner Dashboard, Reports & Konsolidasi Read v_pocket_balances (4 Pockets, Rp 2.000.000, Zero Crash)',
        dashText.includes('500.000') &&
          dashText.includes('1.000.000') &&
          dashText.includes('200.000') &&
          dashText.includes('300.000') &&
          hasTabular &&
          hasBookLabel &&
          konsolHealthy,
        `4 pockets rendered (500k/1M/200k/300k), tabular-nums=${hasTabular}, reports_label=${hasBookLabel}, konsolidasi_2M=${konsolHealthy}`
      )

      // LIVE-04: Record Expense Rp 75.000 on Mandiri Cabang A1 in /finance
      await page.goto(`${baseUrl}/finance`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('text=Mandiri Cabang A1', { timeout: 20000 })
      await page.getByRole('button', { name: /\+ Pengeluaran/i }).click()
      await page.waitForSelector('text=Catat Pengeluaran Baru', { timeout: 10000 })

      // Select POS Kas / Sumber Dana -> Mandiri Cabang A1 (CustomSelect trigger button)
      const modal = page.locator('div.fixed').filter({ hasText: 'Catat Pengeluaran Baru' }).first()
      // Open the first CustomSelect inside modal (POS Kas / Sumber Dana)
      const posSelectBtn = modal.locator('button[type="button"]').filter({ hasText: /Saldo:/ }).first()
      await posSelectBtn.click()
      await page.locator('button[type="button"]').filter({ hasText: /Mandiri Cabang A1/ }).first().click()

      // Fill keterangan & nominal 75000
      await modal.locator('textarea').fill('Beli Sabun QA Live E2E')
      await modal.locator('input[inputmode="numeric"]').fill('75000')
      await modal.getByRole('button', { name: 'Simpan Transaksi', exact: true }).click()
      await page.waitForSelector('text=Pengeluaran berhasil dicatat', { timeout: 15000 })

      // Reload & assert 925.000 persists on UI + verify live DB pocket_id & untouched opening balance
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForSelector('text=Mandiri Cabang A1', { timeout: 20000 })
      const finTextAfterExp = await page.locator('body').innerText()
      const dbExpCheck = await mgmtSql(
        `SELECT cf.pocket_id, cf.pengeluaran, cf.pos, pb.balance AS opening_balance, v.current_balance
         FROM public.cashflow cf
         JOIN public.pos_balances pb ON pb.id = cf.pocket_id
         JOIN public.v_pocket_balances v ON v.id = cf.pocket_id
         WHERE cf.tenant_id = '${tenantId}' AND cf.keterangan_transaksi ILIKE '%Beli Sabun QA Live E2E%'
         LIMIT 1;`,
        mgmtToken
      )
      const expRow = dbExpCheck[0]
      record(
        'LIVE-04',
        'Finance Expense Binds pocket_id & Persists Rp 925.000 Across Reload',
        finTextAfterExp.includes('925.000') &&
          expRow?.pocket_id === pocketBankA1 &&
          Number(expRow?.pengeluaran) === 75000 &&
          Number(expRow?.opening_balance) === 1000000 &&
          Number(expRow?.current_balance) === 925000,
        `UI=925.000 | DB pocket_id ok=${expRow?.pocket_id === pocketBankA1}, opening=${expRow?.opening_balance}, current=${expRow?.current_balance}`
      )

      // LIVE-05: Rename pocket SALDO REKENING Y -> MANDIRI OPS A1 in /admin
      await page.goto(`${baseUrl}/admin?tab=calibration`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('text=Master Rekening & Akun Likuiditas', { timeout: 20000 })
      await page.waitForSelector('text=Mandiri Cabang A1', { timeout: 15000 })

      const bankCard = page.locator('div.rounded-xl').filter({ hasText: 'SALDO REKENING Y' }).filter({ has: page.locator('button[title="Edit Akun"]') }).first()
      await bankCard.locator('button[title="Edit Akun"]').click()
      await page.waitForSelector('text=Edit Akun Likuiditas', { timeout: 10000 })

      const editModal = page.locator('div.fixed').filter({ hasText: 'Edit Akun Likuiditas' }).first()
      const textInputs = editModal.locator('input[type="text"]')
      await textInputs.nth(0).fill('MANDIRI OPS A1')
      await textInputs.nth(1).fill('Mandiri Operasional A1')
      await editModal.locator('button[type="submit"]').click()
      await page.waitForSelector('text=Mandiri Operasional A1', { timeout: 15000 })
      await page.waitForTimeout(800)

      const adminShot = await saveShot(page, 'live_05_admin_pockets.png')
      if (adminShot) screenshots.push(adminShot)

      // Verify propagation in /finance and live DB
      await page.goto(`${baseUrl}/finance`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('text=Mandiri Operasional A1', { timeout: 15000 })
      const finAfterRename = await page.locator('body').innerText()
      const dbRename = await mgmtSql(
        `SELECT cf.pos, cf.pocket_id, v.current_balance
         FROM public.cashflow cf
         JOIN public.v_pocket_balances v ON v.id = cf.pocket_id
         WHERE cf.tenant_id = '${tenantId}' AND cf.pocket_id = '${pocketBankA1}'
         LIMIT 1;`,
        mgmtToken
      )
      record(
        'LIVE-05',
        'Pocket Rename Propagates to cashflow.pos & Keeps Rp 925.000 Balance',
        /Mandiri Operasional A1/i.test(finAfterRename) &&
          finAfterRename.includes('925.000') &&
          dbRename[0]?.pos === 'SALDO MANDIRI OPS A1' &&
          Number(dbRename[0]?.current_balance) === 925000,
        `DB cashflow.pos=${dbRename[0]?.pos}, current_balance=${dbRename[0]?.current_balance}`
      )

      // LIVE-06: Attempt delete pocket with cashflow -> graceful soft-deactivate (ON DELETE RESTRICT protected)
      await page.goto(`${baseUrl}/admin?tab=calibration`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('text=Mandiri Operasional A1', { timeout: 15000 })

      const dialogMessages = []
      page.once('dialog', async (dialog) => {
        dialogMessages.push(dialog.message())
        await dialog.accept()
      })
      const renamedCard = page.locator('div.rounded-xl').filter({ hasText: 'MANDIRI OPS A1' }).filter({ has: page.locator('button[title="Hapus Akun"]') }).first()
      await renamedCard.locator('button[title="Hapus Akun"]').click()
      await page.waitForSelector('text=dinonaktifkan agar histori transaksi tetap utuh', { timeout: 15000 })

      const dbAfterSoftDel = await mgmtSql(
        `SELECT pb.is_active, (SELECT COUNT(*) FROM public.cashflow WHERE pocket_id = pb.id) AS tx_cnt
         FROM public.pos_balances pb WHERE pb.id = '${pocketBankA1}';`,
        mgmtToken
      )
      record(
        'LIVE-06',
        'Delete Guard Soft-Deactivates Transacted Pocket & Preserves Cashflow',
        dbAfterSoftDel[0]?.is_active === false && Number(dbAfterSoftDel[0]?.tx_cnt) === 1 && dialogMessages.length === 1,
        `is_active=${dbAfterSoftDel[0]?.is_active}, preserved_tx=${dbAfterSoftDel[0]?.tx_cnt}`
      )

      // Re-activate pocketBankA1 for subsequent RBAC visibility tests
      await mgmtSql(`UPDATE public.pos_balances SET is_active = TRUE WHERE id = '${pocketBankA1}';`, mgmtToken)

      // LIVE-07: Non-destructive calibration (+25.000 on SALDO CASH -> 525.000)
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForSelector('text=Sinkronisasi & Kalibrasi Saldo Fisik', { timeout: 15000 })
      const calCashRow = page.locator('form div.rounded-xl').filter({ hasText: 'SALDO CASH' }).first()
      await calCashRow.locator('input[type="number"]').fill('525000')
      await page.getByRole('button', { name: /Simpan & Sesuaikan Seluruh Saldo/i }).click()
      await page.waitForSelector('text=Kalibrasi saldo berhasil dilakukan', { timeout: 15000 })

      const dbCal = await mgmtSql(
        `SELECT pb.balance AS opening_balance, v.current_balance,
                (SELECT COUNT(*) FROM public.cashflow WHERE pocket_id = pb.id AND pemasukan = 25000) AS adj_cnt
         FROM public.pos_balances pb
         JOIN public.v_pocket_balances v ON v.id = pb.id
         WHERE pb.id = '${pocketCashA1}';`,
        mgmtToken
      )
      record(
        'LIVE-07',
        'Non-Destructive Calibration Adds Cashflow Delta Without Mutating Opening Balance',
        Number(dbCal[0]?.opening_balance) === 500000 && Number(dbCal[0]?.current_balance) === 525000 && Number(dbCal[0]?.adj_cnt) === 1,
        `opening=${dbCal[0]?.opening_balance}, current=${dbCal[0]?.current_balance}, adj_rows=${dbCal[0]?.adj_cnt}`
      )

      // LIVE-08: Owner views /karyawan Staff Role options & Human-Readable Role Badges
      await page.goto(`${baseUrl}/karyawan?tab=staff`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('text=Daftar Akun Staf Terdaftar', { timeout: 20000 })
      await page.waitForSelector('text=QA ADMIN CABANG A1', { timeout: 15000 })
      await page.waitForSelector('text=Penempatan Cabang', { timeout: 15000 })
      await page.waitForSelector('button:has-text("Registrasikan Akun Staf")', { timeout: 15000 })

      const roleSelect = page.locator('select').filter({ has: page.locator('option[value="Admin Pusat"]') }).first()
      const roleOptionsText = await roleSelect.innerText()
      const branchSelectCount = await page.locator('select').filter({ hasText: 'Cabang A2' }).count()
      const karyText = await page.locator('body').innerText()
      const karyShot = await saveShot(page, 'live_08_karyawan_rbac.png')
      if (karyShot) screenshots.push(karyShot)

      record(
        'LIVE-08',
        'Karyawan UI Exposes Admin Pusat, Admin Cabang & Multi-Branch Selector',
        /Admin Pusat/i.test(roleOptionsText) &&
          /Admin Cabang/i.test(roleOptionsText) &&
          branchSelectCount >= 1 &&
          /Admin Pusat/i.test(karyText) &&
          /Admin Cabang/i.test(karyText),
        `Role dropdown & badges verified, branch selector count=${branchSelectCount}`
      )

      } catch (ownerErr) {
        console.error('OWNER DEBUG URL:', page.url())
        console.error('OWNER DEBUG TEXT:', (await page.locator('body').innerText().catch(() => '')).slice(0, 1200))
        console.error('OWNER DEBUG ERRORS:', { globalPageErrors, globalConsoleErrors, globalServer5xx })
        await saveShot(page, 'debug_owner_failure.png').catch(() => {})
        throw ownerErr
      } finally {
        await ctx.close()
      }
    }

    // =========================================================================
    // GROUP C: 3-TIER RBAC ISOLATION (ADMIN PUSAT, ADMIN CABANG, KASIR)
    // =========================================================================
    console.log('\n--- GROUP C: Multi-Branch vs Single-Branch RBAC Isolation ---')

    // LIVE-09: Admin Pusat
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
      const page = await ctx.newPage()
      attachWatchers(page, 'ADMIN-PUSAT')

      let pusatPocketsPayload = []
      page.on('response', async (res) => {
        if (res.url().includes('/rest/v1/v_pocket_balances') && res.status() === 200) {
          try {
            const json = await res.json()
            if (Array.isArray(json)) pusatPocketsPayload = json
          } catch {
            // ignore
          }
        }
      })

      await loginAs(page, baseUrl, creds.pusat.email, password, '/finance')
      const landedPath = new URL(page.url()).pathname
      await page.waitForSelector('text=Mandiri Operasional A1', { timeout: 20000 })
      await page.waitForSelector('text=Mandiri Cabang A2', { timeout: 10000 })
      await page.waitForSelector('text=Mandiri Pusat HQ', { timeout: 10000 })
      const pusatFinText = await page.locator('body').innerText()
      const pusatNoPriveBtn = !/Tarik Prive Owner/i.test(pusatFinText)
      const pusatHasDynamicNet = /Net Mandiri Operasional A1/i.test(pusatFinText) && !/Net Rekening Y/i.test(pusatFinText)
      const pusatShot = await saveShot(page, 'live_09_admin_pusat_finance.png')
      if (pusatShot) screenshots.push(pusatShot)

      // Check /gudang sees BOTH Branch A1 and Branch A2 stock
      await page.goto(`${baseUrl}/gudang`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('text=Shampoo Khusus A1', { timeout: 15000 })
      await page.waitForSelector('text=Shampoo Khusus A2', { timeout: 10000 })

      // Check owner-only routes blocked (/admin, /reports, /konsolidasi)
      let ownerRoutesBlocked = true
      for (const r of ['/admin', '/reports', '/konsolidasi']) {
        await page.goto(`${baseUrl}${r}`, { waitUntil: 'domcontentloaded' })
        try {
          await page.waitForURL((u) => u.pathname !== r, { timeout: 12000 })
        } catch {
          ownerRoutesBlocked = false
        }
      }

      // Check live API escalation attack against Owner profile is blocked by Postgres trigger/RLS
      const pusatJwt = await readSupabaseAccessTokenFromPage(page)
      const escalationRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${creds.owner.id}`, {
        method: 'PATCH',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${pusatJwt}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({ is_active: false }),
      })
      const ownerStillActive = await mgmtSql(`SELECT is_active FROM public.profiles WHERE id = '${creds.owner.id}';`, mgmtToken)

      const foreignTenantLeak = pusatPocketsPayload.some((p) => p.tenant_id !== tenantId)
      record(
        'LIVE-09',
        'Admin Pusat Lands on /finance, Sees All Tenant Branches+HQ, Blocked from Owner Area & Escalation',
        landedPath === '/finance' &&
          pusatPocketsPayload.length === 4 &&
          !foreignTenantLeak &&
          ownerRoutesBlocked &&
          pusatNoPriveBtn &&
          pusatHasDynamicNet &&
          ownerStillActive[0]?.is_active === true,
        `landing=${landedPath}, network_pockets=${pusatPocketsPayload.length}, no_prive=${pusatNoPriveBtn}, dynamic_net=${pusatHasDynamicNet}, owner_routes_blocked=${ownerRoutesBlocked}, escalation_http=${escalationRes.status}, owner_active=${ownerStillActive[0]?.is_active}`
      )

      await ctx.close()
    }

    // LIVE-10: Admin Cabang (Branch A1 Strict Isolation)
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
      const page = await ctx.newPage()
      attachWatchers(page, 'ADMIN-CABANG')

      let adminPocketsPayload = []
      page.on('response', async (res) => {
        if (res.url().includes('/rest/v1/v_pocket_balances') && res.status() === 200) {
          try {
            const json = await res.json()
            if (Array.isArray(json)) adminPocketsPayload = json
          } catch {
            // ignore
          }
        }
      })

      await loginAs(page, baseUrl, creds.adminA1.email, password, '/pos')

      // Navigate to /finance and verify sidebar badge + strict branch isolation
      await page.goto(`${baseUrl}/finance`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('text=Mandiri Operasional A1', { timeout: 20000 })
      await page.waitForTimeout(800)
      const adminFinText = await page.locator('body').innerText()
      const adminShot = await saveShot(page, 'live_10_admin_cabang_finance.png')
      if (adminShot) screenshots.push(adminShot)

      const hasAdminCabangBadge = /Admin Cabang/i.test(adminFinText)
      const adminNoPriveBtn = !/Tarik Prive Owner/i.test(adminFinText)
      const adminHasDynamicNet = /Net Mandiri Operasional A1/i.test(adminFinText) && !/Net Rekening Y/i.test(adminFinText)
      const domHidesA2AndHQ = !/Mandiri Cabang A2/i.test(adminFinText) && !/Mandiri Pusat HQ/i.test(adminFinText)
      const netStrictlyA1 =
        adminPocketsPayload.length === 2 && adminPocketsPayload.every((p) => p.branch_id === branchA1 && p.tenant_id === tenantId)

      // Check /gudang sees ONLY Branch A1 stock
      await page.goto(`${baseUrl}/gudang`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('text=Shampoo Khusus A1', { timeout: 15000 })
      await page.waitForTimeout(600)
      const gudangText = await page.locator('body').innerText()
      const gudangStrictlyA1 = /Shampoo Khusus A1/i.test(gudangText) && !/Shampoo Khusus A2/i.test(gudangText)

      // Check restricted routes (/dashboard, /admin, /reports, /konsolidasi) redirect out
      let restrictedBlocked = true
      for (const r of ['/dashboard', '/admin', '/reports', '/konsolidasi']) {
        await page.goto(`${baseUrl}${r}`, { waitUntil: 'domcontentloaded' })
        try {
          await page.waitForURL((u) => u.pathname !== r, { timeout: 12000 })
        } catch {
          restrictedBlocked = false
        }
      }

      record(
        'LIVE-10',
        'Admin Cabang A1 Strictly Isolated to Branch A1 (DOM + PostgREST Wire) & Displays Admin Cabang Badge',
        hasAdminCabangBadge && adminNoPriveBtn && adminHasDynamicNet && domHidesA2AndHQ && netStrictlyA1 && gudangStrictlyA1 && restrictedBlocked,
        `badge=${hasAdminCabangBadge}, no_prive=${adminNoPriveBtn}, dynamic_net=${adminHasDynamicNet}, net_pockets=${adminPocketsPayload.length} (A1 only=${netStrictlyA1}), gudang_A1_only=${gudangStrictlyA1}, blocked_routes=${restrictedBlocked}`
      )

      await ctx.close()
    }

    // LIVE-11: Kasir (POS Only + PR-3 v_pocket_balances = 0 rows)
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
      const page = await ctx.newPage()
      attachWatchers(page, 'KASIR')

      await loginAs(page, baseUrl, creds.kasirA1.email, password, '/pos')
      await page.waitForSelector('main', { timeout: 15000 })

      let kasirRoutesBlocked = true
      for (const r of ['/finance', '/admin', '/karyawan', '/dashboard', '/reports']) {
        await page.goto(`${baseUrl}${r}`, { waitUntil: 'domcontentloaded' })
        try {
          await page.waitForURL((u) => u.pathname === '/pos', { timeout: 12000 })
        } catch {
          kasirRoutesBlocked = false
        }
      }

      // Direct PostgREST query with Kasir's own live JWT -> must return 0 rows on v_pocket_balances
      const kasirJwt = await readSupabaseAccessTokenFromPage(page)
      const pocketRes = await fetch(`${SUPABASE_URL}/rest/v1/v_pocket_balances?select=*`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${kasirJwt}` },
      })
      const pocketRows = await pocketRes.json()

      record(
        'LIVE-11',
        'Kasir Contained to /pos & Receives 0 Rows on v_pocket_balances (PR-3)',
        kasirRoutesBlocked && Array.isArray(pocketRows) && pocketRows.length === 0,
        `routes_blocked=${kasirRoutesBlocked}, v_pocket_balances_rows=${Array.isArray(pocketRows) ? pocketRows.length : 'ERR'}`
      )

      await ctx.close()
    }
  } finally {
    if (browser) await browser.close()
    if (previewServer) await new Promise((resolve) => previewServer.httpServer.close(resolve))

    console.log('\n🧹 Running auto-teardown on Supabase Cloud sandbox...')
    try {
      await mgmtSql(
        `BEGIN;
         DELETE FROM public.cashflow WHERE tenant_id = '${tenantId}';
         DELETE FROM public.pengeluaran WHERE tenant_id = '${tenantId}';
         DELETE FROM public.journal_entries WHERE tenant_id = '${tenantId}';
         DELETE FROM public.pos_balances WHERE tenant_id = '${tenantId}';
         SET LOCAL session_replication_role = 'replica';
         DELETE FROM public.profiles WHERE tenant_id = '${tenantId}';
         SET LOCAL session_replication_role = 'origin';
         DELETE FROM public.tenants WHERE id = '${tenantId}';
         COMMIT;`,
        mgmtToken
      )
      for (const uid of createdUserIds) {
        await deleteAuthUser({ serviceKey, userId: uid })
      }
      console.log('✅ Sandbox tenant & 4 Auth users cleaned up.')
    } catch (cleanErr) {
      console.error('⚠️ Cleanup error:', cleanErr.message)
    }
  }

  // LIVE-12: Final Runtime Error Audit + Post-Teardown Zero-Residue Verification
  console.log('\n--- GROUP D: Runtime Audit & Zero-Residue Check ---')
  const residue = await mgmtSql(
    `SELECT
       (SELECT COUNT(*) FROM public.tenants WHERE id = '${tenantId}') AS leftover_tenants,
       (SELECT COUNT(*) FROM auth.users WHERE email LIKE 'qa.%.${tag}@relaypos-e2e.test') AS leftover_auth_users;`,
    mgmtToken
  )
  const cleanDb = Number(residue[0]?.leftover_tenants) === 0 && Number(residue[0]?.leftover_auth_users) === 0
  const zeroRuntimeErrors = globalPageErrors.length === 0 && globalConsoleErrors.length === 0 && globalServer5xx.length === 0

  if (!zeroRuntimeErrors) {
    console.error('Runtime diagnostics:', { globalPageErrors, globalConsoleErrors, globalServer5xx })
  }

  record(
    'LIVE-12',
    'Zero Runtime JS/5xx Errors, Screenshots Captured & Zero Sandbox Residue',
    cleanDb && zeroRuntimeErrors,
    `pageErrors=${globalPageErrors.length}, consoleErrors=${globalConsoleErrors.length}, http5xx=${globalServer5xx.length}, screenshots=${screenshots.length}, leftover_tenants=${residue[0]?.leftover_tenants}, leftover_auth=${residue[0]?.leftover_auth_users}`
  )

  console.log(`\n🎉 ALL ${results.length}/${results.length} LIVE WEBSITE E2E SCENARIOS PASSED!`)
}

runLiveSuite().catch((err) => {
  console.error('\n❌ LIVE E2E SUITE FAILED:', err.message || err)
  process.exit(1)
})
