import { test, expect } from '@fixtures/fixtures';

test.describe('flow: search and view product details', () => {
  test('searching narrows the catalog and each result opens its own detail page', async ({
    productsPage,
    apiClient,
    page,
  }) => {
    await productsPage.goto();

    await productsPage.search('Dress');
    await expect(productsPage.searchedProductsHeading).toBeVisible();

    const resultCount = await productsPage.productCards.count();
    expect(resultCount).toBeGreaterThan(0);

    // This site's search isn't a strict substring match on the product name
    // (searching "Dress" also returns e.g. "Sleeves Top and Short - Blue &
    // Pink" - confirmed independently via the /api/searchProduct endpoint).
    // So the honest check is that the UI agrees with the API's own search,
    // not that every result "looks like" the search term.
    const apiResult = await apiClient.searchProduct('Dress');
    const uiNames = await productsPage.productNameTexts();
    expect(new Set(uiNames)).toEqual(new Set(apiResult.products.map((p) => p.name)));

    await productsPage.productCards.first().getByRole('link', { name: 'View Product' }).click();
    await expect(productsPage.productName).toBeVisible();
    await expect(page).toHaveURL(/\/product_details\/\d+/);
  });
});
