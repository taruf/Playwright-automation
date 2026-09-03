import { test, expect } from '@fixtures/fixtures';

test.describe('flow: cart quantity accumulation and item removal', () => {
  test('adding the same product twice accumulates quantity in one row', async ({
    productsPage,
    cartPage,
  }) => {
    const productId = 1;

    await productsPage.openProductDetails(productId);
    await productsPage.setQuantity(3);
    await productsPage.addToCartFromDetails();
    await productsPage.cartModal.waitFor({ state: 'visible' });
    await productsPage.viewCartLink.click();

    await expect(cartPage.quantityFor(productId)).toHaveText('3');

    // Adding the same product again merges into the existing row instead of
    // creating a duplicate - the row count assertion below is the real check,
    // not just "quantity went up".
    await productsPage.openProductDetails(productId);
    await productsPage.setQuantity(2);
    await productsPage.addToCartFromDetails();
    await productsPage.cartModal.waitFor({ state: 'visible' });
    await productsPage.viewCartLink.click();

    await expect(cartPage.cartRows).toHaveCount(1);
    await expect(cartPage.quantityFor(productId)).toHaveText('5');
  });

  test('removing the only item in the cart shows the empty-cart message', async ({
    productsPage,
    cartPage,
  }) => {
    const productId = 2;

    await productsPage.goto();
    await productsPage.addToCartFromListing(productId);
    await productsPage.viewCartLink.click();

    await expect(cartPage.rowFor(productId)).toBeVisible();

    await cartPage.removeItem(productId);

    await expect(cartPage.emptyCartMessage).toBeVisible();
  });
});
