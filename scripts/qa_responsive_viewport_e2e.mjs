import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { createServer, preview } from 'vite';

/**
 * PHASE 2.5 PLAYWRIGHT RESPONSIVE MOBILE (390x844) & TABLET (1024x768) GATE
 *
 * Verifies zero horizontal viewport overflow, mobile bottom nav visibility & toggle,
 * tablet sidebar visibility, and zero runtime console/page errors with ZERO waitForTimeout calls.
 */
async function runResponsiveViewportE2E() {
  const hasDist = fs.existsSync(path.resolve(process.cwd(), 'dist', 'index.html'));
  const usePreview = process.env.USE_DIST_PREVIEW === 'true' || (process.env.USE_DIST_PREVIEW !== 'false' && hasDist);
  const captureDir = process.env.CAPTURE_DIR || '';
  if (captureDir) {
    fs.mkdirSync(captureDir, { recursive: true });
  }

  console.log(`Starting Vite ${usePreview ? 'Preview (dist)' : 'Dev'} Server for Phase 2.5 Responsive E2E...`);

  let closeServer;
  let port;
  if (usePreview) {
    const srv = await preview({ preview: { host: '127.0.0.1', port: 4182, strictPort: false } });
    port = srv.httpServer.address().port;
    closeServer = () => new Promise((resolve) => srv.httpServer.close(resolve));
  } else {
    const srv = await createServer({
      server: { host: '127.0.0.1', port: 4182, strictPort: false },
      logLevel: 'error',
    });
    await srv.listen();
    port = srv.httpServer.address().port;
    closeServer = () => srv.close();
  }

  const baseURL = `http://127.0.0.1:${port}`;
  console.log(`Vite Server listening at ${baseURL}`);

  const browser = await chromium.launch({ headless: true });

  const waitRouteReady = async (page) => {
    await page.locator('main, form, body').first().waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForFunction(
      () => {
        const text = (document.body.innerText || '').trim();
        return text.length > 40 && !text.includes('MEMUAT HALAMAN') && !text.includes('MEMUAT SESI');
      },
      null,
      { timeout: 15000 }
    );
  };

  const checkOverflow = async (page) =>
    page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      ok: document.documentElement.scrollWidth <= window.innerWidth + 2,
    }));

  const loginAsOwner = async (page) => {
    await page.goto(`${baseURL}/login`, { waitUntil: 'domcontentloaded' });
    await waitRouteReady(page);
    const usernameInput = page.getByLabel('Username atau Email', { exact: false });
    const passwordInput = page.getByLabel('PIN / Kata Sandi', { exact: false });
    await usernameInput.waitFor({ state: 'visible', timeout: 15000 });
    await usernameInput.fill('owner');
    await passwordInput.fill('password123');
    await page.getByRole('button', { name: /^(Masuk|Masuk ke Sistem)$/i }).click();
    await page.waitForURL((url) => url.pathname === '/dashboard' || url.pathname === '/konsolidasi', { timeout: 15000 });
  };

  const record = (id, name, passed, detail = '') => {
    console.log(`  ${passed ? 'PASS' : 'FAIL'} [${id}] ${name}${detail ? ` — ${detail}` : ''}`);
    if (!passed) {
      throw new Error(`Phase 2.5 Responsive E2E failure in ${id}: ${name} (${detail})`);
    }
  };

  try {
    // =========================================================================
    // SUITE A: MOBILE VIEWPORT (390 x 844)
    // =========================================================================
    console.log('\nSuite A: Mobile Viewport (390x844)');
    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await mobileContext.addInitScript(() => {
      if (!window.localStorage.getItem('relaypos_real_auth_v2')) {
        window.localStorage.setItem('relaypos_real_auth_v2', 'null');
      }
    });
    const mPage = await mobileContext.newPage();
    const mPageErrors = [];
    const mConsoleErrors = [];
    mPage.on('pageerror', (err) => mPageErrors.push(err.message || String(err)));
    mPage.on('console', (msg) => {
      if (msg.type() === 'error') mConsoleErrors.push(msg.text());
    });

    await mPage.goto(`${baseURL}/login`, { waitUntil: 'domcontentloaded' });
    await waitRouteReady(mPage);
    const loginOverflow = await checkOverflow(mPage);
    const loginBottomNavVisible = await mPage.locator('[data-testid="mobile-bottom-nav"]').isVisible().catch(() => false);
    record(
      'RSP-M01',
      '/login fits 390px viewport with no bottom nav on standalone page',
      loginOverflow.ok && !loginBottomNavVisible,
      `scrollWidth=${loginOverflow.scrollWidth}/${loginOverflow.innerWidth}`
    );

    await loginAsOwner(mPage);

    const mobileRoutes = ['/dashboard', '/pos', '/queue', '/finance'];
    for (let idx = 0; idx < mobileRoutes.length; idx++) {
      const route = mobileRoutes[idx];
      await mPage.goto(`${baseURL}${route}`, { waitUntil: 'domcontentloaded' });
      await waitRouteReady(mPage);

      if (route === '/pos') {
        const startShiftBtn = mPage.getByRole('button', { name: /Mulai Shift/i });
        if (await startShiftBtn.isVisible().catch(() => false)) {
          await startShiftBtn.click();
          await waitRouteReady(mPage);
        }
      }

      const overflow = await checkOverflow(mPage);
      const bottomNav = mPage.locator('[data-testid="mobile-bottom-nav"]');
      await bottomNav.waitFor({ state: 'visible', timeout: 10000 });
      const navBox = await bottomNav.boundingBox();
      const asideVisible = await mPage.locator('aside').isVisible().catch(() => false);

      record(
        `RSP-M0${idx + 2}`,
        `${route} fits 390x844 with bottom nav >=56px and hidden desktop aside`,
        overflow.ok && Boolean(navBox && navBox.height >= 56) && !asideVisible,
        `scrollWidth=${overflow.scrollWidth}/${overflow.innerWidth}, bottomNavH=${navBox?.height || 0}`
      );

      if (route === '/dashboard') {
        const menuBtn = mPage.locator('[data-testid="mobile-bottom-nav-menu"]');
        await menuBtn.click();
        const logoutBtn = mPage.getByRole('button', { name: /Keluar Aplikasi/i }).first();
        await logoutBtn.waitFor({ state: 'visible', timeout: 5000 });
        await menuBtn.click();
        await logoutBtn.waitFor({ state: 'hidden', timeout: 5000 });
        record('RSP-M06', 'Mobile bottom nav Menu button toggles drawer cleanly', true);
      }

      if (captureDir && (route === '/dashboard' || route === '/pos')) {
        const filename = route === '/dashboard' ? 'mobile_dashboard.png' : 'mobile_pos.png';
        await mPage.screenshot({ path: path.join(captureDir, filename), fullPage: false });
      }
    }

    record(
      'RSP-M07',
      'Zero pageerror & console.error on Mobile 390x844 suite',
      mPageErrors.length === 0 && mConsoleErrors.length === 0,
      `pageErrors=${mPageErrors.length}, consoleErrors=${mConsoleErrors.length}`
    );
    await mobileContext.close();

    // =========================================================================
    // SUITE B: TABLET LANDSCAPE VIEWPORT (1024 x 768)
    // =========================================================================
    console.log('\nSuite B: Tablet Landscape Viewport (1024x768)');
    const tabletContext = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    await tabletContext.addInitScript(() => {
      if (!window.localStorage.getItem('relaypos_real_auth_v2')) {
        window.localStorage.setItem('relaypos_real_auth_v2', 'null');
      }
    });
    const tPage = await tabletContext.newPage();
    const tPageErrors = [];
    const tConsoleErrors = [];
    tPage.on('pageerror', (err) => tPageErrors.push(err.message || String(err)));
    tPage.on('console', (msg) => {
      if (msg.type() === 'error') tConsoleErrors.push(msg.text());
    });

    await loginAsOwner(tPage);

    const tabletRoutes = ['/dashboard', '/pos', '/queue', '/finance'];
    for (let idx = 0; idx < tabletRoutes.length; idx++) {
      const route = tabletRoutes[idx];
      await tPage.goto(`${baseURL}${route}`, { waitUntil: 'domcontentloaded' });
      await waitRouteReady(tPage);

      if (route === '/pos') {
        const startShiftBtn = tPage.getByRole('button', { name: /Mulai Shift/i });
        if (await startShiftBtn.isVisible().catch(() => false)) {
          await startShiftBtn.click();
          await waitRouteReady(tPage);
        }
      }

      const overflow = await checkOverflow(tPage);
      const aside = tPage.locator('aside').first();
      await aside.waitFor({ state: 'visible', timeout: 10000 });
      const mobileBottomVisible = await tPage.locator('[data-testid="mobile-bottom-nav"]').isVisible().catch(() => false);

      record(
        `RSP-T0${idx + 1}`,
        `${route} fits 1024x768 with visible aside and hidden mobile bottom nav`,
        overflow.ok && !mobileBottomVisible,
        `scrollWidth=${overflow.scrollWidth}/${overflow.innerWidth}`
      );

      if (captureDir && route === '/pos') {
        await tPage.screenshot({ path: path.join(captureDir, 'tablet_pos.png'), fullPage: false });
      }
    }

    record(
      'RSP-T05',
      'Zero pageerror & console.error on Tablet 1024x768 suite',
      tPageErrors.length === 0 && tConsoleErrors.length === 0,
      `pageErrors=${tPageErrors.length}, consoleErrors=${tConsoleErrors.length}`
    );
    await tabletContext.close();

    console.log('\nPHASE 2.5 RESPONSIVE VIEWPORT E2E PASSED (ALL CHECKS GREEN)');
  } finally {
    await browser.close();
    await closeServer();
  }
}

runResponsiveViewportE2E().catch((err) => {
  console.error('\nPHASE 2.5 RESPONSIVE E2E FAILED:', err);
  process.exit(1);
});
