import { test, expect } from '@fixtures/fixtures';

/**
 * Fixtures & test organization. The `test` imported above isn't the default
 * from @playwright/test - it's the project's extended version defined in
 * src/fixtures/fixtures.ts, which hands every test ready-made page objects
 * (homePage, productsPage, apiClient, ...) instead of each spec constructing
 * `new HomePage(page)` by hand. See that file for how a fixture is declared.
 */
test.describe('fixtures and organization', () => {
  test.beforeEach(async ({ homePage }) => {
    // Shared setup lives in one beforeEach instead of being repeated in
    // every test body.
    await homePage.goto();
  });

  test('a page-object fixture replaces manual construction', async ({ homePage }) => {
    await expect(homePage.productsLink).toBeVisible();
  });

  test('the apiClient fixture is available alongside the UI fixtures', async ({ apiClient }) => {
    // Fixtures aren't limited to page objects - apiClient wraps Playwright's
    // `request` context the same way, so a test can mix API and UI fixtures
    // freely (see hybrid/api-setup-ui-verify.spec.ts for a full example).
    const { responseCode, products } = await apiClient.getProductsList();
    expect(responseCode).toBe(200);
    expect(products.length).toBeGreaterThan(0);
  });

  test('test.step breaks a multi-part flow into a readable report', async ({
    homePage,
    productsPage,
  }) => {
    await test.step('navigate to products', async () => {
      await productsPage.goto();
    });

    await test.step('search for a product', async () => {
      await productsPage.search('Top');
      await expect(productsPage.searchedProductsHeading).toBeVisible();
    });

    await test.step('go back home', async () => {
      await homePage.goto();
      await expect(homePage.productsLink).toBeVisible();
    });
  });
});
