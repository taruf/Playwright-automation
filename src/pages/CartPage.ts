import type { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class CartPage extends BasePage {
  readonly cartRows: Locator;
  readonly emptyCartMessage: Locator;
  readonly proceedToCheckoutButton: Locator;
  readonly checkoutModal: Locator;
  readonly registerLoginLink: Locator;

  constructor(page: Page) {
    super(page);
    this.cartRows = page.locator('#cart_info_table tbody tr');
    this.emptyCartMessage = page.locator('#empty_cart');
    this.proceedToCheckoutButton = page.getByText('Proceed To Checkout');
    this.checkoutModal = page.locator('#checkoutModal');
    this.registerLoginLink = this.checkoutModal.getByRole('link', { name: 'Register / Login' });
  }

  async goto(): Promise<void> {
    await super.goto('/view_cart');
  }

  rowFor(productId: number): Locator {
    return this.page.locator(`#product-${productId}`);
  }

  quantityFor(productId: number): Locator {
    return this.rowFor(productId).locator('.cart_quantity button');
  }

  async removeItem(productId: number): Promise<void> {
    await this.rowFor(productId).locator('.cart_quantity_delete').click();
  }

  async proceedToCheckout(): Promise<void> {
    // "Proceed To Checkout" is a real, unique element (confirmed live: it's
    // an <a> with no href, same fake-link-as-button pattern as "Add to
    // cart") - but the click occasionally doesn't register as a real user
    // gesture to the site's own JS, leaving the page stuck on /view_cart
    // with no error. Confirmed by reproducing both outcomes from an
    // identical script - this is the site's flakiness, not a locator
    // problem, so one retry (rather than a longer timeout) is the fix.
    await this.proceedToCheckoutButton.click();
    try {
      await this.page.waitForURL(/\/checkout$/, { timeout: 5_000 });
    } catch {
      await this.proceedToCheckoutButton.click();
      await this.page.waitForURL(/\/checkout$/, { timeout: 10_000 });
    }
  }
}
