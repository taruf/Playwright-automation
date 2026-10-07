import { test, expect } from '@fixtures/fixtures';

/**
 * Journey-level performance: how long a real shopper waits across a whole
 * flow, not just on one page load (that's homepage.perf.spec.ts). A site can
 * pass every single-page budget and still feel slow if each of six steps
 * takes three seconds - this is the test that notices.
 *
 * Like the rest of this folder it is a smoke check, not a load test: one
 * user, one pass, generous budgets (see homepage.perf.spec.ts for why).
 */
const STEP_BUDGET_MS = 10_000;
const JOURNEY_BUDGET_MS = 35_000;
const PRODUCT_ID = 1;

test.describe('shopping journey performance', () => {
  test('browse -> search -> product -> add to cart -> cart stays within budget', async ({
    page,
    homePage,
    productsPage,
    cartPage,
  }) => {
    const timings: Record<string, number> = {};

    // Each step ends on the thing the shopper is waiting to see, so the
    // number is "time until I can carry on", not "time until the click".
    async function timedStep(name: string, action: () => Promise<void>): Promise<void> {
      await test.step(name, async () => {
        const startedAt = Date.now();
        await action();
        timings[name] = Date.now() - startedAt;
      });
    }

    await timedStep('open homepage', async () => {
      await homePage.goto();
      await expect(homePage.productsLink).toBeVisible();
    });

    await timedStep('go to products', async () => {
      await homePage.productsLink.click();
      // Waits for the load event, not just the search box: the site attaches
      // the Search button's click handler late, so a click before load is
      // silently ignored (confirmed - it made this test fail intermittently).
      await page.waitForURL(/\/products$/);
      await expect(productsPage.searchInput).toBeVisible();
    });

    await timedStep('search for a product', async () => {
      await productsPage.search('Dress');
      await expect(productsPage.searchedProductsHeading).toBeVisible();
    });

    await timedStep('open product details', async () => {
      await productsPage.openProductDetails(PRODUCT_ID);
      await expect(productsPage.productName).toBeVisible();
    });

    await timedStep('add to cart', async () => {
      await productsPage.addToCartFromDetails();
      await expect(productsPage.viewCartLink).toBeVisible();
    });

    await timedStep('view cart', async () => {
      await productsPage.viewCartLink.click();
      await expect(cartPage.rowFor(PRODUCT_ID)).toBeVisible();
    });

    const total = Object.values(timings).reduce((sum, ms) => sum + ms, 0);
    await test.info().attach('journey-timings', {
      body: JSON.stringify({ ...timings, total }, null, 2),
      contentType: 'application/json',
    });

    // Soft, so the report shows every slow step rather than only the first.
    for (const [step, ms] of Object.entries(timings)) {
      expect.soft(ms, step).toBeLessThan(STEP_BUDGET_MS);
    }
    expect(total).toBeLessThan(JOURNEY_BUDGET_MS);
  });
});

test.describe('slow network', () => {
  test('the login page is usable on a slow mobile connection', async ({
    page,
    context,
    signupLoginPage,
  }) => {
    // Throttling happens inside the browser (Chrome DevTools Protocol), so
    // it simulates a slow user without putting any extra load on the site.
    // Roughly "slow 4G": 1.6 Mbit/s down, 750 kbit/s up, 150ms latency.
    const devtools = await context.newCDPSession(page);
    await devtools.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
      latency: 150,
    });

    const startedAt = Date.now();
    await signupLoginPage.goto();
    await expect(signupLoginPage.loginButton).toBeVisible();
    const elapsedMs = Date.now() - startedAt;

    test.info().annotations.push({ type: 'slow-network-ms', description: String(elapsedMs) });
    expect(elapsedMs).toBeLessThan(20_000);
  });
});
