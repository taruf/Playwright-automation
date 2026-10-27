import { test as base, expect } from '@fixtures/fixtures';
import type { NewAccountPayload } from '@api/ApiClient';
import { createTestUser } from '@data/users';

const test = base.extend<{ existingUser: NewAccountPayload }>({
  existingUser: async ({ apiClient }, use) => {
    const user = createTestUser('perf');
    expect((await apiClient.createAccount(user)).responseCode).toBe(201);
    await use(user);
    await apiClient.deleteAccount(user.email, user.password);
  },
});

test.describe('low-end mobile device', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('the homepage loads and stays responsive with a 4x slower CPU', async ({
    page,
    context,
    homePage,
  }) => {
    // 4x CPU slowdown ~ mid-range phone
    const devtools = await context.newCDPSession(page);
    await devtools.send('Emulation.setCPUThrottlingRate', { rate: 4 });

    await page.addInitScript(() => {
      const state = { totalBlockingTime: 0 };
      (window as unknown as { __blocking: typeof state }).__blocking = state;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          state.totalBlockingTime += Math.max(0, entry.duration - 50);
        }
      }).observe({ type: 'longtask', buffered: true });
    });

    await homePage.goto();
    const metrics = await page.evaluate(() => {
      const [nav] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      const { totalBlockingTime } = (
        window as unknown as { __blocking: { totalBlockingTime: number } }
      ).__blocking;
      return { load: nav.loadEventEnd - nav.startTime, totalBlockingTime };
    });

    await test.info().attach('low-end-device-metrics', {
      body: JSON.stringify(metrics, null, 2),
      contentType: 'application/json',
    });

    // measured: load 4-13s, TBT 0.5-1s
    expect(metrics.load).toBeGreaterThan(0);
    expect(metrics.load).toBeLessThan(30_000);
    expect(metrics.totalBlockingTime).toBeLessThan(3_000);
  });
});

test.describe('how the page is built', () => {
  test('no script in the page head blocks rendering', async ({ page, homePage }) => {
    await homePage.goto();

    const blockingScripts = await page.evaluate(() =>
      [...document.head.querySelectorAll<HTMLScriptElement>('script[src]')]
        .filter((script) => !script.async && !script.defer && script.type !== 'module')
        .map((script) => script.src),
    );

    expect(blockingScripts).toEqual([]);
  });

  test('the number of stylesheets stays within budget', async ({ page, homePage }) => {
    // currently 8
    await homePage.goto();

    const stylesheetCount = await page.evaluate(
      () => document.querySelectorAll('link[rel="stylesheet"]').length,
    );

    expect(stylesheetCount).toBeLessThanOrEqual(10);
  });

  test('no image on the listing pages is broken', async ({ page, homePage, productsPage }) => {
    for (const listing of [homePage, productsPage]) {
      await listing.goto();

      const brokenImages = await page.evaluate(() =>
        [...document.images]
          .filter((image) => image.complete && image.naturalWidth === 0)
          .map((image) => image.src),
      );

      expect(brokenImages, page.url()).toEqual([]);
    }
  });
});

test.describe('repeated use', () => {
  test('opening and closing the cart popup repeatedly does not grow the page', async ({
    page,
    context,
    productsPage,
  }) => {
    const devtools = await context.newCDPSession(page);
    await devtools.send('Performance.enable');
    const snapshot = async () => {
      // GC first, otherwise removed-but-uncollected listeners still count
      await devtools.send('HeapProfiler.collectGarbage');
      const { metrics } = await devtools.send('Performance.getMetrics');
      return {
        domElements: await page.evaluate(() => document.querySelectorAll('*').length),
        eventListeners: metrics.find((m) => m.name === 'JSEventListeners')?.value ?? 0,
      };
    };
    const openAndClosePopup = async () => {
      await productsPage.addToCartFromListing(1);
      await productsPage.continueShoppingButton.click();
      await expect(productsPage.cartModal).toBeHidden();
    };

    await productsPage.goto();
    // warm-up cycle so one-off setup isn't counted
    await openAndClosePopup();
    const before = await snapshot();

    for (let cycle = 0; cycle < 5; cycle++) {
      await openAndClosePopup();
    }
    const after = await snapshot();

    await test.info().attach('growth-after-5-cycles', {
      body: JSON.stringify({ before, after }, null, 2),
      contentType: 'application/json',
    });
    expect(after.domElements).toBeLessThanOrEqual(before.domElements + 5);
    expect(after.eventListeners).toBeLessThanOrEqual(before.eventListeners + 5);
  });
});

test.describe('logged-in round-trips', () => {
  test('logging in and logging out each complete within budget', async ({
    existingUser,
    signupLoginPage,
    homePage,
  }) => {
    await signupLoginPage.goto();

    const loginStartedAt = Date.now();
    await signupLoginPage.login(existingUser.email, existingUser.password);
    await expect(homePage.loggedInAs).toBeVisible();
    const loginMs = Date.now() - loginStartedAt;

    const logoutStartedAt = Date.now();
    await homePage.logoutLink.click();
    await expect(homePage.signupLoginLink).toBeVisible();
    const logoutMs = Date.now() - logoutStartedAt;

    test
      .info()
      .annotations.push(
        { type: 'login-ms', description: String(loginMs) },
        { type: 'logout-ms', description: String(logoutMs) },
      );
    expect(loginMs).toBeLessThan(10_000);
    expect(logoutMs).toBeLessThan(10_000);
  });
});

// Known site issues - test.fail() until fixed.
test.describe('known front-end problems (expected to fail until fixed)', () => {
  test('images are not downloaded far larger than they are displayed', async ({
    page,
    homePage,
  }) => {
    test.fail(
      true,
      '20 product images are 2-6x wider than their slot (e.g. 1600px shown at 247px)',
    );
    await homePage.goto();

    const oversized = await page.evaluate(() =>
      [...document.images]
        .filter((image) => image.clientWidth > 0)
        // 2x allowance for high-DPI screens
        .filter((image) => image.naturalWidth > image.clientWidth * 2)
        .map((image) => `${image.naturalWidth}px shown at ${image.clientWidth}px: ${image.src}`),
    );

    expect(oversized).toEqual([]);
  });

  test('images below the first screen are lazy-loaded', async ({ page, homePage }) => {
    test.fail(true, 'None of the ~31 off-screen images use loading="lazy"');
    await homePage.goto();

    const eagerOffscreenImages = await page.evaluate(() =>
      [...document.images]
        .filter((image) => image.getBoundingClientRect().top + scrollY > innerHeight * 2)
        .filter((image) => image.loading !== 'lazy')
        .map((image) => image.src),
    );

    expect(eagerOffscreenImages).toEqual([]);
  });

  test('images declare their width and height', async ({ page, homePage }) => {
    test.fail(true, 'No <img> has width/height attributes, so space is not reserved while loading');
    await homePage.goto();

    const withoutDimensions = await page.evaluate(() =>
      [...document.images]
        .filter((image) => !image.getAttribute('width') || !image.getAttribute('height'))
        .map((image) => image.src),
    );

    expect(withoutDimensions).toEqual([]);
  });
});
