import { test, expect } from '@fixtures/fixtures';

/**
 * Locators the Playwright way: prefer user-facing, role-based locators over
 * CSS/XPath, and let Playwright's built-in strict mode catch ambiguous
 * selectors for you instead of silently clicking the wrong element.
 */
test.describe('locators', () => {
  test('role-based locators find the primary navigation', async ({ page }) => {
    await page.goto('/');

    // getByRole targets the accessibility tree, the same way a screen reader
    // or a real user would find things - by what they ARE, not by class names.
    await expect(page.getByRole('link', { name: 'Products' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Contact us' })).toBeVisible();

    // Careful with `exact: true`: this site renders nav links as
    // "<i class=...></i> Signup / Login", and the icon's whitespace becomes
    // part of the computed accessible name (" Signup / Login", leading
    // space). An exact match against the trimmed string finds nothing - not
    // because the element is missing, but because the name isn't quite what
    // it looks like. A loose (substring) match is the right tool here.
    await expect(page.getByRole('link', { name: 'Signup / Login' })).toBeVisible();
  });

  test('every product card duplicates its "Add to cart" link - strict mode catches it', async ({
    page,
  }) => {
    await page.goto('/products');

    const firstCard = page.locator('.product-image-wrapper').first();

    // This site renders each product twice inside one card: once in the
    // always-visible .productinfo block, and again in a .product-overlay
    // shown on hover. A locator scoped only to the card still matches both,
    // so asking Playwright to treat it as a single element throws a strict
    // mode violation - the same failure we hit for real fixing the very
    // first test in this repo (see docs/ai-validation-process.md, entry #1).
    await expect(firstCard.getByText('Add to cart')).toHaveCount(2);

    // The fix is to scope further, not to reach for .first()/nth() as a
    // reflex - .first() would silently pass even if a future markup change
    // reordered the two blocks. Scoping to the block that's actually visible
    // by default expresses the real intent.
    const visibleAddToCart = firstCard.locator('.productinfo').getByText('Add to cart');
    await expect(visibleAddToCart).toHaveCount(1);
    await expect(visibleAddToCart).toBeVisible();
  });

  test("data-qa attributes are this site's stable test hooks", async ({ page }) => {
    await page.goto('/login');

    // When a site ships data-qa/data-testid attributes, prefer them over
    // structural CSS (nth-child, deeply nested classes) - they're explicitly
    // designed not to change when the visual design does.
    await expect(page.locator('input[data-qa="login-email"]')).toBeVisible();
    await expect(page.locator('button[data-qa="login-button"]')).toBeVisible();
  });

  test('chaining and filtering scope a locator to one section of the page', async ({ page }) => {
    await page.goto('/products');

    // Scoping to one card by position, then querying inside it, is how you
    // avoid matching the same element across all 17+ repeated product cards.
    const firstCard = page.locator('.product-image-wrapper').first();
    await expect(firstCard.locator('.productinfo p')).toHaveText('Blue Top');
  });

  test('test wrapper locator', async ({ page }) => {
    await page.goto('/');

    const firstCard = page.locator(
      '.features_items .productinfo a.add-to-cart[data-product-id="6"]',
    );
    await firstCard.click();
    const viewCartLink = page.locator('#cartModal').getByRole('link', { name: 'View Cart' });

    await expect(viewCartLink).toBeVisible();
    await viewCartLink.click();
    await expect(page).toHaveURL(/\/view_cart$/);
  });

  test('temporary rule check', async ({ page }) => {
  await page.locator('.some-class span').click();
});

});
