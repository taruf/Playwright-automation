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
  }) => {
    await productsPage.goto();
    await productsPage.search('Dress');

    // Anti-pattern to avoid: reading .length off a snapshot array taken
    // immediately after the click would race the AJAX response.
    const count = await productsPage.productCards.count();
    expect(count).toBeGreaterThan(0);
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

    // GOOD: let the assertion itself do the polling.
    await expect(page).toHaveTitle('Automation Exercise');
  });
});
