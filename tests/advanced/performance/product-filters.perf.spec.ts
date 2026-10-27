import { test, expect } from '@fixtures/fixtures';

const STEP_BUDGET_MS = 15_000;
const FILTERING_BUDGET_MS = 40_000;

test.describe('product filter performance', () => {
  test('category and brand filters each show their products within budget', async ({
    page,
    productsPage,
  }) => {
    const timings: Record<string, number> = {};

    // wait for load after each navigation - the accordion ignores clicks until its script runs
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
      // sidebar label includes the count, e.g. "(6)Polo"
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

    for (const [step, ms] of Object.entries(timings)) {
      expect.soft(ms, step).toBeLessThan(STEP_BUDGET_MS);
    }
    expect(total).toBeLessThan(FILTERING_BUDGET_MS);
  });
});
