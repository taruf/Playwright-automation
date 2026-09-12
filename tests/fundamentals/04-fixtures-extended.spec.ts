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
    expect(products.length).toBeGreaterThan(5);
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

// A fixture body is split by `await use(...)`: everything before it is setup,
// everything after it is teardown. This fixture is defined here, local to
// this file (via `test.extend`), rather than added to fixtures.ts, since
// nothing else needs it - it exists only to make that split observable.
const executionOrder: string[] = [];

const fixtureTeardownTest = test.extend<{ trackedResource: void }>({
  trackedResource: async ({}, use) => {
    executionOrder.push('setup'); // runs before the test body
    await use();
    executionOrder.push('teardown'); // runs once the test body has returned
  },
});

fixtureTeardownTest.describe('fixture teardown - the code after `use()`', () => {
  fixtureTeardownTest(
    'a fixture keeps running after the test body returns to release what it set up',
    async ({ trackedResource }) => {
      executionOrder.push('test body');
      // Teardown hasn't happened yet here - the fixture is paused at
      // `await use()` for as long as this test function is running.
      expect(executionOrder).toEqual(['setup', 'test body']);
    },
  );

  fixtureTeardownTest.afterAll(() => {
    // Fixture teardown runs after the test (and any afterEach hooks) but
    // before afterAll, so by now 'teardown' is guaranteed to have been
    // pushed.
    expect(executionOrder).toEqual(['setup', 'test body', 'teardown']);
  });
});
