import { test as base, expect } from '@fixtures/fixtures';
import type { NewAccountPayload } from '@api/ApiClient';
import { createTestUser } from '@data/users';

const STEP_BUDGET_MS = 15_000;
const CHECKOUT_BUDGET_MS = 40_000;
const PRODUCT_ID = 1;

const test = base.extend<{ shopperWithCart: NewAccountPayload }>({
  // untimed setup: account, login, one item in the cart
  shopperWithCart: async ({ apiClient, signupLoginPage, homePage, productsPage }, use) => {
    const user = createTestUser('perf-checkout');
    expect((await apiClient.createAccount(user)).responseCode).toBe(201);

    await signupLoginPage.goto();
    await signupLoginPage.login(user.email, user.password);
    await expect(homePage.loggedInAs).toBeVisible();
    await productsPage.goto();
    await productsPage.addToCartFromListing(PRODUCT_ID);
    await productsPage.continueShoppingButton.click();

    await use(user);
    await apiClient.deleteAccount(user.email, user.password);
  },
});

test.describe('checkout flow performance', () => {
  test('cart -> checkout -> payment -> order confirmation stays within budget', async ({
    shopperWithCart,
    cartPage,
    checkoutPage,
  }) => {
    test.setTimeout(120_000);
    const timings: Record<string, number> = {};

    async function timedStep(name: string, action: () => Promise<void>): Promise<void> {
      await test.step(name, async () => {
        const startedAt = Date.now();
        await action();
        timings[name] = Date.now() - startedAt;
      });
    }

    await timedStep('open cart', async () => {
      await cartPage.goto();
      await expect(cartPage.rowFor(PRODUCT_ID)).toBeVisible();
    });

    await timedStep('proceed to checkout', async () => {
      // includes CartPage's retry for the occasionally ignored click
      await cartPage.proceedToCheckout();
      await expect(checkoutPage.placeOrderLink).toBeVisible();
    });

    await timedStep('place order', async () => {
      await checkoutPage.addOrderComment('Performance smoke check order.');
      await checkoutPage.placeOrder();
      await expect(checkoutPage.confirmPaymentButton).toBeVisible();
    });

    await timedStep('pay and see confirmation', async () => {
      await checkoutPage.payWithCard({
        nameOnCard: shopperWithCart.name,
        cardNumber: '4111111111111111',
        cvc: '123',
        expiryMonth: '12',
        expiryYear: '2030',
      });
      await expect(checkoutPage.orderConfirmationHeading).toBeVisible();
    });

    const total = Object.values(timings).reduce((sum, ms) => sum + ms, 0);
    await test.info().attach('checkout-timings', {
      body: JSON.stringify({ ...timings, total }, null, 2),
      contentType: 'application/json',
    });

    for (const [step, ms] of Object.entries(timings)) {
      expect.soft(ms, step).toBeLessThan(STEP_BUDGET_MS);
    }
    expect(total).toBeLessThan(CHECKOUT_BUDGET_MS);
  });
});
