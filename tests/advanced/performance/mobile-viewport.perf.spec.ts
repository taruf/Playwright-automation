import { test, expect } from '@fixtures/fixtures';

const LCP_BUDGET_MS = 12_000;
const LOAD_BUDGET_MS = 15_000;
const MAX_CUMULATIVE_LAYOUT_SHIFT = 0.1;
const PAGES = [
  { name: 'homepage', path: '/' },
  { name: 'products', path: '/products' },
  { name: 'product details', path: '/product_details/1' },
  { name: 'cart', path: '/view_cart' },
];

interface MobileVitals {
  largestContentfulPaint: number;
  cumulativeLayoutShift: number;
}

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});

test.describe('mobile viewport page loads', () => {
  for (const { name, path } of PAGES) {
    test(`${name} (${path}) loads within budget on a phone-sized screen`, async ({ page }) => {
      await page.addInitScript(() => {
        const vitals = { largestContentfulPaint: 0, cumulativeLayoutShift: 0 };
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
      });

      await page.goto(path, { waitUntil: 'load' });

      const metrics = await page.evaluate(() => {
        const [nav] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
        const vitals = (window as unknown as { __vitals: MobileVitals }).__vitals;
        return {
          load: nav.loadEventEnd - nav.startTime,
          ...vitals,
          innerWidth: window.innerWidth,
        };
      });

      await test.info().attach('mobile-metrics', {
        body: JSON.stringify(metrics, null, 2),
        contentType: 'application/json',
      });

      expect(metrics.innerWidth, 'page should honour the mobile viewport').toBe(390);
      expect(metrics.largestContentfulPaint, 'something was painted').toBeGreaterThan(0);
      expect.soft(metrics.largestContentfulPaint, 'LCP').toBeLessThan(LCP_BUDGET_MS);
      expect.soft(metrics.load, 'load').toBeLessThan(LOAD_BUDGET_MS);
      expect(metrics.cumulativeLayoutShift, 'CLS').toBeLessThan(MAX_CUMULATIVE_LAYOUT_SHIFT);
    });
  }
});
