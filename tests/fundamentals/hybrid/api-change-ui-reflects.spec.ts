import { test, expect } from '@fixtures/fixtures';
import { createTestUser } from '@data/users';

// Change or read data through the API, then check a later UI step reflects it.
test.describe('hybrid: API change, UI reflects it', () => {
  test('an address updated via the API is the delivery address at checkout', async ({
    apiClient,
    signupLoginPage,
    homePage,
    productsPage,
    cartPage,
    checkoutPage,
  }) => {
    const user = createTestUser('hybrid-update');
    expect((await apiClient.createAccount(user)).responseCode).toBe(201);

    const moved = { ...user, address1: '742 Evergreen Terrace', city: 'Springfield' };
    const updated = await apiClient.updateAccount(moved);
    expect(updated.responseCode).toBe(200);

    await signupLoginPage.goto();
    await signupLoginPage.login(user.email, user.password);
    await expect(homePage.loggedInAs).toBeVisible();
    await productsPage.goto();
    await productsPage.addToCartFromListing(1);
    await productsPage.continueShoppingButton.click();
    await cartPage.goto();
    await cartPage.proceedToCheckout();

    await expect(checkoutPage.deliveryAddress).toContainText(moved.address1);
    await expect(checkoutPage.deliveryAddress).toContainText(moved.city);
    await expect(checkoutPage.deliveryAddress).not.toContainText(user.address1);

    const deleted = await apiClient.deleteAccount(user.email, user.password);
    expect(deleted.responseCode).toBe(200);
  });

  test('a category listing shows the products the API files under that category', async ({
    page,
    apiClient,
    productsPage,
  }) => {
    const { products } = await apiClient.getProductsList();
    const expected = products
      .filter((p) => p.category.usertype.usertype === 'Women' && p.category.category === 'Dress')
      .map((p) => p.name);

    await productsPage.goto();
    // the accordion ignores clicks until the page has fully loaded
    await page.waitForLoadState('load');
    await productsPage.categoryToggle('Women').click();
    await productsPage.subcategoryLink('Women', 'Dress').click();
    await expect(productsPage.listingTitle).toHaveText(/women - dress products/i);

    expect(expected.length).toBeGreaterThan(0);
    expect((await productsPage.productNameTexts()).sort()).toEqual(expected.sort());
  });
});
