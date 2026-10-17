import { test, expect } from '@fixtures/fixtures';

/**
 * Product filter performance: how long a shopper waits each time they
 * narrow the catalog by category or brand from the products page sidebar.
 * Filtering is how most shoppers move around a catalog, and each filter
 * here is a full page load (not an in-page update), so every switch costs
 * a complete round-trip.
 *
 * Like the rest of this folder it is a smoke check, not a load test: one
 * shopper, one pass, generous budgets (see homepage.perf.spec.ts for why).
 */
const STEP_BUDGET_MS = 15_000;
const FILTERING_BUDGET_MS = 40_000;

test.describe('product filter performance', () => {
  test('category and brand filters each show their products within budget', async ({
    page,
    productsPage,
  }) => {
    const timings: Record<string, number> = {};

    // Each step ends on the thing the shopper is waiting to see, so the
    // number is "time until I can carry on", not "time until the click".
    // The navigation steps also wait for the load event: the sidebar
    // accordion is driven by a script, and clicking it before that script
    // has loaded does nothing (same late-binding caution as the search box
    // in user-journey.perf.spec.ts).
    async function timedStep(name: string, action: () => Promise<void>): Promise<void> {
      await test.step(name, async () => {
        const startedAt = Date.now();
        await action();
        timings[name] = Date.now() - startedAt;
      });
    }

    await timedStep('open products', async () => {
      await productsPage.goto();
      await expect(productsPage.listingTitle).toHaveText(/all products/i);
    });

    await timedStep('expand Women', async () => {
      // In-page only - this times the accordion animation, not the server.
      await productsPage.categoryToggle('Women').click();
      await expect(productsPage.subcategoryLink('Women', 'Dress')).toBeVisible();
    });

    await timedStep('filter by Women > Dress', async () => {
      await productsPage.subcategoryLink('Women', 'Dress').click();
      await page.waitForURL(/\/category_products\/\d+$/);
      await expect(productsPage.listingTitle).toHaveText(/women - dress products/i);
      await expect(productsPage.productNames.first()).toBeVisible();
    });

    await timedStep('switch to Men > Tshirts', async () => {
      await productsPage.categoryToggle('Men').click();
      await productsPage.subcategoryLink('Men', 'Tshirts').click();
      await page.waitForURL(/\/category_products\/\d+$/);
      await expect(productsPage.listingTitle).toHaveText(/men - tshirts products/i);
      await expect(productsPage.productNames.first()).toBeVisible();
    });

    await timedStep('filter by brand Polo', async () => {
      // The sidebar states each brand's product count, e.g. "(6)Polo" -
      // checking the list against it proves this step waited for the real
      // filtered list, not a half-rendered or wrong one.
      const brandLabel = await productsPage.brandLink('Polo').innerText();
      const expectedCount = Number(brandLabel.match(/\((\d+)\)/)?.[1]);

      await productsPage.brandLink('Polo').click();
      await page.waitForURL(/\/brand_products\/Polo$/);
      await expect(productsPage.listingTitle).toHaveText(/brand - polo products/i);
      await expect(productsPage.productNames).toHaveCount(expectedCount);
    });

    const total = Object.values(timings).reduce((sum, ms) => sum + ms, 0);
    await test.info().attach('filter-timings', {
      body: JSON.stringify({ ...timings, total }, null, 2),
      contentType: 'application/json',
    });

    // Soft, so the report shows every slow step rather than only the first.
    for (const [step, ms] of Object.entries(timings)) {
      expect.soft(ms, step).toBeLessThan(STEP_BUDGET_MS);
    }
    expect(total).toBeLessThan(FILTERING_BUDGET_MS);
  });
});
