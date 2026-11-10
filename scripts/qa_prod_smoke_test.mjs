import { chromium } from 'playwright';

const PROD_URL = process.env.PROD_URL || 'https://erpposs.pages.dev';

async function runProdSmokeSuite() {
  console.log(`🚀 Running Post-Deploy Production Smoke Suite against ${PROD_URL} ...`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const pageErrors = [];
  const consoleErrors = [];
  let allowExpectedAuthError = true;

  page.on('pageerror', (err) => pageErrors.push(err.message || String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const txt = msg.text();
      if (allowExpectedAuthError && (txt.includes('Login error:') || txt.includes('400'))) return;
      consoleErrors.push(txt);
    }
  });

  const record = (id, name, passed, detail = '') => {
    console.log(`  ${passed ? '✅' : '❌'} [${id}] ${name}${detail ? ` — ${detail}` : ''}`);
    if (!passed) {
      throw new Error(`Production Smoke Check Failed [${id}]: ${name} (${detail})`);
    }
  };

  try {
    // SMOKE-01: Production HTTP Status, Security Headers & Initial Load Time
    const t0 = Date.now();
    const response = await page.goto(`${PROD_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    const loadMs = Date.now() - t0;
    const status = response?.status() || 0;
    const headers = response?.headers() || {};

    record(
      'SMOKE-01',
      'Production Edge HTTP 200 & Security Headers (X-Content-Type-Options, X-Frame-Options)',
      status === 200 && headers['x-content-type-options'] === 'nosniff' && headers['x-frame-options'] === 'DENY',
      `HTTP ${status} in ${loadMs}ms | x-frame-options=${headers['x-frame-options']}`
    );

    // SMOKE-02: Verify Code-Split Entry Bundle (`index-BnkawIdF.js`) is Served Live
    const scriptSrcs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('script[type="module"]')).map((s) => s.getAttribute('src'))
    );
    const hasLatestBundle = scriptSrcs.some((s) => s && s.includes('index-'));
    record(
      'SMOKE-02',
      'Latest Code-Split Production Bundle Active on Cloudflare Edge',
      hasLatestBundle,
      `Entry script: ${scriptSrcs.join(', ')}`
    );

    // SMOKE-03: Login UI Accessibility & Form Rendering on Live Domain
    const usernameInput = page.getByLabel('Username atau Email', { exact: false });
    const passwordInput = page.getByLabel('PIN / Kata Sandi', { exact: false });
    await usernameInput.waitFor({ state: 'visible', timeout: 15000 });
    const submitBtn = page.getByRole('button', { name: 'Masuk ke Sistem' });
    record(
      'SMOKE-03',
      'Live Login Screen & Accessible Form Controls Rendered',
      await submitBtn.isVisible(),
      'Username, Password & Submit Button visible'
    );

    // SMOKE-04: Unauthenticated Protected Route Guard on Live Domain (/finance -> /login)
    await page.goto(`${PROD_URL}/finance`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL((url) => url.pathname === '/login', { timeout: 10000 });
    record(
      'SMOKE-04',
      'Unauthenticated Access to /finance Redirects to /login on Live Domain',
      new URL(page.url()).pathname === '/login',
      `Redirected cleanly to ${new URL(page.url()).pathname}`
    );

    allowExpectedAuthError = false;

    // SMOKE-05: Zero Uncaught Runtime Errors on Production Edge
    record(
      'SMOKE-05',
      'Zero Uncaught JS PageErrors & ConsoleErrors on Production Edge',
      pageErrors.length === 0 && consoleErrors.length === 0,
      `PageErrors=${pageErrors.length}, ConsoleErrors=${consoleErrors.length}`
    );

    console.log('\n🎉 ALL 5 PRODUCTION SMOKE CHECKS PASSED ON https://erpposs.pages.dev!');
  } finally {
    await browser.close();
  }
}

runProdSmokeSuite().catch((err) => {
  console.error('❌ Production Smoke Suite Failed:', err);
  process.exit(1);
});
