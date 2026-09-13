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

/**
 * Every fixture function has the same shape:
 *
 *   async ({ ...deps }, use) => {
 *     // 1. SETUP    - runs once, before the test body, to build the value
 *     await use(theValue);
 *     // 2. TEARDOWN - runs once the test body has *returned*, to release it
 *   }
 *
 * `use(...)` is the pause button: the fixture function is suspended on that
 * line for as long as the test is running, then resumes into its own
 * teardown code the moment the test finishes (pass, fail, or throw - the
 * line after `use()` still runs, the same way a `finally` block would).
 *
 * Not every fixture needs a teardown half. `apiClient` in fixtures.ts is
 * setup-only - `await use(new ApiClient(request, env.apiBaseURL))` with
 * nothing after it - because Playwright's own `request` context is what
 * needs releasing, and Playwright releases that itself. Compare that to a
 * fixture that would genuinely leak state without a teardown line, e.g.
 * (illustrative - not an actual fixture in this repo):
 *
 *   loggedInUser: async ({ signupLoginPage, homePage }, use) => {
 *     await signupLoginPage.login(email, password);   // SETUP
 *     await use(email);
 *     await homePage.logoutLink.click();               // TEARDOWN
 *   }
 *
 * Skip that last line and every test after the one using `loggedInUser`
 * would inherit an already-authenticated browser context - the teardown
 * half is what keeps fixtures composable instead of bleeding state from one
 * test into the next.
 *
 * Two more things this file's fixture is deliberately minimal about, that a
 * fixture with real dependencies/output wouldn't be:
 *  - `{}` as the first argument means `trackedResource` doesn't depend on
 *    any other fixture. `loggedInUser` above, by contrast, destructures
 *    `signupLoginPage` and `homePage` out of that same first argument to get
 *    page objects it can act through - fixtures can depend on other
 *    fixtures the same way a test does.
 *  - The fixture's type is `void` - it hands the test nothing to read, so
 *    `trackedResource` is destructured in the test's args below but never
 *    referenced in the test body. That destructuring still matters: it's
 *    what tells Playwright to run this fixture for this test at all. A
 *    fixture never named in a test's argument list never executes, setup or
 *    teardown, for that test.
 *
 * The fixture below is declared with `test.extend` right here in the spec
 * file, not added to src/fixtures/fixtures.ts, because it isn't a real page
 * object or API client - it only exists to make the setup/teardown split
 * visible via the `executionOrder` array.
 */
const executionOrder: string[] = [];

const fixtureTeardownTest = test.extend<{ trackedResource: void }>({
  trackedResource: async ({}, use) => {
    executionOrder.push('setup'); // before `use()` -> runs before the test body
    await use();
    executionOrder.push('teardown'); // after `use()` -> runs after the test body
  },
});

fixtureTeardownTest.describe('fixture teardown - the code after `use()`', () => {
  fixtureTeardownTest(
    'a fixture keeps running after the test body returns to release what it set up',
    async ({ trackedResource }) => {
      executionOrder.push('test body');
      // Teardown can't have happened yet: the fixture function is still
      // paused at `await use()`, waiting for this very test function to
      // return before it continues on to its own teardown line.
      expect(executionOrder).toEqual(['setup', 'test body']);
    },
  );

  fixtureTeardownTest.afterAll(() => {
    // Full order for one test: fixture setup -> beforeEach hooks (none here)
    // -> test body -> afterEach hooks (none here) -> fixture teardown ->
    // afterAll. Teardown always lands before afterAll, so 'teardown' is
    // guaranteed to already be in the array by the time this runs.
    expect(executionOrder).toEqual(['setup', 'test body', 'teardown']);
  });
});
