import { test as base, expect } from '@fixtures/fixtures';
import type { NewAccountPayload } from '@api/ApiClient';
import { createTestUser } from '@data/users';
import { env } from '@utils/env';

// Passive checks only: a normal checkout with a test card on our own throwaway account.
const PRODUCT_ID = 1;
const CARD = {
  nameOnCard: 'Security Check',
  cardNumber: '4111111111111111',
  cvc: '987',
  expiryMonth: '12',
  expiryYear: '2030',
};
const SITE_HOST = new URL(env.baseURL).hostname;

const test = base.extend<{ onPaymentPage: NewAccountPayload }>({
  onPaymentPage: async (
    { apiClient, signupLoginPage, homePage, productsPage, cartPage, checkoutPage },
    use,
  ) => {
    const user = createTestUser('security-payment');
    expect((await apiClient.createAccount(user)).responseCode).toBe(201);

    await signupLoginPage.goto();
    await signupLoginPage.login(user.email, user.password);
    await expect(homePage.loggedInAs).toBeVisible();
    await productsPage.goto();
    await productsPage.addToCartFromListing(PRODUCT_ID);
    await productsPage.continueShoppingButton.click();
    await cartPage.goto();
    await cartPage.proceedToCheckout();
    await checkoutPage.placeOrder();
    await expect(checkoutPage.confirmPaymentButton).toBeVisible();

    await use(user);
    await apiClient.deleteAccount(user.email, user.password);
  },
});

// getting to the payment page alone can take ~30s on a slow day
test.describe.configure({ timeout: 120_000 });

test.describe('payment form', () => {
  test('submits by POST to this site over HTTPS with a CSRF token', async ({
    page,
    onPaymentPage,
  }) => {
    expect(onPaymentPage.email).toBeTruthy();
    const form = await page.evaluate(() => {
      const el = document.querySelector<HTMLFormElement>('#payment-form');
      return el && {
        action: el.action,
        method: el.method,
        hasCsrfToken: Boolean(el.querySelector('input[name="csrfmiddlewaretoken"]')),
      };
    });

    expect(form).not.toBeNull();
    expect(form?.method).toBe('post');
    expect(new URL(form?.action ?? '').protocol).toBe('https:');
    expect(new URL(form?.action ?? '').hostname).toBe(SITE_HOST);
    expect(form?.hasCsrfToken).toBe(true);
  });

  test('card fields start empty', async ({ checkoutPage, onPaymentPage }) => {
    expect(onPaymentPage.email).toBeTruthy();
    for (const field of [
      checkoutPage.nameOnCardInput,
      checkoutPage.cardNumberInput,
      checkoutPage.cvcInput,
      checkoutPage.expiryMonthInput,
      checkoutPage.expiryYearInput,
    ]) {
      await expect(field).toHaveValue('');
    }
  });

  test('card details are not left in the URL, page, cookies or storage after paying', async ({
    page,
    context,
    checkoutPage,
    onPaymentPage,
  }) => {
    expect(onPaymentPage.email).toBeTruthy();
    await checkoutPage.payWithCard(CARD);
    await expect(checkoutPage.orderConfirmationHeading).toBeVisible();

    const cookies = JSON.stringify(await context.cookies());
    const storage = await page.evaluate(() =>
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    );
    const html = await page.content();

    for (const secret of [CARD.cardNumber, CARD.cvc]) {
      expect(page.url()).not.toContain(secret);
      expect(html).not.toContain(secret);
      expect(cookies).not.toContain(secret);
      expect(storage).not.toContain(secret);
    }
  });
});

// Known gaps on the site. test.fail() keeps these green until they're fixed.
test.describe('known payment form gaps (expected to fail until fixed)', () => {
  test('the payment page loads no third-party scripts', async ({ page, onPaymentPage }) => {
    test.fail(true, 'Google Ads script runs on the payment page and could read card fields');
    expect(onPaymentPage.email).toBeTruthy();

    const scriptHosts = await page.evaluate(() =>
      [...document.scripts].filter((s) => s.src).map((s) => new URL(s.src).hostname),
    );
    const thirdParty = scriptHosts.filter(
      (host) => host !== SITE_HOST && host !== 'static.cloudflareinsights.com',
    );

    expect(thirdParty).toEqual([]);
  });
});
