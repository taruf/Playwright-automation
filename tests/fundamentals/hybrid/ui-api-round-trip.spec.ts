import { test, expect } from '@fixtures/fixtures';
import { createTestUser } from '@data/users';

test.describe('hybrid: UI and API round trips', () => {
  test('the products page lists every product the API has', async ({ apiClient, productsPage }) => {
    const { products } = await apiClient.getProductsList();

    await productsPage.goto();

    await expect(productsPage.productNames).toHaveCount(products.length);
  });

  test('a search with no matches is empty in both the UI and the API', async ({
    page,
    apiClient,
    productsPage,
  }) => {
    const term = `no-such-product-${Date.now()}`;

    const { products } = await apiClient.searchProduct(term);
    expect(products).toEqual([]);

    await productsPage.goto();
    // the search click is ignored until the page has fully loaded
    await page.waitForLoadState('load');
    await productsPage.search(term);
    await expect(productsPage.searchedProductsHeading).toBeVisible();
    await expect(productsPage.productNames).toHaveCount(0);
  });

  test('an account deleted through the UI is gone from the API', async ({
    apiClient,
    signupLoginPage,
    homePage,
  }) => {
    const user = createTestUser('hybrid-ui-delete');
    expect((await apiClient.createAccount(user)).responseCode).toBe(201);

    await signupLoginPage.goto();
    await signupLoginPage.login(user.email, user.password);
    await expect(homePage.loggedInAs).toBeVisible();
    await homePage.deleteAccountLink.click();
    await expect(
      signupLoginPage.confirmationHeading.filter({ hasText: /account deleted/i }),
    ).toBeVisible();

    expect((await apiClient.getUserDetailByEmail(user.email)).responseCode).toBe(404);
    expect((await apiClient.verifyLogin(user.email, user.password)).responseCode).toBe(404);
  });

  test('checkout shows the name, company, country and phone registered via the API', async ({
    apiClient,
    signupLoginPage,
    homePage,
    productsPage,
    cartPage,
    checkoutPage,
  }) => {
    const user = createTestUser('hybrid-checkout-details');
    expect((await apiClient.createAccount(user)).responseCode).toBe(201);

    await signupLoginPage.goto();
    await signupLoginPage.login(user.email, user.password);
    await expect(homePage.loggedInAs).toBeVisible();
    await productsPage.goto();
    await productsPage.addToCartFromListing(1);
    await productsPage.continueShoppingButton.click();
    await cartPage.goto();
    await cartPage.proceedToCheckout();

    for (const address of [checkoutPage.deliveryAddress, checkoutPage.billingAddress]) {
      await expect(address).toContainText(`${user.title}. ${user.firstname} ${user.lastname}`);
      await expect(address).toContainText(user.company);
      await expect(address).toContainText(user.country);
      await expect(address).toContainText(user.mobile_number);
    }

    const deleted = await apiClient.deleteAccount(user.email, user.password);
    expect(deleted.responseCode).toBe(200);
  });
});
