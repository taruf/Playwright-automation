import type { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class ProductsPage extends BasePage {
  readonly searchInput: Locator;
  readonly searchButton: Locator;
  readonly productCards: Locator;
  readonly productNames: Locator;
  readonly searchedProductsHeading: Locator;
  readonly cartModal: Locator;
  readonly continueShoppingButton: Locator;
  readonly viewCartLink: Locator;

  // product detail page
  readonly productName: Locator;
  readonly quantityInput: Locator;
  readonly addToCartButton: Locator;

  constructor(page: Page) {
    super(page);
    this.searchInput = page.locator('#search_product');
    this.searchButton = page.locator('#submit_search');
    this.productCards = page.locator('.product-image-wrapper');
    // Every card's name, in the main grid only (see addToCartCardByProductId
    // for why .features_items matters - it excludes the homepage's
    // "recommended items" carousel, which repeats the same product names).
    this.productNames = page.locator('.features_items .productinfo p');
    this.searchedProductsHeading = page.getByRole('heading', { name: 'Searched Products' });
    this.cartModal = page.locator('#cartModal');
    this.continueShoppingButton = this.cartModal.getByRole('button', { name: 'Continue Shopping' });
    this.viewCartLink = this.cartModal.getByRole('link', { name: 'View Cart' });

    this.productName = page.locator('.product-information h2');
    this.quantityInput = page.locator('#quantity');
    this.addToCartButton = page.locator('button.cart');
  }

  async goto(): Promise<void> {
    await super.goto('/products');
  }

  async openProductDetails(productId: number): Promise<void> {
    await super.goto(`/product_details/${productId}`);
  }

  async search(term: string): Promise<void> {
    await this.searchInput.fill(term);
    await this.searchButton.click();
  }

  /**
   * Each product's own name text. This used to try to filter out injected
   * ad-network content by reading only direct text-node children of the <p>
   * - that turned out to be the wrong fix: the ad script doesn't only append
   * extra content, it sometimes wraps a real word *inside* the product name
   * in its own element too (confirmed: "Sleeveless Dress" came back as just
   * "Sleeveless"), which text-node filtering can't tell apart from injected
   * junk. The actual fix is blocking the ad network's requests entirely, in
   * the `page` fixture (src/fixtures/fixtures.ts) - with nothing ever
   * injected, a plain read is correct again.
   */
  async productNameTexts(): Promise<string[]> {
    return this.productNames.allInnerTexts();
  }

  addToCartCardByProductId(productId: number): Locator {
    // Two duplication traps live here, both confirmed on the real site:
    //  1. Each card renders twice - a visible .productinfo block and a
    //     hover-only .product-overlay duplicate - so this scopes to the
    //     visible one rather than relying on DOM order via .first().
    //  2. The homepage ("/") re-renders the same product ids again in its
    //     "recommended items" carousel. .features_items wraps only the main
    //     grid (present on both "/" and "/products"), so scoping to it keeps
    //     this method correct even if it's ever called from the homepage.
    return this.page.locator(
      `.features_items .productinfo a.add-to-cart[data-product-id="${productId}"]`,
    );
  }

  async addToCartFromListing(productId: number): Promise<void> {
    await this.addToCartCardByProductId(productId).click();
    await this.cartModal.waitFor({ state: 'visible' });
  }

  async setQuantity(quantity: number): Promise<void> {
    await this.quantityInput.fill(String(quantity));
  }

  async addToCartFromDetails(): Promise<void> {
    await this.addToCartButton.click();
  }
}
