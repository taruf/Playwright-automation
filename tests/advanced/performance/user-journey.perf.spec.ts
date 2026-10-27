import { test, expect } from '@fixtures/fixtures';

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
      // search click is ignored until the page has fully loaded
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
    // roughly slow 4G
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
