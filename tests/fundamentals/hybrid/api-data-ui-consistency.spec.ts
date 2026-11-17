import { test, expect } from '@fixtures/fixtures';
import { createTestUser } from '@data/users';

const SAMPLE_PRODUCT_COUNT = 3;

test.describe('hybrid: API data, UI consistency', () => {
  test('the UI signup form rejects an email already registered via the API', async ({
    apiClient,
    signupLoginPage,
  }) => {
    const user = createTestUser('hybrid-duplicate');
    expect((await apiClient.createAccount(user)).responseCode).toBe(201);

    await signupLoginPage.goto();
    await signupLoginPage.startSignup('Someone Else', user.email);

    await expect(signupLoginPage.signupErrorMessage).toBeVisible();
    await expect(signupLoginPage.createAccountButton).toBeHidden();

    const deleted = await apiClient.deleteAccount(user.email, user.password);
    expect(deleted.responseCode).toBe(200);
  });

  test('a brand listing shows exactly the products the API lists for that brand', async ({
    page,
    apiClient,
    productsPage,
  }) => {
    const brand = 'Polo';
    const [{ brands }, { products }] = await Promise.all([
      apiClient.getBrandsList(),
      apiClient.getProductsList(),
    ]);
    const brandIds = new Set(brands.filter((b) => b.brand === brand).map((b) => b.id));
    const expected = products.filter((p) => brandIds.has(p.id)).map((p) => p.name);

    await page.goto(`/brand_products/${brand}`);
    await expect(productsPage.listingTitle).toHaveText(/brand - polo products/i);

    expect(expected.length).toBeGreaterThan(0);
    expect((await productsPage.productNameTexts()).sort()).toEqual(expected.sort());
  });

  test('product pages show the brand and category the API reports', async ({
    apiClient,
    productsPage,
  }) => {
    const { products } = await apiClient.getProductsList();

    for (const product of products.slice(0, SAMPLE_PRODUCT_COUNT)) {
      await test.step(product.name, async () => {
        await productsPage.openProductDetails(product.id);

        await expect(productsPage.productName).toHaveText(product.name);
        await expect(productsPage.productBrand).toHaveText(`Brand: ${product.brand}`);
        await expect(productsPage.productCategory).toHaveText(
          `Category: ${product.category.usertype.usertype} > ${product.category.category}`,
        );
      });
    }
  });
});
