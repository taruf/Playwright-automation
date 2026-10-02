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
 * axe only catches what can be detected statically from the DOM. These
 * checks cover things a real keyboard or screen-reader user depends on that
 * a rule engine can't fully judge on its own.
 */
test.describe('manual accessibility checks', () => {
  test('every page declares a document language for screen readers', async ({ page }) => {
    for (const { path } of PAGE_BASELINES) {
      await page.goto(path);
      await expect(page.locator('html'), path).toHaveAttribute('lang', /^[a-z]{2}/i);
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
    page,
  }) => {
    await productsPage.goto();
    const images = page.locator('.productinfo img');

    expect(await images.count()).toBeGreaterThan(0);
    for (const image of await images.all()) {
      await expect(image).toHaveAttribute('alt', /\S/);
    }
  });
});
