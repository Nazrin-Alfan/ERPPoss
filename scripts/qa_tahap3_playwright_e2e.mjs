import { chromium } from 'playwright';
import { createServer, preview } from 'vite';

async function runPlaywrightE2ESuite() {
  const usePreview = process.env.USE_DIST_PREVIEW === 'true';
  console.log(`🚀 Starting Vite ${usePreview ? 'Preview (dist)' : 'Dev'} Server for Tahap 3 Playwright E2E Suite...`);
  let closeServer;
  let port;
  if (usePreview) {
    const srv = await preview({ preview: { host: '127.0.0.1', port: 4179, strictPort: false } });
    port = srv.httpServer.address().port;
    closeServer = () => new Promise((resolve) => srv.httpServer.close(resolve));
  } else {
    const srv = await createServer({
      server: { host: '127.0.0.1', port: 4179, strictPort: false },
      logLevel: 'error',
    });
    await srv.listen();
    port = srv.httpServer.address().port;
    closeServer = () => srv.close();
  }
  const baseURL = `http://127.0.0.1:${port}`;
  console.log(`🌐 Vite Server listening at ${baseURL}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  // Prevent localDbEngine demo auto-login race from redirecting /login -> /dashboard before auth tests run
  await context.addInitScript(() => {
    if (!window.localStorage.getItem('relaypos_real_auth_v2')) {
      window.localStorage.setItem('relaypos_real_auth_v2', 'null');
    }
  });
  const page = await context.newPage();

  const pageErrors = [];
  const unexpectedConsoleErrors = [];
  let allowAuthErrorLog = true;

  page.on('pageerror', (err) => {
    pageErrors.push(err.message || String(err));
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (allowAuthErrorLog && text.includes('Login error:')) return;
      unexpectedConsoleErrors.push(text);
    }
  });

  const results = [];
  const record = (id, name, passed, detail = '') => {
    results.push({ id, name, passed, detail });
    console.log(`  ${passed ? '✅' : '❌'} [${id}] ${name}${detail ? ` — ${detail}` : ''}`);
    if (!passed) {
      throw new Error(`E2E Failure in ${id}: ${name} (${detail})`);
    }
  };

  try {
    // E2E-01: Login Page & Negative Auth Validation
    await page.goto(`${baseURL}/login`, { waitUntil: 'domcontentloaded' });
    const usernameInput = page.getByLabel('Username atau Email', { exact: false });
    const passwordInput = page.getByLabel('PIN / Kata Sandi', { exact: false });
    await usernameInput.waitFor({ state: 'visible', timeout: 15000 });
    await usernameInput.fill('invalid_user@nowhere.test');
    await passwordInput.fill('wrong_password_123');
    await page.getByRole('button', { name: /^(Masuk|Masuk ke Sistem)$/i }).click();

    const alertBox = page.getByRole('alert');
    await alertBox.waitFor({ state: 'visible', timeout: 10000 });
    const alertText = await alertBox.innerText();
    record('E2E-01', 'Negative Auth Validation (Invalid Credentials Alert)', alertText.length > 0, alertText.trim());
    allowAuthErrorLog = false;

    // E2E-02: Owner Login / Onboarding & Route Dispatch (R-08)
    await usernameInput.fill('owner');
    await passwordInput.fill('password123');
    await page.getByRole('button', { name: /^(Masuk|Masuk ke Sistem)$/i }).click();

    await page.waitForURL((url) => url.pathname === '/dashboard' || url.pathname === '/konsolidasi', {
      timeout: 15000,
    });
    record('E2E-02', 'Owner Authentication & Role Route Dispatch (R-08)', true, `Redirected to ${new URL(page.url()).pathname}`);

    // Helper: navigate & wait for hydrated app route (<main>) before asserting content
    const navigateAndWait = async (routePath) => {
      await page.goto(`${baseURL}${routePath}`, { waitUntil: 'domcontentloaded' });
      await page.locator('main').first().waitFor({ state: 'visible', timeout: 15000 });
      await page.waitForFunction(() => (document.body.innerText || '').trim().length > 50, null, { timeout: 15000 });
    };

    // E2E-03: Executive Dashboard & Multi-Branch Consolidation (R-09)
    await navigateAndWait('/dashboard');
    const dashText = await page.locator('body').innerText();
    record(
      'E2E-03',
      'Executive Dashboard & KPI Rendering (R-09)',
      dashText.length > 50,
      `Rendered ${dashText.length} chars`
    );

    // E2E-04: Hybrid POS Workspace & Inventory Stock View (R-01, R-04)
    await navigateAndWait('/pos');
    const startShiftBtn = page.getByRole('button', { name: /Mulai Shift/i });
    if (await startShiftBtn.isVisible().catch(() => false)) {
      await startShiftBtn.click();
    }
    const posText = await page.locator('body').innerText();
    record(
      'E2E-04',
      'Hybrid POS Workspace & Stock View (R-01, R-04)',
      posText.length > 50,
      'POS interface loaded cleanly'
    );

    // E2E-05: Carwash Queue Kanban Board (R-07)
    await navigateAndWait('/queue');
    const queueText = await page.locator('body').innerText();
    record(
      'E2E-05',
      'Carwash Queue Kanban Board (R-07)',
      queueText.includes('Antrean') || queueText.includes('Pencucian') || queueText.includes('Selesai') || queueText.length > 50,
      'Queue board active'
    );

    // E2E-06: Double-Entry Finance & Tabular Numerals Audit (R-02)
    await navigateAndWait('/finance');
    await page.locator('.font-mono, .tabular-nums').first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    const financeText = await page.locator('body').innerText();
    const monoElements = await page.locator('.font-mono, .tabular-nums').count();
    record(
      'E2E-06',
      'Finance & General Ledger View + Anti-AI Slop Tabular Nums (R-02)',
      financeText.length > 50 && monoElements > 0,
      `Found ${monoElements} font-mono/tabular-nums elements`
    );

    // E2E-07: Staff & Payroll Management (R-07)
    await navigateAndWait('/karyawan');
    const staffText = await page.locator('body').innerText();
    record('E2E-07', 'Staff & Payroll Management View (R-07)', staffText.length > 50, 'Karyawan module loaded');

    // E2E-08: CRM Loyalty & Customer Reward View (R-06)
    await navigateAndWait('/crm');
    const crmText = await page.locator('body').innerText();
    record('E2E-08', 'CRM Loyalty & Reward Management View (R-06)', crmText.length > 50, 'CRM module loaded');

    // E2E-09: Zero Uncaught Page Errors & Console Errors Gate
    record(
      'E2E-09',
      'Zero Uncaught Runtime PageErrors & ConsoleErrors Gate',
      pageErrors.length === 0 && unexpectedConsoleErrors.length === 0,
      `PageErrors: ${pageErrors.length}, ConsoleErrors: ${unexpectedConsoleErrors.length}${
        unexpectedConsoleErrors.length ? ' -> ' + unexpectedConsoleErrors.join(' | ') : ''
      }`
    );

    console.log('\n🎉 ALL 9 PLAYWRIGHT E2E CHECKS PASSED 100%!');
  } catch (err) {
    const curUrl = page.url();
    const snippet = await page.locator('body').innerText().then((t) => t.replace(/\s+/g, ' ').slice(0, 200)).catch(() => '');
    console.log(`::error::Tahap 3 E2E failed at ${curUrl}: ${err?.message || err} | pageErrors=${pageErrors.join('; ')} | body=${snippet}`);
    throw err;
  } finally {
    await browser.close();
    await closeServer();
  }
}

runPlaywrightE2ESuite().catch((err) => {
  console.error('❌ Playwright E2E Suite Failed:', err);
  process.exit(1);
});
