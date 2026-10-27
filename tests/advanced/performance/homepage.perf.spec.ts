import type { Page } from '@playwright/test';
import { test, expect } from '@fixtures/fixtures';
import { env } from '@utils/env';

// Smoke checks, not a load test - it's a shared public site.
// Time budgets are loose (timings vary a lot run to run); size/count
// budgets are tight since those were stable across runs.
const TIME_BUDGET_MS = {
  timeToFirstByte: 8_000,
  firstContentfulPaint: 10_000,
  largestContentfulPaint: 12_000,
  domContentLoaded: 10_000,
  load: 15_000,
};

// Core Web Vitals "good" thresholds
const MAX_CUMULATIVE_LAYOUT_SHIFT = 0.1;
const MAX_TOTAL_BLOCKING_TIME_MS = 300;
const MAX_DOM_NODES = 1_500;

interface PageBudget {
  name: string;
  path: string;
  maxRequests: number;
  maxTransferKb: number;
}

// measured requests/KB: 58/3760, 56/3385, 24/321, 19/280, 21/282, 23/397
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

async function loadAndMeasure(page: Page, path: string) {
  // observers must be installed before navigation
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

    // TBT = sum of (task duration - 50ms) for long tasks
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
        const failed = metrics.resources
          .filter((resource) => resource.status >= 400)
          .map((resource) => `${resource.status} ${resource.url}`);
        expect.soft(failed).toEqual([]);
      });

      await test.step("the site's own text assets are compressed", () => {
        const uncompressed = metrics.ownResources
          .filter((resource) => ['document', 'script', 'stylesheet'].includes(resource.type))
          .filter((resource) => resource.transferBytes > 1024 && !resource.contentEncoding)
          .map((resource) => resource.url);
        expect.soft(uncompressed).toEqual([]);
      });

      await test.step("the site's own scripts and styles are cacheable", () => {
        // header check instead of a reload: routing (ad blocking) disables the
        // HTTP cache. /cdn-cgi/ scripts are Cloudflare's, so only /static/.
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
    expect(elapsedMs).toBeLessThan(8_000);
  });

  test('adding to cart shows the confirmation popup within budget', async ({ productsPage }) => {
    await productsPage.goto();

    const startedAt = Date.now();
    await productsPage.addToCartFromListing(1);
    const elapsedMs = Date.now() - startedAt;

    test.info().annotations.push({ type: 'add-to-cart-ms', description: String(elapsedMs) });
    expect(elapsedMs).toBeLessThan(8_000);
  });
});

test.describe('API responsiveness', () => {
  test('catalog endpoints answer within budget with a small payload', async ({ request }) => {
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

// Known site issues - test.fail() until fixed.
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
