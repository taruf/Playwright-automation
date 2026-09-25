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
 *
 * `loggedInUser` above is illustrative only - see
 * `dependentFixturesTest` further down for that same "a fixture depends on
 * another fixture" idea as real, running code (kept abstract - `outer` /
 * `inner` - instead of domain fixtures, so the order it produces is the only
 * thing being demonstrated).
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
  fixtureTeardownTest.afterAll(() => {
    // Full order for one test: fixture setup -> beforeEach hooks (none here)
    // -> test body -> afterEach hooks (none here) -> fixture teardown ->
    // afterAll. Teardown always lands before afterAll, so 'teardown' is
    // guaranteed to already be in the array by the time this runs.
    expect(executionOrder).toEqual(['setup', 'test body', 'teardown']);
  });

  fixtureTeardownTest(
    'a fixture keeps running after the test body returns to release what it set up',
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructuring the fixture is what triggers its setup/teardown; the value itself isn't needed here.
    async ({ trackedResource }) => {
      executionOrder.push('test body');
      // Teardown can't have happened yet: the fixture function is still
      // paused at `await use()`, waiting for this very test function to
      // return before it continues on to its own teardown line.
      expect(executionOrder).toEqual(['setup', 'test body']);
    },
  );
});

const dependencyOrder: string[] = [];

const dependentFixturesTest = test.extend<{ outer: void; inner: void }>({
  outer: async ({}, use) => {
    dependencyOrder.push('outer setup');
    await use();
    dependencyOrder.push('outer teardown');
  },
  // Destructuring `outer` out of the first argument is what makes `inner`
  // depend on it - the same way a test depends on a fixture by naming it in
  // its own argument list. Playwright resolves dependencies before
  // dependents, so `outer`'s setup always runs before `inner`'s.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructuring `outer` is what declares the dependency; the value itself isn't needed here.
  inner: async ({ outer }, use) => {
    dependencyOrder.push('inner setup');
    await use();
    dependencyOrder.push('inner teardown');
  },
});

dependentFixturesTest.describe('fixture dependencies - one fixture using another', () => {
  dependentFixturesTest.afterAll(() => {
    // Setup runs in dependency order (outer, then inner, since inner needs
    // outer to exist first); teardown unwinds in the opposite order (inner,
    // then outer) - the same LIFO order nested `finally` blocks would give.
    expect(dependencyOrder).toEqual([
      'outer setup',
      'inner setup',
      'test body',
      'inner teardown',
      'outer teardown',
    ]);
  });

  dependentFixturesTest(
    'a fixture that depends on another gets it set up first and torn down last',
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructuring `inner` is what triggers both fixtures' setup/teardown; the value itself isn't needed here.
    async ({ inner }) => {
      dependencyOrder.push('test body');
      expect(dependencyOrder).toEqual(['outer setup', 'inner setup', 'test body']);
    },
  );
});

/**
 * `{ auto: true }` is the one exception to the rule stated above ("a fixture
 * never named in a test's argument list never executes"): an auto fixture
 * runs for every test in its scope whether or not the test ever destructures
 * it - useful for a cross-cutting step (seeding state, starting a trace,
 * asserting on console errors) that every test needs without every test
 * having to remember to ask for it.
 */
const autoFixtureOrder: string[] = [];

const autoFixtureTest = test.extend<{ tracker: void }>({
  tracker: [
    async ({}, use) => {
      autoFixtureOrder.push('auto setup');
      await use();
      autoFixtureOrder.push('auto teardown');
    },
    { auto: true },
  ],
});

autoFixtureTest.describe('automatic fixtures - the exception to "never named, never runs"', () => {
  autoFixtureTest.afterAll(() => {
    expect(autoFixtureOrder).toEqual(['auto setup', 'test body', 'auto teardown']);
  });

  autoFixtureTest('an auto fixture runs even though this test never destructures it', async () => {
    // No fixture at all is named in this test's argument list - an ordinary
    // fixture (like `trackedResource` or `inner` above) would simply never
    // run for it. `tracker`'s `{ auto: true }` option is what runs it anyway.
    autoFixtureOrder.push('test body');
    expect(autoFixtureOrder).toEqual(['auto setup', 'test body']);
  });
});

/**
 * Every fixture above is test-scoped (Playwright's default): set up fresh
 * and torn down once per test, exactly like `trackedResource` at the top of
 * this file. `{ scope: 'worker' }` changes that - the fixture is set up
 * once per worker *process* and the same instance is handed to every test
 * in that worker that asks for it, only torn down when the worker itself
 * shuts down. Good for something genuinely expensive to build that doesn't
 * need per-test isolation (a shared auth session, a DB connection pool);
 * wrong for anything a test mutates, since every test in the worker shares
 * that exact instance.
 */
const workerSetupCalls: number[] = [];

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Playwright's own signature for "no test-scoped fixtures, only worker-scoped" is test.extend<{}, WorkerFixtures>(); Record<string, never> looks equivalent but breaks type inference on the fixture's provided value here.
const workerScopedTest = test.extend<{}, { sharedId: number }>({
  sharedId: [
    async ({}, use) => {
      workerSetupCalls.push(workerSetupCalls.length + 1);
      await use(workerSetupCalls.length);
    },
    { scope: 'worker' },
  ],
});

workerScopedTest.describe(
  'worker-scoped fixtures - set up once, reused by every test in the worker',
  () => {
    // Serial mode is what makes this demonstration reliable: it guarantees
    // both tests below run in the same worker process. Without it, this
    // project's `fullyParallel: true` could schedule them onto separate
    // workers - and a worker-scoped fixture gets its own fresh instance per
    // worker, which would quietly break the exact thing being shown here.
    workerScopedTest.describe.configure({ mode: 'serial' });

    workerScopedTest(
      'the first test in the worker triggers the fixture setup',
      async ({ sharedId }) => {
        expect(sharedId).toBe(1);
        expect(workerSetupCalls).toHaveLength(1);
      },
    );

    workerScopedTest(
      'a second test in the same worker reuses that instance instead of building a new one',
      async ({ sharedId }) => {
        // Same value as the previous test, and setup still only ran once -
        // a test-scoped fixture like `trackedResource` would have set up
        // fresh again here.
        expect(sharedId).toBe(1);
        expect(workerSetupCalls).toHaveLength(1);
      },
    );
  },
);
