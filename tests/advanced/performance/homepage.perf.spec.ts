import type { Page } from '@playwright/test';
import { test, expect } from '@fixtures/fixtures';
import { env } from '@utils/env';

/**
 * This is a smoke-level performance check, not a load test. Each test makes
 * one real page load (or one real user action) and asserts it's within a
 * budget - useful for catching "the homepage suddenly takes 20 seconds" or
 * "someone added a 5MB image" regressions.
 *
 * It is deliberately NOT a load-generation tool: automationexercise.com is a
 * small shared public site, not infrastructure meant to absorb concurrent
 * virtual users. Real load/perf testing (k6, Artillery, Lighthouse CI)
 * belongs against a self-hosted target you control or have permission to
 * load-test - point one of those tools at a local instance, not this site.
 * For the same reason every page below is loaded once and checked several
 * ways, rather than once per check.
 *
 * Two kinds of budget live here, on purpose:
 *  - TIME budgets are very generous. Timing on a shared public site varies
 *    widely between runs (measured: 0.3s to 4.6s to first byte for the same
 *    page), so these only catch order-of-magnitude regressions.
 *  - SIZE and COUNT budgets (bytes, requests, DOM nodes, layout shift) are
 *    tight - roughly 25-50% above measured values - because they came out
 *    the same on every run. They're the ones that catch real regressions.
 */
const TIME_BUDGET_MS = {
  timeToFirstByte: 8_000,
  firstContentfulPaint: 10_000,
  largestContentfulPaint: 12_000,
  domContentLoaded: 10_000,
  load: 15_000,
};

// Google's "good" thresholds for the two Core Web Vitals that don't depend
// on network speed, so they can be held to the real standard.
const MAX_CUMULATIVE_LAYOUT_SHIFT = 0.1;
const MAX_TOTAL_BLOCKING_TIME_MS = 300;
const MAX_DOM_NODES = 1_500;

interface PageBudget {
  name: string;
  path: string;
  maxRequests: number;
  maxTransferKb: number;
}

// Measured (ads blocked, identical across three runs): requests / KB =
// 58/3760, 56/3385, 24/321, 19/280, 21/282, 23/397.
const PAGE_BUDGETS: PageBudget[] = [
  { name: 'homepage', path: '/', maxRequests: 75, maxTransferKb: 4_700 },
  { name: 'products', path: '/products', maxRequests: 72, maxTransferKb: 4_300 },
  { name: 'product details', path: '/product_details/1', maxRequests: 32, maxTransferKb: 500 },
  { name: 'login', path: '/login', maxRequests: 26, maxTransferKb: 450 },
  { name: 'cart', path: '/view_cart', maxRequests: 28, maxTransferKb: 450 },
  { name: 'contact us', path: '/contact_us', maxRequests: 32, maxTransferKb: 600 },
];

interface ObservedVitals {
  largestContentfulPaint: number;
  cumulativeLayoutShift: number;
  totalBlockingTime: number;
}

interface LoadedResource {
  url: string;
  type: string;
  status: number;
  transferBytes: number;
  contentEncoding: string | undefined;
  cacheControl: string | undefined;
}

