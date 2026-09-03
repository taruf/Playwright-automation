import type { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

export interface CardDetails {
  nameOnCard: string;
  cardNumber: string;
  cvc: string;
  expiryMonth: string;
  expiryYear: string;
}

export class CheckoutPage extends BasePage {
  readonly orderCommentInput: Locator;
  readonly placeOrderLink: Locator;

  // /payment
  readonly nameOnCardInput: Locator;
  readonly cardNumberInput: Locator;
  readonly cvcInput: Locator;
  readonly expiryMonthInput: Locator;
  readonly expiryYearInput: Locator;
  readonly confirmPaymentButton: Locator;
  readonly orderConfirmationHeading: Locator;

  constructor(page: Page) {
    super(page);
    this.orderCommentInput = page.locator('textarea[name="message"]');
    this.placeOrderLink = page.getByRole('link', { name: 'Place Order' });

    this.nameOnCardInput = page.locator('input[name="name_on_card"]');
    this.cardNumberInput = page.locator('input[name="card_number"]');
    this.cvcInput = page.locator('input[name="cvc"]');
    this.expiryMonthInput = page.locator('input[name="expiry_month"]');
    this.expiryYearInput = page.locator('input[name="expiry_year"]');
    // Site markup for this button has shifted between an id and a data-qa
    // attribute in the past; matching both keeps this resilient either way.
    this.confirmPaymentButton = page.locator('#submit, [data-qa="pay-button"]');
    this.orderConfirmationHeading = page.getByRole('heading', { name: /order placed/i });
  }

  async addOrderComment(comment: string): Promise<void> {
    await this.orderCommentInput.fill(comment);
  }

  async placeOrder(): Promise<void> {
    await this.placeOrderLink.click();
  }

  async payWithCard(card: CardDetails): Promise<void> {
    await this.nameOnCardInput.fill(card.nameOnCard);
    await this.cardNumberInput.fill(card.cardNumber);
    await this.cvcInput.fill(card.cvc);
    await this.expiryMonthInput.fill(card.expiryMonth);
    await this.expiryYearInput.fill(card.expiryYear);
    await this.confirmPaymentButton.click();
  }
}
