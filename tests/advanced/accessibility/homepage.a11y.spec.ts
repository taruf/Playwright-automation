import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '@fixtures/fixtures';

// The site has existing WCAG violations we can't fix, so we only fail on
// counts above this baseline (measured with ads blocked).
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

    await page.keyboard.press('Tab');
    await expect(signupLoginPage.loginPasswordInput).toBeFocused();
    await page.keyboard.type('wrong-password');

    await page.keyboard.press('Tab');
    await expect(signupLoginPage.loginButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(signupLoginPage.loginErrorMessage).toBeVisible();
  });

  test('login form fields expose an accessible name', async ({ signupLoginPage }) => {
    // fields use placeholders, not <label>s
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

// Known site bugs. test.fail() keeps these green until the site fixes them.
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
    // caret is hidden in screenshots, so any diff is focus styling
    const focused = await field.screenshot();

    await expect(field).toBeFocused();
    expect(focused.equals(unfocused)).toBe(false);
  });

  test('the cart table exposes its column headers to assistive tech as <th>, not <td>', async ({
    page,
    productsPage,
    cartPage,
  }) => {
    test.fail(
      true,
      'Header row (Item/Description/Price/Quantity/Total) uses <td>, not <th> or scope - 0 <th> elements measured live (WCAG 1.3.1)',
    );
    await productsPage.goto();
    await productsPage.addToCartFromListing(1);
    await cartPage.goto();
    await expect(cartPage.rowFor(1)).toBeVisible();

    const headerCellCount = await page.evaluate(
      () => document.querySelectorAll('#cart_info_table th').length,
    );
    expect(headerCellCount).toBeGreaterThan(0);
  });
});

// WCAG 1.4.10: 320px wide = desktop at 400% zoom
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

// axe doesn't check for exactly one <h1>; every page currently fails this
test.describe('heading structure', () => {
  for (const { name, path } of PAGE_BASELINES) {
    test(`${name} (${path}) has exactly one <h1>`, async ({ page }) => {
      test.fail(
        true,
        path === '/'
          ? 'Known: homepage renders 3 <h1>s (1 visible + 2 hidden duplicates) instead of one (WCAG 1.3.1)'
          : 'Known: page renders no <h1> at all (WCAG 1.3.1)',
      );

      await page.goto(path);
      const h1Count = await page.evaluate(() => document.querySelectorAll('h1').length);
      expect(h1Count).toBe(1);
    });
  }
});
