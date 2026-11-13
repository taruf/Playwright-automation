import { test, expect } from '@fixtures/fixtures';
import { createTestUser } from '@data/users';

// Reverse of api-setup-ui-verify: act through the UI, then check the API agrees.
test.describe('hybrid: UI action, API verification', () => {
  test('an account signed up through the UI is stored with the details entered', async ({
    apiClient,
    signupLoginPage,
  }) => {
    const user = createTestUser('hybrid-ui-signup');

    await signupLoginPage.goto();
    await signupLoginPage.signUp(user);
    await expect(
      signupLoginPage.confirmationHeading.filter({ hasText: /account created/i }),
    ).toBeVisible();

    const { responseCode, user: stored } = await apiClient.getUserDetailByEmail(user.email);
    expect(responseCode).toBe(200);
    expect(stored).toMatchObject({
      name: user.name,
      email: user.email,
      first_name: user.firstname,
      last_name: user.lastname,
      company: user.company,
      address1: user.address1,
      city: user.city,
      state: user.state,
      zipcode: user.zipcode,
    });

    const deleted = await apiClient.deleteAccount(user.email, user.password);
    expect(deleted.responseCode).toBe(200);
  });

  test('a UI search shows the same products the search API returns', async ({
    page,
    apiClient,
    productsPage,
  }) => {
    const term = 'top';

    await productsPage.goto();
    // the search click is ignored until the page has fully loaded
    await page.waitForLoadState('load');
    await productsPage.search(term);
    await expect(productsPage.searchedProductsHeading).toBeVisible();

    const { products } = await apiClient.searchProduct(term);
    const uiNames = await productsPage.productNameTexts();

    expect(products.length).toBeGreaterThan(0);
    expect([...uiNames].sort()).toEqual(products.map((p) => p.name).sort());
  });

  test('the brand sidebar counts match the products per brand in the API', async ({
    apiClient,
    productsPage,
  }) => {
    const { brands } = await apiClient.getBrandsList();
    const countsByBrand = new Map<string, number>();
    for (const { brand } of brands) {
      countsByBrand.set(brand, (countsByBrand.get(brand) ?? 0) + 1);
    }

    await productsPage.goto();

    for (const [brand, count] of countsByBrand) {
      await expect(productsPage.brandLink(brand), brand).toContainText(`(${count})`);
    }
  });
});
