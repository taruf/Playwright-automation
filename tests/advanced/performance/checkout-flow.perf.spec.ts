import { test as base, expect } from '@fixtures/fixtures';
import type { NewAccountPayload } from '@api/ApiClient';
import { createTestUser } from '@data/users';

/**
 * Checkout performance: how long a logged-in shopper waits between the cart
 * and the "order placed" confirmation. This is the part of the site where
 * slowness costs the most - a shopper who gives up here had already decided
 * to buy - and user-journey.perf.spec.ts stops at the cart, before it.
 *
 * Like the rest of this folder it is a smoke check, not a load test: one
 * user, one order, generous budgets (see homepage.perf.spec.ts for why).
 * The account is created through the API and deleted afterwards, and the
 * card number is the standard dummy test number - the site takes no payment.
 */
const STEP_BUDGET_MS = 15_000;
const CHECKOUT_BUDGET_MS = 40_000;
const PRODUCT_ID = 1;

const test = base.extend<{ shopperWithCart: NewAccountPayload }>({
  // Everything before the cart is setup, not the thing being measured, so
  // it lives here: an account, a login, and one product in the cart.
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
    // Setup plus four timed steps on a shared site can pass the project's
    // 60s default on a slow day without any single step being over budget.
    test.setTimeout(120_000);
    const timings: Record<string, number> = {};

    // Each step ends on the thing the shopper is waiting to see, so the
    // number is "time until I can carry on", not "time until the click".
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
      // Includes the page object's one retry for the site's occasionally
      // ignored click (see CartPage.proceedToCheckout) - a shopper who has
      // to click twice waited that long too.
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

    // Soft, so the report shows every slow step rather than only the first.
    for (const [step, ms] of Object.entries(timings)) {
      expect.soft(ms, step).toBeLessThan(STEP_BUDGET_MS);
    }
    expect(total).toBeLessThan(CHECKOUT_BUDGET_MS);
  });
});
