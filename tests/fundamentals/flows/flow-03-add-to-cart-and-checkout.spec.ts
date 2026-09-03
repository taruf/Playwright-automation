import { test, expect } from '@fixtures/fixtures';
import { createTestUser } from '@data/users';

test.describe('flow: add to cart through a paid checkout', () => {
  test('a logged-in user can take a product from the catalog to a placed order', async ({
    signupLoginPage,
    productsPage,
    cartPage,
    checkoutPage,
  }) => {
    const user = createTestUser('flow03');

    await test.step('create and log into a fresh account', async () => {
      await signupLoginPage.goto();
      await signupLoginPage.signUp(user);
      await signupLoginPage.continueButton.click();
    });

    await test.step('add a product to the cart', async () => {
      await productsPage.goto();
      await productsPage.addToCartFromListing(1);
      await productsPage.viewCartLink.click();
    });

    await test.step('cart reflects the added product', async () => {
      await expect(cartPage.rowFor(1)).toBeVisible();
    });

    await test.step('checkout, pay, and confirm the order', async () => {
      await cartPage.proceedToCheckout();
      await checkoutPage.addOrderComment('Please leave at the front door.');
      await checkoutPage.placeOrder();
      await checkoutPage.payWithCard({
        nameOnCard: user.name,
        cardNumber: '4111111111111111',
        cvc: '123',
        expiryMonth: '12',
        expiryYear: '2030',
      });
      await expect(checkoutPage.orderConfirmationHeading).toBeVisible();
    });

    await signupLoginPage.deleteAccount();
    await expect(
      signupLoginPage.confirmationHeading.filter({ hasText: 'Account Deleted' }),
    ).toBeVisible();
  });
});
