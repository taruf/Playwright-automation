import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '@fixtures/fixtures';

/**
 * Accessibility checks don't need cross-browser coverage the way visual
 * rendering does, so this file's ".a11y.spec.ts" name keeps it chromium-only
 * (see playwright.config.ts).
 *
 * Every page on this site genuinely has real WCAG violations today (counts
 * below were measured with ad networks blocked, and were identical across
 * repeated runs). Failing the suite on every one of them would just make it
 * permanently red on a site we don't own and can't fix, which teaches
 * "ignore the accessibility test" rather than anything useful. The
 * professional pattern for a third-party/legacy target you can't remediate
 * immediately is a documented baseline: fail only on a *regression* past
 * what's already known, so a genuinely new violation still gets caught.
 */
type Baseline = Record<string, number>;

const PAGE_BASELINES: { name: string; path: string; baseline: Baseline }[] = [
  {
    name: 'homepage',
    path: '/',
    baseline: { 'button-name': 1, 'color-contrast': 41, 'link-name': 4 },
  },
  { name: 'products', path: '/products', baseline: { 'button-name': 2, 'color-contrast': 35 } },
  {
    name: 'product details',
    path: '/product_details/1',
    baseline: { 'button-name': 1, 'color-contrast': 4, label: 1 },
  },
  { name: 'login', path: '/login', baseline: { 'button-name': 1, 'color-contrast': 1 } },
  { name: 'cart', path: '/view_cart', baseline: { 'button-name': 1, 'color-contrast': 4 } },
  {
    name: 'contact us',
    path: '/contact_us',
    baseline: { 'button-name': 1, 'color-contrast': 1, label: 1 },
  },
];

async function expectNoRegressionsBeyondBaseline(page: Page, baseline: Baseline): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const seriousOrWorse = results.violations.filter((violation) =>
    ['critical', 'serious'].includes(violation.impact ?? ''),
  );

  // Attach the full report so a failure is debuggable from the HTML
  // report, not just a bare count in the terminal.
  await test.info().attach('axe-results', {
    body: JSON.stringify(results.violations, null, 2),
    contentType: 'application/json',
  });

  const regressions = seriousOrWorse.filter(
    (violation) => violation.nodes.length > (baseline[violation.id] ?? 0),
  );
  const unexpectedRuleIds = seriousOrWorse
    .filter((violation) => !(violation.id in baseline))
    .map((violation) => violation.id);

  expect(
    regressions.map((v) => `${v.id}: ${v.nodes.length} node(s) (baseline ${baseline[v.id]})`),
  ).toEqual([]);
  expect(unexpectedRuleIds).toEqual([]);
}

test.describe('axe scan - no new critical or serious violations beyond the known baseline', () => {
  for (const { name, path, baseline } of PAGE_BASELINES) {
    test(`${name} (${path})`, async ({ page }) => {
      await page.goto(path);
      await expectNoRegressionsBeyondBaseline(page, baseline);
    });
  }
});

/**
 * A page-load scan only sees the page's initial DOM. Popups, error messages
 * and filled-in carts are rendered later, so each needs its own scan in
 * that state - otherwise their violations are simply never looked at.
 */
test.describe('axe scan - interactive states', () => {
  test('products page with the "Added!" cart popup open', async ({ page, productsPage }) => {
    await productsPage.goto();
    await productsPage.addToCartFromListing(1);
    await expectNoRegressionsBeyondBaseline(page, {
      'button-name': 2,
      'color-contrast': 38,
      'link-name': 1,
    });
  });

  test('cart page with an item in it', async ({ page, productsPage, cartPage }) => {
    await productsPage.goto();
    await productsPage.addToCartFromListing(1);
    await cartPage.goto();
    await expect(cartPage.rowFor(1)).toBeVisible();
    await expectNoRegressionsBeyondBaseline(page, { 'button-name': 1, 'color-contrast': 9 });
  });

  test('cart page with the checkout login popup open', async ({ page, productsPage, cartPage }) => {
    await productsPage.goto();
    await productsPage.addToCartFromListing(1);
    await cartPage.goto();
    await cartPage.proceedToCheckoutButton.click();
    await expect(cartPage.checkoutModal).toBeVisible();
    await expectNoRegressionsBeyondBaseline(page, { 'button-name': 1, 'color-contrast': 11 });
  });

  test('login page showing a failed-login error', async ({ page, signupLoginPage }) => {
    await signupLoginPage.goto();
    await signupLoginPage.login('nobody@example.com', 'wrong-password');
    await expect(signupLoginPage.loginErrorMessage).toBeVisible();
    await expectNoRegressionsBeyondBaseline(page, { 'button-name': 1, 'color-contrast': 1 });
  });

  test('products page showing search results', async ({ page, productsPage }) => {
    await productsPage.goto();
    await productsPage.search('Dress');
    await expect(productsPage.searchedProductsHeading).toBeVisible();
    await expectNoRegressionsBeyondBaseline(page, { 'button-name': 2, 'color-contrast': 10 });
  });
});

/**
 * axe only catches what can be detected statically from the DOM. These
 * checks cover things a real keyboard or screen-reader user depends on that
 * a rule engine can't fully judge on its own.
 */
