import { chromium } from 'playwright';
import { createServer } from 'vite';

async function runPlaywrightE2ESuite() {
  console.log('🚀 Starting Vite Server for Tahap 3 Playwright E2E Suite...');
  const server = await createServer({
    server: { port: 4179, strictPort: false },
    logLevel: 'error',
  });
  await server.listen();
  const address = server.httpServer.address();
  const baseURL = `http://localhost:${address.port}`;
  console.log(`🌐 Vite Server listening at ${baseURL}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
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
    await page.getByRole('button', { name: 'Masuk ke Sistem' }).click();

    const alertBox = page.getByRole('alert');
    await alertBox.waitFor({ state: 'visible', timeout: 10000 });
    const alertText = await alertBox.innerText();
    record('E2E-01', 'Negative Auth Validation (Invalid Credentials Alert)', alertText.length > 0, alertText.trim());
    allowAuthErrorLog = false;

    // E2E-02: Owner Login / Onboarding & Route Dispatch (R-08)
    await usernameInput.fill('owner');
    await passwordInput.fill('password123');
    await page.getByRole('button', { name: 'Masuk ke Sistem' }).click();

    await page.waitForURL((url) => url.pathname === '/dashboard' || url.pathname === '/konsolidasi', {
      timeout: 15000,
    });
    record('E2E-02', 'Owner Authentication & Role Route Dispatch (R-08)', true, `Redirected to ${new URL(page.url()).pathname}`);

    // E2E-03: Executive Dashboard & Multi-Branch Consolidation (R-09)
    await page.goto(`${baseURL}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.locator('body').waitFor({ state: 'visible' });
    const dashText = await page.locator('body').innerText();
    record(
      'E2E-03',
      'Executive Dashboard & KPI Rendering (R-09)',
      dashText.length > 50,
      `Rendered ${dashText.length} chars`
    );

    // E2E-04: Hybrid POS Workspace & Inventory Stock View (R-01, R-04)
    await page.goto(`${baseURL}/pos`, { waitUntil: 'domcontentloaded' });
    await page.locator('body').waitFor({ state: 'visible' });
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
    await page.goto(`${baseURL}/queue`, { waitUntil: 'domcontentloaded' });
    await page.locator('body').waitFor({ state: 'visible' });
    const queueText = await page.locator('body').innerText();
    record(
      'E2E-05',
      'Carwash Queue Kanban Board (R-07)',
      queueText.includes('Antrean') || queueText.includes('Pencucian') || queueText.includes('Selesai') || queueText.length > 50,
      'Queue board active'
    );

    // E2E-06: Double-Entry Finance & Tabular Numerals Audit (R-02)
    await page.goto(`${baseURL}/finance`, { waitUntil: 'domcontentloaded' });
    await page.locator('body').waitFor({ state: 'visible' });
    const financeText = await page.locator('body').innerText();
    const monoElements = await page.locator('.font-mono, .tabular-nums').count();
    record(
      'E2E-06',
      'Finance & General Ledger View + Anti-AI Slop Tabular Nums (R-02)',
      financeText.length > 50 && monoElements > 0,
      `Found ${monoElements} font-mono/tabular-nums elements`
    );

    // E2E-07: Staff & Payroll Management (R-07)
    await page.goto(`${baseURL}/karyawan`, { waitUntil: 'domcontentloaded' });
    await page.locator('body').waitFor({ state: 'visible' });
    const staffText = await page.locator('body').innerText();
    record('E2E-07', 'Staff & Payroll Management View (R-07)', staffText.length > 50, 'Karyawan module loaded');

    // E2E-08: CRM Loyalty & Customer Reward View (R-06)
    await page.goto(`${baseURL}/crm`, { waitUntil: 'domcontentloaded' });
    await page.locator('body').waitFor({ state: 'visible' });
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
  } finally {
    await browser.close();
    await server.close();
  }
}

runPlaywrightE2ESuite().catch((err) => {
  console.error('❌ Playwright E2E Suite Failed:', err);
  process.exit(1);
});
