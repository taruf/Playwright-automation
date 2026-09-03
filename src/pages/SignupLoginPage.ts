import type { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';
import type { NewAccountPayload } from '@api/ApiClient';

/**
 * Covers the whole account journey that lives under one logical flow on this
 * site: /login (login + signup entry) -> /signup (account details form) ->
 * /account_created -> ... -> /delete_account -> /account_deleted.
 */
export class SignupLoginPage extends BasePage {
  // /login
  readonly loginEmailInput: Locator;
  readonly loginPasswordInput: Locator;
  readonly loginButton: Locator;
  readonly loginErrorMessage: Locator;
  readonly signupNameInput: Locator;
  readonly signupEmailInput: Locator;
  readonly signupButton: Locator;

  // /signup (account information form)
  readonly genderMrRadio: Locator;
  readonly passwordInput: Locator;
  readonly daysSelect: Locator;
  readonly monthsSelect: Locator;
  readonly yearsSelect: Locator;
  readonly firstNameInput: Locator;
  readonly lastNameInput: Locator;
  readonly companyInput: Locator;
  readonly address1Input: Locator;
  readonly address2Input: Locator;
  readonly countrySelect: Locator;
  readonly stateInput: Locator;
  readonly cityInput: Locator;
  readonly zipcodeInput: Locator;
  readonly mobileNumberInput: Locator;
  readonly createAccountButton: Locator;

  // /account_created, /account_deleted
  readonly continueButton: Locator;
  readonly confirmationHeading: Locator;

  constructor(page: Page) {
    super(page);
    this.loginEmailInput = page.locator('input[data-qa="login-email"]');
    this.loginPasswordInput = page.locator('input[data-qa="login-password"]');
    this.loginButton = page.locator('button[data-qa="login-button"]');
    this.loginErrorMessage = page.getByText(/incorrect/i);
    this.signupNameInput = page.locator('input[data-qa="signup-name"]');
    this.signupEmailInput = page.locator('input[data-qa="signup-email"]');
    this.signupButton = page.locator('button[data-qa="signup-button"]');

    this.genderMrRadio = page.locator('#id_gender1');
    this.passwordInput = page.locator('#password');
    this.daysSelect = page.locator('#days');
    this.monthsSelect = page.locator('#months');
    this.yearsSelect = page.locator('#years');
    this.firstNameInput = page.locator('#first_name');
    this.lastNameInput = page.locator('#last_name');
    this.companyInput = page.locator('#company');
    this.address1Input = page.locator('#address1');
    this.address2Input = page.locator('#address2');
    this.countrySelect = page.locator('#country');
    this.stateInput = page.locator('#state');
    this.cityInput = page.locator('#city');
    this.zipcodeInput = page.locator('#zipcode');
    this.mobileNumberInput = page.locator('#mobile_number');
    this.createAccountButton = page.locator('button[data-qa="create-account"]');

    this.continueButton = page.locator('[data-qa="continue-button"]');
    this.confirmationHeading = page.locator('h2');
  }

  async goto(): Promise<void> {
    await super.goto('/login');
  }

  async login(email: string, password: string): Promise<void> {
    await this.loginEmailInput.fill(email);
    await this.loginPasswordInput.fill(password);
    await this.loginButton.click();
  }

  async startSignup(name: string, email: string): Promise<void> {
    await this.signupNameInput.fill(name);
    await this.signupEmailInput.fill(email);
    await this.signupButton.click();
  }

  /** Fills the ENTER ACCOUNT INFORMATION / ADDRESS INFORMATION form on /signup. */
  async completeAccountInformation(user: NewAccountPayload): Promise<void> {
    await this.genderMrRadio.check();
    await this.passwordInput.fill(user.password);
    await this.firstNameInput.fill(user.firstname);
    await this.lastNameInput.fill(user.lastname);
    await this.companyInput.fill(user.company);
    await this.address1Input.fill(user.address1);
    await this.stateInput.fill(user.state);
    await this.cityInput.fill(user.city);
    await this.zipcodeInput.fill(user.zipcode);
    await this.mobileNumberInput.fill(user.mobile_number);
    await this.createAccountButton.click();
  }

  /** Full UI signup: /login -> fill signup form -> account created page. */
  async signUp(user: NewAccountPayload): Promise<void> {
    await this.startSignup(user.name, user.email);
    await this.completeAccountInformation(user);
  }

  async deleteAccount(): Promise<void> {
    await super.goto('/delete_account');
  }
}