/** Loads `path` once and returns everything the checks below need. */
async function loadAndMeasure(page: Page, path: string) {
  // These three metrics only exist as a stream of browser events, so the
  // observers have to be installed before the page starts loading.
  await page.addInitScript(() => {
    const vitals = { largestContentfulPaint: 0, cumulativeLayoutShift: 0, totalBlockingTime: 0 };
    (window as unknown as { __vitals: typeof vitals }).__vitals = vitals;

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) vitals.largestContentfulPaint = entry.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
        if (!shift.hadRecentInput) vitals.cumulativeLayoutShift += shift.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });

    // Total Blocking Time: for every main-thread task over 50ms, the part
    // beyond 50ms is time the page could not respond to input.
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        vitals.totalBlockingTime += Math.max(0, entry.duration - 50);
      }
    }).observe({ type: 'longtask', buffered: true });
  });

  const pending: Promise<void>[] = [];
  const resources: LoadedResource[] = [];
  page.on('requestfinished', (request) => {
    pending.push(
      (async () => {
        const response = await request.response();
        const sizes = await request.sizes();
        resources.push({
          url: request.url(),
          type: request.resourceType(),
          status: response?.status() ?? 0,
          transferBytes: sizes.responseBodySize + sizes.responseHeadersSize,
          contentEncoding: response?.headers()['content-encoding'],
          cacheControl: response?.headers()['cache-control'],
        });
      })(),
    );
  });

  await page.goto(path, { waitUntil: 'load' });
  await Promise.all(pending);

  const browserMetrics = await page.evaluate(() => {
    const [nav] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    const [fcp] = performance.getEntriesByName('first-contentful-paint');
    const vitals = (window as unknown as { __vitals: ObservedVitals }).__vitals;
    return {
      timeToFirstByte: nav.responseStart - nav.startTime,
      firstContentfulPaint: fcp?.startTime ?? 0,
      domContentLoaded: nav.domContentLoadedEventEnd - nav.startTime,
      load: nav.loadEventEnd - nav.startTime,
      ...vitals,
      domNodes: document.querySelectorAll('*').length,
    };
  });

  const ownResources = resources.filter((resource) => resource.url.startsWith(env.baseURL));
  const transferKb = Math.round(resources.reduce((sum, r) => sum + r.transferBytes, 0) / 1024);

  await test.info().attach('performance-metrics', {
    body: JSON.stringify(
      {
        ...browserMetrics,
        requests: resources.length,
        transferKb,
        largestResources: [...resources]
          .sort((a, b) => b.transferBytes - a.transferBytes)
          .slice(0, 5)
          .map((r) => `${Math.round(r.transferBytes / 1024)}KB ${r.type} ${r.url}`),
      },
      null,
      2,
    ),
    contentType: 'application/json',
  });

  return { ...browserMetrics, resources, ownResources, transferKb };
}

test.describe('page load budgets - one load per page, checked several ways', () => {
  for (const { name, path, maxRequests, maxTransferKb } of PAGE_BUDGETS) {
    test(`${name} (${path})`, async ({ page }) => {
      const metrics = await loadAndMeasure(page, path);

      // Soft assertions: one slow metric shouldn't hide the other results
      // from the report - the whole picture is the point of this test.
      await test.step('time budgets (generous)', () => {
        expect.soft(metrics.timeToFirstByte).toBeLessThan(TIME_BUDGET_MS.timeToFirstByte);
        expect.soft(metrics.firstContentfulPaint).toBeLessThan(TIME_BUDGET_MS.firstContentfulPaint);
        expect
          .soft(metrics.largestContentfulPaint)
          .toBeLessThan(TIME_BUDGET_MS.largestContentfulPaint);
        expect.soft(metrics.domContentLoaded).toBeLessThan(TIME_BUDGET_MS.domContentLoaded);
        expect.soft(metrics.load).toBeLessThan(TIME_BUDGET_MS.load);
      });

      await test.step('something was actually painted', () => {
        // Guards the time budgets above: 0 would pass every "less than".
        expect.soft(metrics.firstContentfulPaint).toBeGreaterThan(0);
        expect.soft(metrics.largestContentfulPaint).toBeGreaterThan(0);
      });

      await test.step('layout stability and main-thread blocking', () => {
        expect.soft(metrics.cumulativeLayoutShift).toBeLessThan(MAX_CUMULATIVE_LAYOUT_SHIFT);
        expect.soft(metrics.totalBlockingTime).toBeLessThan(MAX_TOTAL_BLOCKING_TIME_MS);
      });

      await test.step('page weight, request count and DOM size', () => {
        expect.soft(metrics.resources.length).toBeLessThanOrEqual(maxRequests);
        expect.soft(metrics.transferKb).toBeLessThanOrEqual(maxTransferKb);
        expect.soft(metrics.domNodes).toBeLessThanOrEqual(MAX_DOM_NODES);
      });

      await test.step('no resource fails to load', () => {
        // A 404 for a script or image is a wasted round-trip at best and a
        // broken page at worst.
        const failed = metrics.resources
          .filter((resource) => resource.status >= 400)
          .map((resource) => `${resource.status} ${resource.url}`);
        expect.soft(failed).toEqual([]);
      });

      await test.step("the site's own text assets are compressed", () => {
        const uncompressed = metrics.ownResources
          .filter((resource) => ['document', 'script', 'stylesheet'].includes(resource.type))
          // Below ~1KB compression saves nothing worth the CPU.
          .filter((resource) => resource.transferBytes > 1024 && !resource.contentEncoding)
          .map((resource) => resource.url);
        expect.soft(uncompressed).toEqual([]);
      });

      await test.step("the site's own scripts and styles are cacheable", () => {
        // Checked from the response header, not by reloading: Playwright
        // turns the browser's HTTP cache off whenever request routing is
        // active (the `page` fixture's ad blocking), so a "second visit is
        // faster" test can't be run honestly through this fixture.
        // Scoped to /static/: the CDN injects its own helper scripts under
        // /cdn-cgi/, which the site doesn't control.
        const notCacheable = metrics.ownResources
          .filter((resource) => new URL(resource.url).pathname.startsWith('/static/'))
          .filter((resource) => ['script', 'stylesheet'].includes(resource.type))
          .filter((resource) => !/max-age=[1-9]\d{3,}/.test(resource.cacheControl ?? ''))
          .map((resource) => resource.url);
        expect.soft(notCacheable).toEqual([]);
      });
    });
  }
});

