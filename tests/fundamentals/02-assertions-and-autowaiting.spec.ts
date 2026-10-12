import { test, expect } from '@fixtures/fixtures';

/**
 * Web-first assertions (`expect(locator)...`) retry against the page until
 * they pass or time out, which is what actually replaces explicit waits and
 * sleeps from Selenium-style code. Plain assertions on a value you read once
 * (`expect(await locator.textContent()).toBe(...)`) don't get that retry, so
 * they're flaky exactly when timing matters.
 */
test.describe('assertions and auto-waiting', () => {
  test('web-first assertions wait for async content to settle', async ({ productsPage }) => {
    await productsPage.goto();

    // The search results are injected by AJAX after the click - there is no
    // full page navigation to await. expect(...).toBeVisible() polls until
    // the heading exists instead of failing immediately.
    await productsPage.search('Dress');
    await expect(productsPage.searchedProductsHeading).toBeVisible();
    await expect(productsPage.productCards.first()).toBeVisible();
  });

  test('toHaveCount waits for the final number of matches, not the first render', async ({
    productsPage,
    apiClient,
  }) => {
    await productsPage.goto();

    // Ground truth from the API, not a hardcoded number - this is a shared
    // public site, so the catalog (and therefore the match count for
    // "Dress") isn't guaranteed to stay fixed forever (see flow-01-* for the
    // same reasoning applied to product names instead of a count).
    const { products } = await apiClient.searchProduct('Dress');

    await productsPage.search('Dress');

    // Anti-pattern to avoid (confirmed live, not assumed): productsPage.search()
    // returns as soon as the click fires, before the AJAX results have
    // rendered. A plain snapshot read right after it -
    //   const count = await productsPage.productCards.count();
    //   expect(count).toBeGreaterThan(0);
    // - can catch the pre-search count instead of the filtered one, and
    // `toBeGreaterThan(0)` is too weak an assertion to ever notice, since
    // both counts are greater than zero. toHaveCount doesn't have that gap:
    // it retries until the locator's match count reaches the expected
    // number (or times out), so it needs no separate "wait for the heading"
    // step first.
    await expect(productsPage.productCards).toHaveCount(products.length);
  });

  test('an anti-pattern worth recognizing: a snapshot read fights auto-waiting', async ({
    page,
  }) => {
    await page.goto('/');

    // BAD (commented out on purpose): reading text once and asserting on the
    // plain string throws the instant the DOM isn't ready yet, instead of
    // retrying:
    //   const text = await page.locator('title-that-loads-late').textContent();
    //   expect(text).toBe('Automation Exercise'); // no retry - flaky under load

    await expect(page).toHaveTitle('Automation Exercise');
  });

  test('expect.poll retries an arbitrary function, not just a locator', async ({
    productsPage,
    apiClient,
  }) => {
    await productsPage.goto();

    const { products } = await apiClient.searchProduct('Dress');
    await productsPage.search('Dress');

    // toHaveCount above only works because productCards is a Locator.
    // expect.poll is the general-purpose version of the same idea: it
    // retries ANY async function - here, deliberately the same .count()
    // snapshot the test above warns is flaky on its own - until the return
    // value satisfies the matcher, or it times out. Reach for this whenever
    // the thing you need to wait on isn't expressible as a Locator (a
    // computed value, a call combining several fixtures, a database read).
    await expect.poll(() => productsPage.productCards.count()).toBe(products.length);
  });

  test('actions auto-wait too, not just assertions', async ({ productsPage }) => {
    await productsPage.goto();
    await productsPage.search('Dress');

    // Every test above waits via expect(...) before touching the page again.
    // This one doesn't - no wait for searchedProductsHeading, no
    // expect(...).toBeVisible() first. .click() has its own, separate
    // auto-waiting: it retries until its target exists, is visible, stable,
    // and able to receive events, before ever acting. Confirmed live (took
    // ~4s against the real AJAX response): this reliably reaches a product's
    // detail page even though the search results haven't rendered yet the
    // instant search() returns - the click itself is what waits.
    await productsPage.productCards.first().getByRole('link', { name: 'View Product' }).click();

    await expect(productsPage.productName).toBeVisible();
  });

  test('expect.soft records a failure but lets the test keep running, unlike a normal expect', async ({
    page,
  }) => {
    // Deliberately designed to fail, to demonstrate the contrast below
    // honestly instead of faking a pass. test.fail() tells Playwright this
    // test is expected to fail - if it does, the run is reported as an
    // expected failure (still green in the summary), not a real one.
    test.fail();

    await page.goto('/');

    const reached: string[] = [];

    // A normal expect() throws the instant it fails, aborting the test
    // right there. expect.soft() records the failure and lets execution
    // continue - useful for checking several independent things without one
    // early failure hiding the rest.
    await expect.soft(page.locator('#does-not-exist-a')).toBeVisible();
    reached.push('after first soft assertion');

    await expect.soft(page.locator('#does-not-exist-b')).toBeVisible();
    reached.push('after second soft assertion');

    // Both pushes running - instead of execution stopping dead at the first
    // soft failure - is the proof. The test still ends up failed overall
    // (Playwright fails a test with any soft-assertion failures once it
    // finishes), which is exactly what test.fail() above expects.
    expect(reached).toEqual(['after first soft assertion', 'after second soft assertion']);
  });

  test('toBeHidden retries for absence the same way toBeVisible retries for presence', async ({
    page,
  }) => {
    await page.goto('/');

    // A controlled delay instead of relying on the live site's incidental
    // timing (unlike several tests above) - an element that exists now and
    // removes itself 500ms later is enough to tell a retrying assertion
    // apart from a one-shot check, deterministically.
    await page.evaluate(() => {
      const el = document.createElement('div');
      el.id = 'delayed-hide-demo';
      el.textContent = 'temporary';
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 500);
    });

    const locator = page.locator('#delayed-hide-demo');

    // It's genuinely there right now - a one-shot check sees it.
    // eslint-disable-next-line playwright/prefer-web-first-assertions -- the plain isVisible() read is the deliberate anti-pattern being contrasted below, not production code.
    expect(await locator.isVisible()).toBe(true);

    // toBeHidden() - Playwright's dedicated matcher for "not there/not
    // visible", preferred over negating toBeVisible() - is web-first too:
    // it polls until the element is gone (or times out), the same retrying
    // toBeVisible() gets for presence. A plain one-shot check taken this
    // instant would see it as still visible and wrongly fail.
    await expect(locator).toBeHidden();
  });
});
