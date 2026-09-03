import { test, expect } from '@fixtures/fixtures';

/**
 * This is a smoke-level performance check, not a load test. It captures one
 * real page load's Navigation Timing and asserts it's within a generous
 * budget - useful for catching "the homepage suddenly takes 20 seconds"
 * regressions.
 *
 * It is deliberately NOT a load-generation tool: automationexercise.com is a
 * small shared public site, not infrastructure meant to absorb concurrent
 * virtual users. Real load/perf testing (k6, Artillery, Lighthouse CI)
 * belongs against a self-hosted target you control or have permission to
 * load-test - point one of those tools at a local instance, not this site.
 */
test.describe('homepage performance smoke check', () => {
  test('page load timing stays within a generous budget', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });

    const timing = await page.evaluate(() => {
      const [nav] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      return {
        domContentLoaded: nav.domContentLoadedEventEnd - nav.startTime,
        load: nav.loadEventEnd - nav.startTime,
      };
    });

    await test.info().attach('navigation-timing', {
      body: JSON.stringify(timing, null, 2),
      contentType: 'application/json',
    });

    // Generous on purpose - this is a public site on shared infrastructure
    // with variance outside our control. The point is to catch order-of-
    // magnitude regressions, not to chase milliseconds.
    expect(timing.domContentLoaded).toBeLessThan(10_000);
    expect(timing.load).toBeLessThan(15_000);
  });
});