test.describe('manual accessibility checks', () => {
  test('every page declares a document language for screen readers', async ({ page }) => {
    for (const { path } of PAGE_BASELINES) {
      await page.goto(path);
      const lang = await page.evaluate(() => document.documentElement.lang);
      expect(lang, path).toMatch(/^[a-z]{2}/i);
    }
  });

  test('the login form can be completed and submitted with the keyboard alone', async ({
    page,
    signupLoginPage,
  }) => {
    await signupLoginPage.goto();

    await signupLoginPage.loginEmailInput.focus();
    await page.keyboard.type('nobody@example.com');

    // Tab order must follow the visual order: email -> password -> button.
    await page.keyboard.press('Tab');
    await expect(signupLoginPage.loginPasswordInput).toBeFocused();
    await page.keyboard.type('wrong-password');

    await page.keyboard.press('Tab');
    await expect(signupLoginPage.loginButton).toBeFocused();
    await page.keyboard.press('Enter');

    // Reaching the server's error proves Enter actually submitted the form.
    await expect(signupLoginPage.loginErrorMessage).toBeVisible();
  });

  test('login form fields expose an accessible name', async ({ signupLoginPage }) => {
    // The site uses placeholders instead of <label>s - this asserts that
    // assistive tech still gets a name for each field from somewhere.
    await signupLoginPage.goto();

    await expect(signupLoginPage.loginEmailInput).toHaveAccessibleName(/email/i);
    await expect(signupLoginPage.loginPasswordInput).toHaveAccessibleName(/password/i);
    await expect(signupLoginPage.loginButton).toHaveAccessibleName(/login/i);
  });

  test('every product image on the products page has non-empty alt text', async ({
    productsPage,
  }) => {
    await productsPage.goto();
    const images = productsPage.productImages;

    expect(await images.count()).toBeGreaterThan(0);
    for (const image of await images.all()) {
      await expect(image).toHaveAttribute('alt', /\S/);
    }
  });

  test('every page has a distinct, non-empty title', async ({ page }) => {
    // The title is the first thing a screen reader announces on page load
    // and what identifies the tab - two pages sharing one is ambiguous.
    const titles: string[] = [];
    for (const { path } of PAGE_BASELINES) {
      await page.goto(path);
      const title = await page.title();
      expect(title.trim(), path).not.toBe('');
      titles.push(title);
    }
    expect(new Set(titles).size).toBe(titles.length);
  });

  test('the cart popup can be dismissed with the keyboard via its own button', async ({
    page,
    productsPage,
  }) => {
    await productsPage.goto();
    await productsPage.addToCartFromListing(1);

    await productsPage.continueShoppingButton.focus();
    await page.keyboard.press('Enter');

    await expect(productsPage.cartModal).toBeHidden();
  });
});

/**
 * Known accessibility bugs on the live site, each confirmed by measurement.
 * `test.fail()` inverts the result: the test passes while the bug exists
 * and turns red the day the site fixes it - the cue to remove the marker
 * and keep the test as a normal regression check. That's the same "known
 * baseline" idea as the axe counts above, applied to a single behavior.
 */
test.describe('known accessibility bugs (expected to fail until fixed)', () => {
  test('the cart popup is exposed to assistive tech as a dialog', async ({ productsPage }) => {
    test.fail(true, 'No role="dialog" / aria-modal on #cartModal (WCAG 4.1.2)');
    await productsPage.goto();
    await productsPage.addToCartFromListing(1);

    await expect(productsPage.cartModal).toHaveAttribute('role', 'dialog');
  });

  test('opening the cart popup moves keyboard focus into it', async ({ productsPage }) => {
    test.fail(true, 'Focus stays on <body>; keyboard users must Tab through the page (WCAG 2.4.3)');
    await productsPage.goto();
    await productsPage.addToCartFromListing(1);

    const focusInsideModal = await productsPage.cartModal.evaluate((modal) =>
      modal.contains(document.activeElement),
    );
    expect(focusInsideModal).toBe(true);
  });

  test('Escape closes the cart popup', async ({ page, productsPage }) => {
    test.fail(true, 'Escape is ignored; the popup stays open (WCAG 2.1.2)');
    await productsPage.goto();
    await productsPage.addToCartFromListing(1);

    await page.keyboard.press('Escape');

    await expect(productsPage.cartModal).toBeHidden({ timeout: 3_000 });
  });

  test('a failed login error is announced to screen readers', async ({ signupLoginPage }) => {
    test.fail(true, 'Plain <p> with no role="alert" or aria-live (WCAG 4.1.3)');
    await signupLoginPage.goto();
    await signupLoginPage.login('nobody@example.com', 'wrong-password');
    await expect(signupLoginPage.loginErrorMessage).toBeVisible();

    const announced = await signupLoginPage.loginErrorMessage.evaluate(
      (el) => !!el.closest('[role="alert"], [role="status"], [aria-live]'),
    );
    expect(announced).toBe(true);
  });

  test('the login email field shows a visible focus indicator', async ({ signupLoginPage }) => {
    test.fail(true, 'outline: none and no replacement focus style (WCAG 2.4.7)');
    await signupLoginPage.goto();
    const field = signupLoginPage.loginEmailInput;

    const unfocused = await field.screenshot();
    await field.focus();
    // Playwright hides the text caret in screenshots by default, so any
    // pixel difference here comes from focus styling alone.
    const focused = await field.screenshot();

    await expect(field).toBeFocused();
    expect(focused.equals(unfocused)).toBe(false);
  });
});

/**
 * WCAG 1.4.10 (Reflow): content must work at 320 CSS px wide - the width of
 * a desktop browser zoomed to 400% - without scrolling sideways.
 */
const KNOWN_REFLOW_FAILURES = new Set(['/products']);

test.describe('reflow at 320px width', () => {
  test.use({ viewport: { width: 320, height: 640 } });

  for (const { name, path } of PAGE_BASELINES) {
    test(`${name} (${path}) has no horizontal scrolling`, async ({ page }) => {
      test.fail(KNOWN_REFLOW_FAILURES.has(path), 'Known: page is 331px wide at a 320px viewport');
      await page.goto(path);

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    });
  }
});
