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
    await this.proceedToCheckoutButton.click();
  }
}
