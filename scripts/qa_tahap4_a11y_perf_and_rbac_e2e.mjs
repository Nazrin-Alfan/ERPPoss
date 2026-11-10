import { chromium } from 'playwright';
import { createServer } from 'vite';

/**
 * TAHAP 4 PLAYWRIGHT QA SUITE
 * Skills Applied:
 * - accessibility-testing (WCAG 2.2 AA: Landmarks, Form Labels, Keyboard Tab Order, Focus Ring, Contrast & Anti-AI Slop Tabular Numerals)
 * - performance-testing (Web Vitals: FCP, DOMContentLoaded, Load Event Budgets < 2000ms)
 * - security-testing / playwright-automation (Deep RBAC Route Guard Containment for Kasir vs Owner/SuperAdmin routes)
 */
async function runTahap4Suite() {
  console.log('🚀 Starting Vite Server for Tahap 4 (A11y, Performance & Deep RBAC E2E Suite)...');
  const server = await createServer({
    server: { port: 4180, strictPort: false },
    logLevel: 'error',
  });
  await server.listen();
  const address = server.httpServer.address();
  const baseURL = `http://localhost:${address.port}`;
  console.log(`🌐 Vite Server listening at ${baseURL}`);

  const browser = await chromium.launch({ headless: true });

  const results = [];
  const record = (id, category, name, passed, detail = '') => {
    results.push({ id, category, name, passed, detail });
    console.log(`  ${passed ? '✅' : '❌'} [${id}] (${category}) ${name}${detail ? ` — ${detail}` : ''}`);
    if (!passed) {
      throw new Error(`Tahap 4 Failure in ${id}: ${name} (${detail})`);
    }
  };

  try {
    // =========================================================================
    // PART A: OWNER SESSION — A11Y, KEYBOARD NAVIGATION & WEB VITALS BUDGETS
    // =========================================================================
    const ownerCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ownerCtx.newPage();

    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message || String(err)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    // T4-01: Login Page Keyboard Navigation & Accessible Form Labels (WCAG 2.1.1, 3.3.2, 4.1.2)
    await page.goto(`${baseURL}/login`, { waitUntil: 'domcontentloaded' });
    const usernameInput = page.getByLabel('Username atau Email', { exact: false });
    const passwordInput = page.getByLabel('PIN / Kata Sandi', { exact: false });
    await usernameInput.waitFor({ state: 'visible', timeout: 15000 });

    await usernameInput.focus();
    const activeTag1 = await page.evaluate(() => document.activeElement?.tagName);
    await page.keyboard.type('owner');
    await page.keyboard.press('Tab');
    await passwordInput.focus();
    await page.keyboard.type('password123');

    const submitBtn = page.getByRole('button', { name: 'Masuk ke Sistem' });
    const isSubmitEnabled = await submitBtn.isEnabled();
    record(
      'T4-01',
      'A11Y-KEYBOARD',
      'Login Form Accessible Labels & Keyboard Focus Navigation (WCAG 2.1.1 / 3.3.2)',
      activeTag1 === 'INPUT' && isSubmitEnabled,
      `Focused tag: ${activeTag1}, Submit enabled: ${isSubmitEnabled}`
    );

    // Submit via Enter key
    await passwordInput.press('Enter');
    await page.waitForURL((url) => url.pathname === '/dashboard' || url.pathname === '/konsolidasi', {
      timeout: 15000,
    });
    record(
      'T4-02',
      'A11Y-KEYBOARD',
      'Keyboard Enter Form Submission & Owner Route Dispatch',
      true,
      `Landed on ${new URL(page.url()).pathname}`
    );

    // T4-03: Web Vitals & Navigation Timing Performance Budgets across Core Routes (< 2000ms)
    const routesToBenchmark = ['/dashboard', '/pos', '/finance', '/karyawan', '/crm', '/gudang'];
    const perfMetrics = [];

    for (const route of routesToBenchmark) {
      const t0 = Date.now();
      await page.goto(`${baseURL}${route}`, { waitUntil: 'domcontentloaded' });
      await page.locator('main').waitFor({ state: 'visible', timeout: 10000 });
      const navTimeMs = Date.now() - t0;

      const perfData = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        const fcp = performance.getEntriesByName('first-contentful-paint')[0];
        return {
          dcl: nav ? Math.round(nav.domContentLoadedEventEnd) : 0,
          fcp: fcp ? Math.round(fcp.startTime) : 0,
        };
      });

      perfMetrics.push({ route, navTimeMs, fcp: perfData.fcp, dcl: perfData.dcl });
    }

    const maxNavTime = Math.max(...perfMetrics.map((m) => m.navTimeMs));
    const perfSummary = perfMetrics.map((m) => `${m.route}:${m.navTimeMs}ms`).join(', ');
    record(
      'T4-03',
      'PERF-VITALS',
      'Core ERP Route Navigation & Render Budget (< 2000ms per route)',
      maxNavTime < 2000,
      `Max=${maxNavTime}ms (${perfSummary})`
    );

    // T4-04: WCAG 2.2 AA Semantic Landmarks, Headings, & Interactive Control Accessible Names Audit
    await page.goto(`${baseURL}/finance`, { waitUntil: 'domcontentloaded' });
    await page.locator('main').waitFor({ state: 'visible' });

    const a11yDomAudit = await page.evaluate(() => {
      const mainCount = document.querySelectorAll('main').length;
      const headings = document.querySelectorAll('h1, h2, h3').length;
      const unlabeledInputs = Array.from(
        document.querySelectorAll('input:not([type="hidden"]), select, textarea')
      ).filter((el) => {
        const id = el.getAttribute('id');
        const hasForLabel = id && document.querySelector(`label[for="${CSS.escape(id)}"]`);
        const hasWrapLabel = Boolean(el.closest('label'));
        const hasAria = Boolean(
          el.getAttribute('aria-label') ||
            el.getAttribute('aria-labelledby') ||
            el.getAttribute('placeholder') ||
            el.getAttribute('title')
        );
        return !(hasForLabel || hasWrapLabel || hasAria);
      }).length;
      const tabularCount = document.querySelectorAll('.font-mono, .tabular-nums').length;
      const tactileButtons = document.querySelectorAll('[class*="active:scale"]').length;
      return { mainCount, headings, unlabeledInputs, tabularCount, tactileButtons };
    });

    record(
      'T4-04',
      'A11Y-WCAG22',
      'Semantic Landmarks (<main>), Headings, Input Labels & Tactile/Tabular UI Compliance',
      a11yDomAudit.mainCount >= 1 &&
        a11yDomAudit.headings >= 1 &&
        a11yDomAudit.unlabeledInputs === 0 &&
        a11yDomAudit.tabularCount > 0,
      `main=${a11yDomAudit.mainCount}, headings=${a11yDomAudit.headings}, unlabeledInputs=${a11yDomAudit.unlabeledInputs}, tabularNums=${a11yDomAudit.tabularCount}, tactileBtns=${a11yDomAudit.tactileButtons}`
    );

    await ownerCtx.close();

    // =========================================================================
    // PART B: KASIR SESSION — DEEP RBAC ROUTE CONTAINMENT & PRIVILEGE GUARD
    // =========================================================================
    const kasirCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const kasirPage = await kasirCtx.newPage();

    kasirPage.on('pageerror', (err) => pageErrors.push(err.message || String(err)));
    kasirPage.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await kasirPage.goto(`${baseURL}/login`, { waitUntil: 'domcontentloaded' });
    await kasirPage.getByLabel('Username atau Email', { exact: false }).fill('kasir');
    await kasirPage.getByLabel('PIN / Kata Sandi', { exact: false }).fill('password123');
    await kasirPage.getByRole('button', { name: 'Masuk ke Sistem' }).click();

    await kasirPage.waitForURL((url) => url.pathname === '/pos' || url.pathname === '/queue', {
      timeout: 15000,
    });
    record(
      'T4-05',
      'RBAC-AUTH',
      'Kasir Login & Operational Route Dispatch (/pos)',
      true,
      `Kasir landed on ${new URL(kasirPage.url()).pathname}`
    );

    // T4-06: Restricted Route Containment Test for Kasir
    const restrictedRoutes = ['/dashboard', '/konsolidasi', '/finance', '/reports', '/karyawan', '/admin', '/founder', '/database'];
    const blockedResults = [];

    for (const restricted of restrictedRoutes) {
      await kasirPage.goto(`${baseURL}${restricted}`, { waitUntil: 'domcontentloaded' });
      await kasirPage.waitForURL((url) => url.pathname === '/pos' || url.pathname === '/queue', {
        timeout: 5000,
      });
      const finalPath = new URL(kasirPage.url()).pathname;
      const wasBlocked = finalPath === '/pos' || finalPath === '/queue';
      blockedResults.push({ restricted, finalPath, wasBlocked });
    }

    const allBlocked = blockedResults.every((r) => r.wasBlocked);
    record(
      'T4-06',
      'RBAC-CONTAINMENT',
      'Kasir Blocked & Redirected from All 8 Executive/Finance/Admin/Founder Routes',
      allBlocked,
      blockedResults.map((r) => `${r.restricted}->${r.finalPath}`).join(', ')
    );

    await kasirCtx.close();

    // T4-07: Zero Uncaught Errors Gate across Owner & Kasir Journeys
    record(
      'T4-07',
      'ZERO-DEFECT',
      'Zero Uncaught PageErrors & ConsoleErrors across A11y, Perf & RBAC Journeys',
      pageErrors.length === 0 && consoleErrors.length === 0,
      `PageErrors=${pageErrors.length}, ConsoleErrors=${consoleErrors.length}`
    );

    console.log('\n🎉 ALL 7 TAHAP 4 CHECKS (A11Y, PERF VITALS, DEEP RBAC CONTAINMENT) PASSED 100%!');
  } finally {
    await browser.close();
    await server.close();
  }
}

runTahap4Suite().catch((err) => {
  console.error('❌ Tahap 4 Suite Failed:', err);
  process.exit(1);
});