test.describe('interaction responsiveness', () => {
  test('a product search shows results within budget', async ({ productsPage }) => {
    await productsPage.goto();

    const startedAt = Date.now();
    await productsPage.search('Dress');
    await expect(productsPage.searchedProductsHeading).toBeVisible();
    const elapsedMs = Date.now() - startedAt;

    test.info().annotations.push({ type: 'search-ms', description: String(elapsedMs) });
    // Measured ~0.5s. Generous for the same reason as the load budgets.
    expect(elapsedMs).toBeLessThan(8_000);
  });

  test('adding to cart shows the confirmation popup within budget', async ({ productsPage }) => {
    await productsPage.goto();

    const startedAt = Date.now();
    await productsPage.addToCartFromListing(1);
    const elapsedMs = Date.now() - startedAt;

    test.info().annotations.push({ type: 'add-to-cart-ms', description: String(elapsedMs) });
    // Measured ~1.1s (the popup has its own fade-in animation).
    expect(elapsedMs).toBeLessThan(8_000);
  });
});

test.describe('API responsiveness', () => {
  test('catalog endpoints answer within budget with a small payload', async ({ request }) => {
    // Measured: ~0.4s and 5.5KB / 1.1KB. The size limit is what catches an
    // endpoint that starts returning far more data than its callers need.
    for (const endpoint of ['/productsList', '/brandsList']) {
      const startedAt = Date.now();
      const response = await request.get(`${env.apiBaseURL}${endpoint}`);
      const body = await response.body();
      const elapsedMs = Date.now() - startedAt;

      expect(elapsedMs, endpoint).toBeLessThan(5_000);
      expect(body.length, endpoint).toBeLessThan(100 * 1024);
    }
  });

  test('a product search through the API answers within budget', async ({ apiClient }) => {
    const startedAt = Date.now();
    const { responseCode } = await apiClient.searchProduct('top');
    const elapsedMs = Date.now() - startedAt;

    expect(responseCode).toBe(200);
    expect(elapsedMs).toBeLessThan(5_000);
  });
});

/**
 * Known performance problems on the live site, each confirmed by
 * measurement. `test.fail()` inverts the result: the test passes while the
 * problem exists and turns red the day the site fixes it - the cue to
 * remove the marker and keep the test as a normal regression check (same
 * pattern as the accessibility and security suites).
 */
test.describe('known performance problems (expected to fail until fixed)', () => {
  test('no single image on the homepage is larger than 300KB', async ({ page }) => {
    test.fail(true, 'One product image is ~600KB and two more are over 200KB');
    const { resources } = await loadAndMeasure(page, '/');

    const oversized = resources
      .filter((resource) => resource.type === 'image' && resource.transferBytes > 300 * 1024)
      .map((resource) => `${Math.round(resource.transferBytes / 1024)}KB ${resource.url}`);
    expect(oversized).toEqual([]);
  });

  test('product images are sent with a caching header', async ({ page }) => {
    test.fail(true, 'No Cache-Control on product images: ~3MB is re-downloaded on every visit');
    const { ownResources } = await loadAndMeasure(page, '/');

    const uncached = ownResources
      .filter((resource) => resource.type === 'image' && !resource.cacheControl)
      .map((resource) => resource.url);
    expect(uncached).toEqual([]);
  });
});
