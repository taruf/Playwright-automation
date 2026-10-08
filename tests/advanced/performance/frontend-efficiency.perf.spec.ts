import { test as base, expect } from '@fixtures/fixtures';
import type { NewAccountPayload } from '@api/ApiClient';
import { createTestUser } from '@data/users';

/**
 * Front-end efficiency: how the page is built, rather than how fast the
 * network happened to be today. homepage.perf.spec.ts budgets each page
 * load and user-journey.perf.spec.ts times a whole flow; this file covers
 * what those two can't see - slow devices, wasteful images, render-blocking
 * files, growth during repeated use, and the logged-in round-trips.
 *
 * Still a smoke check, not a load test: one user, a handful of page loads.
 * The device throttling is simulated inside the browser, so it costs the
 * site nothing.
 */
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
    // Test machines are far faster than the phones many real users have.
    // A 4x CPU slowdown is the usual stand-in for a mid-range phone.
    const devtools = await context.newCDPSession(page);
    await devtools.send('Emulation.setCPUThrottlingRate', { rate: 4 });

    // Total Blocking Time: for every main-thread task over 50ms, the part
    // beyond 50ms is time the page could not respond to a tap.
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

    // Measured across runs: load 4-13s, blocking 0.5-1s. Generous, because
    // both the shared site and the throttled CPU add variance.
    expect(metrics.load).toBeGreaterThan(0);
    expect(metrics.load).toBeLessThan(30_000);
    expect(metrics.totalBlockingTime).toBeLessThan(3_000);
  });
});

test.describe('how the page is built', () => {
  test('no script in the page head blocks rendering', async ({ page, homePage }) => {
    // A plain <script src> in <head> stops the browser from drawing
    // anything until that file has downloaded and run.
    await homePage.goto();

    const blockingScripts = await page.evaluate(() =>
      [...document.head.querySelectorAll<HTMLScriptElement>('script[src]')]
        .filter((script) => !script.async && !script.defer && script.type !== 'module')
        .map((script) => script.src),
    );

    expect(blockingScripts).toEqual([]);
  });

  test('the number of stylesheets stays within budget', async ({ page, homePage }) => {
    // Every stylesheet blocks rendering. Measured: 8.
    await homePage.goto();

    const stylesheetCount = await page.evaluate(
      () => document.querySelectorAll('link[rel="stylesheet"]').length,
    );

    expect(stylesheetCount).toBeLessThanOrEqual(10);
  });

  test('no image on the listing pages is broken', async ({ page, homePage, productsPage }) => {
    // A broken image is a wasted request and a hole in the page.
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
    // A leak shows up as growth per repetition: elements or event listeners
    // left behind each time. One cycle first, so one-off setup isn't
    // counted as a leak; then five more, and the totals must not have moved.
    const devtools = await context.newCDPSession(page);
    await devtools.send('Performance.enable');
    const snapshot = async () => {
      // Force a garbage collection first: listeners that were removed but
      // not yet collected still count, and would look like a leak
      // (confirmed - without this line the count reads 14 higher).
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
    // Measured: no growth at all. The small allowance absorbs noise.
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
    // Measured: 1-2s each.
    expect(loginMs).toBeLessThan(10_000);
    expect(logoutMs).toBeLessThan(10_000);
  });
});

/**
 * Known front-end problems on the live site, each confirmed by measurement.
 * `test.fail()` inverts the result: the test passes while the problem
 * exists and turns red the day the site fixes it - the cue to remove the
 * marker and keep the test as a normal regression check (same pattern as
 * the other advanced suites).
 */
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
        // Twice the displayed width is the allowance for high-density
        // screens; beyond that the extra pixels are never seen.
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
