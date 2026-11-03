import { test, expect } from '@fixtures/fixtures';

const STEP_BUDGET_MS = 10_000;
const CART_BUDGET_MS = 45_000;
const LISTING_IDS = [1, 2];
const DETAILS_ID = 3;
const DETAILS_QUANTITY = 4;

test.describe('cart management performance', () => {
  test('add several items -> update quantity -> remove items -> empty cart stays within budget', async ({
    page,
    productsPage,
    cartPage,
  }) => {
    const timings: Record<string, number> = {};

    async function timedStep(name: string, action: () => Promise<void>): Promise<void> {
      await test.step(name, async () => {
        const startedAt = Date.now();
        await action();
        timings[name] = Date.now() - startedAt;
      });
    }

    await timedStep('open products', async () => {
      await productsPage.goto();
      // add-to-cart clicks are ignored until the page has fully loaded
      await page.waitForLoadState('load');
      await expect(productsPage.productNames.first()).toBeVisible();
    });

    for (const id of LISTING_IDS) {
      await timedStep(`add product ${id} from listing`, async () => {
        await productsPage.addToCartFromListing(id);
        await productsPage.continueShoppingButton.click();
        await expect(productsPage.cartModal).toBeHidden();
      });
    }

    await timedStep(`add product ${DETAILS_ID} x${DETAILS_QUANTITY} from details`, async () => {
      await productsPage.openProductDetails(DETAILS_ID);
      await page.waitForLoadState('load');
      await productsPage.setQuantity(DETAILS_QUANTITY);
      await productsPage.addToCartFromDetails();
      await expect(productsPage.viewCartLink).toBeVisible();
    });

    await timedStep('view cart', async () => {
      await productsPage.viewCartLink.click();
      await page.waitForURL(/\/view_cart$/);
      await page.waitForLoadState('load');
      await expect(cartPage.cartRows).toHaveCount(LISTING_IDS.length + 1);
      await expect(cartPage.quantityFor(DETAILS_ID)).toHaveText(String(DETAILS_QUANTITY));
    });

    await timedStep(`remove product ${LISTING_IDS[0]}`, async () => {
      await cartPage.removeItem(LISTING_IDS[0]);
      await expect(cartPage.rowFor(LISTING_IDS[0])).toBeHidden();
    });

    await timedStep('remove remaining items', async () => {
      for (const id of [...LISTING_IDS.slice(1), DETAILS_ID]) {
        await cartPage.removeItem(id);
        await expect(cartPage.rowFor(id)).toBeHidden();
      }
      await expect(cartPage.emptyCartMessage).toBeVisible();
    });

    const total = Object.values(timings).reduce((sum, ms) => sum + ms, 0);
    await test.info().attach('cart-timings', {
      body: JSON.stringify({ ...timings, total }, null, 2),
      contentType: 'application/json',
    });

    for (const [step, ms] of Object.entries(timings)) {
      expect.soft(ms, step).toBeLessThan(STEP_BUDGET_MS);
    }
    expect(total).toBeLessThan(CART_BUDGET_MS);
  });
});
