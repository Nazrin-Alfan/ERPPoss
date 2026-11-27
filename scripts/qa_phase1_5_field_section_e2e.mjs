import { chromium } from 'playwright';
import { createServer, preview } from 'vite';

/**
 * PHASE 1.5 PLAYWRIGHT FIELD, SECTION & MODAL DOM GATE
 *
 * Verifies real rendered headings, tabs, inputs, action triggers, and print/tabular
 * invariants across 14 live browser routes (4 public/auth + 10 Owner ERP routes)
 * with ZERO waitForTimeout calls.
 */
async function runPhase15FieldSectionE2E() {
  const usePreview = process.env.USE_DIST_PREVIEW === 'true';
  console.log(`Starting Vite ${usePreview ? 'Preview (dist)' : 'Dev'} Server for Phase 1.5 Field/Section E2E...`);

  let closeServer;
  let port;
  if (usePreview) {
    const srv = await preview({ preview: { host: '127.0.0.1', port: 4181, strictPort: false } });
    port = srv.httpServer.address().port;
    closeServer = () => new Promise((resolve) => srv.httpServer.close(resolve));
  } else {
    const srv = await createServer({
      server: { host: '127.0.0.1', port: 4181, strictPort: false },
      logLevel: 'error',
    });
    await srv.listen();
    port = srv.httpServer.address().port;
    closeServer = () => srv.close();
  }

  const baseURL = `http://127.0.0.1:${port}`;
  console.log(`Vite Server listening at ${baseURL}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    if (!window.localStorage.getItem('relaypos_real_auth_v2')) {
      window.localStorage.setItem('relaypos_real_auth_v2', 'null');
    }
  });

  const page = await context.newPage();
  const pageErrors = [];
  const unexpectedConsoleErrors = [];

  page.on('pageerror', (err) => {
    pageErrors.push(err.message || String(err));
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      unexpectedConsoleErrors.push(msg.text());
    }
  });

  const results = [];
  const record = (id, name, passed, detail = '') => {
    results.push({ id, name, passed, detail });
    console.log(`  ${passed ? 'PASS' : 'FAIL'} [${id}] ${name}${detail ? ` — ${detail}` : ''}`);
    if (!passed) {
      throw new Error(`Phase 1.5 E2E failure in ${id}: ${name} (${detail})`);
    }
  };

  const navigateRoute = async (routePath) => {
    await page.goto(`${baseURL}${routePath}`, { waitUntil: 'domcontentloaded' });
    await page.locator('main, [role="main"], body').first().waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForFunction(
      () => {
        const text = (document.body.innerText || '').trim();
        return text.length > 50 && !text.includes('MEMUAT HALAMAN');
      },
      null,
      { timeout: 15000 }
    );
    await page.locator('main h1, h1, h2').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  };

  const assertVisibleLabels = async (patterns, minRequired = 1) => {
    let matched = 0;
    const found = [];
    for (const pat of patterns) {
      const loc = page.getByText(pat).first();
      if (await loc.isVisible().catch(() => false)) {
        matched++;
        found.push(pat instanceof RegExp ? pat.source : pat);
      }
    }
    return { ok: matched >= minRequired, matched, found };
  };

  try {
    // =========================================================================
    // PART A: 4 PUBLIC & AUTH ROUTES
    // =========================================================================
    await navigateRoute('/welcome');
    const welcomeLinks = await page.locator('a[href*="/login"], a[href*="/panduan"]').count();
    record('P15-01', '/welcome CTA links & showcase rendered', welcomeLinks >= 2, `links=${welcomeLinks}`);

    await navigateRoute('/panduan');
    const panduanInput = await page.locator('input').count();
    const panduanChapters = await assertVisibleLabels([/Bab 1/i, /Semua Peran/i], 2);
    record('P15-02', '/panduan search input, role filter & chapters', panduanInput >= 1 && panduanChapters.ok, `inputs=${panduanInput}`);

    await navigateRoute('/forgot-password');
    const fpInput = await page.locator('input[type="email"], input').count();
    const fpBack = await page.locator('a[href="/login"]').count();
    record('P15-03', '/forgot-password email input & /login link', fpInput >= 1 && fpBack >= 1, `inputs=${fpInput}`);

    await navigateRoute('/login');
    const usernameInput = page.getByLabel('Username atau Email', { exact: false });
    const passwordInput = page.getByLabel('PIN / Kata Sandi', { exact: false });
    await usernameInput.waitFor({ state: 'visible', timeout: 15000 });
    const regToggle = await assertVisibleLabels([/Daftar/i, /Masuk/i], 2);
    record('P15-04', '/login auth inputs, tabs & labels', regToggle.ok, regToggle.found.join(','));

    // Authenticate as Owner in local engine
    await usernameInput.fill('owner');
    await passwordInput.fill('password123');
    await page.getByRole('button', { name: /^(Masuk|Masuk ke Sistem)$/i }).click();
    await page.waitForURL((url) => url.pathname === '/dashboard' || url.pathname === '/konsolidasi', { timeout: 15000 });

    // =========================================================================
    // PART B: 10 OWNER OPERATIONAL & ERP ROUTES
    // =========================================================================
    await navigateRoute('/dashboard');
    const dashTabs = await assertVisibleLabels([/Semua/i, /Cafe/i, /Carwash/i], 2);
    const dashNums = await page.locator('.font-mono, .tabular-nums').count();
    record('P15-05', '/dashboard division tabs & KPI tabular numerals', dashTabs.ok && dashNums > 0, `nums=${dashNums}`);

    await navigateRoute('/ai-studio');
    const studioCheck = await assertVisibleLabels([/AI Data Studio/i, /Blok Data Mandiri/i, /Pratinjau Blok Data/i], 2);
    const studioControls = await page.locator('button, input, textarea').count();
    record('P15-05B', '/ai-studio dedicated workspace & prompt studio controls', studioCheck.ok && studioControls >= 5, `controls=${studioControls}`);

    await navigateRoute('/pos');
    const startShiftBtn = page.getByRole('button', { name: /Mulai Shift/i });
    if (await startShiftBtn.isVisible().catch(() => false)) {
      await startShiftBtn.click();
    }
    const posSections = await assertVisibleLabels([/Cafe/i, /Carwash/i, /Pending|Terbuka/i, /Riwayat/i], 2);
    const posControls = await page.locator('button, input, select').count();
    record('P15-06', '/pos interactive tabs & workstation controls', posSections.ok && posControls >= 5, `controls=${posControls}`);

    await navigateRoute('/queue');
    const queueCheck = await assertVisibleLabels([/Antrean/i, /Pencucian/i, /Selesai/i, /Kanban/i], 1);
    const queueInputs = await page.locator('input').count();
    record('P15-07', '/queue board sections & filter inputs', queueCheck.ok && queueInputs >= 1, `inputs=${queueInputs}`);

    await navigateRoute('/finance');
    const finTabs = await assertVisibleLabels([/Cashflow/i, /Carwash/i, /Cafe/i, /Mutasi Bank|Bank/i], 2);
    const finNums = await page.locator('.font-mono, .tabular-nums').count();
    const withdrawBtn = page.getByRole('button', { name: /Tarik Prive/i }).first();
    let modalOpened = false;
    if (await withdrawBtn.isVisible().catch(() => false)) {
      await withdrawBtn.click();
      const modalInputs = page.locator('input, select').first();
      await modalInputs.waitFor({ state: 'visible', timeout: 5000 });
      modalOpened = (await page.locator('input').count()) >= 1;
      await page.keyboard.press('Escape').catch(() => {});
    }
    record('P15-08', '/finance tabs, tabular numerals & interactive modal fields', finTabs.ok && finNums > 0 && modalOpened, `nums=${finNums}, modal=${modalOpened}`);

    await navigateRoute('/gudang');
    const gudangTabs = await assertVisibleLabels([/CAFE/i, /CARWASH/i, /MERCHANDISE/i], 2);
    const gudangInputs = await page.locator('input, button').count();
    record('P15-09', '/gudang warehouse tabs & inventory controls', gudangTabs.ok && gudangInputs >= 4, `controls=${gudangInputs}`);

    await navigateRoute('/reports');
    const printAreaCount = await page.locator('#print-area').count();
    const reportsTabs = await assertVisibleLabels([/Laporan/i, /Buku Besar|General Ledger/i], 1);
    const reportsNums = await page.locator('.font-mono, .tabular-nums').count();
    record('P15-10', '/reports operational/GL view, #print-area & tabular numerals', printAreaCount >= 1 && reportsTabs.ok && reportsNums > 0, `printArea=${printAreaCount}, nums=${reportsNums}`);

    await navigateRoute('/karyawan');
    const karyawanTabs = await assertVisibleLabels([/Gaji|Komisi/i, /Kru|Cuci/i, /Kantor|Staff/i], 2);
    record('P15-11', '/karyawan payroll, crew & staff tabs', karyawanTabs.ok, karyawanTabs.found.join(','));

    await navigateRoute('/crm');
    const crmInputs = await page.locator('input').count();
    const crmCheck = await assertVisibleLabels([/Loyalty/i, /VIP/i, /Pelanggan/i], 2);
    record('P15-12', '/crm search input, RFM segments & loyalty config', crmInputs >= 1 && crmCheck.ok, `inputs=${crmInputs}`);

    await navigateRoute('/admin');
    const adminTabs = await assertVisibleLabels([/Menu/i, /Paket/i, /Merchandise/i, /Struk/i, /Lisensi/i], 3);
    record('P15-13', '/admin master data & configuration tabs', adminTabs.ok, adminTabs.found.join(','));

    await navigateRoute('/konsolidasi');
    const konsolidasiCheck = await assertVisibleLabels([/Konsolidasi/i, /Outlet|Cabang/i], 1);
    record('P15-14', '/konsolidasi multi-outlet overview rendered', konsolidasiCheck.ok, konsolidasiCheck.found.join(','));

    record(
      'P15-15',
      'Zero uncaught pageerror & unexpected console.error across all 14 routes',
      pageErrors.length === 0 && unexpectedConsoleErrors.length === 0,
      `pageErrors=${pageErrors.length}, consoleErrors=${unexpectedConsoleErrors.length}`
    );

    console.log('\nALL 15 PHASE 1.5 LIVE DOM FIELD & SECTION CHECKS PASSED 100%!');
  } catch (err) {
    console.error(`Phase 1.5 E2E failure at ${page.url()}:`, err?.message || err);
    throw err;
  } finally {
    await browser.close();
    await closeServer();
  }
}

runPhase15FieldSectionE2E().catch((err) => {
  console.error('Phase 1.5 Playwright Suite Failed:', err);
  process.exit(1);
});
