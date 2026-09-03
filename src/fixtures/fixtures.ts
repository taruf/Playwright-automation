import { test as base } from '@playwright/test';
import { HomePage } from '@pages/HomePage';
import { SignupLoginPage } from '@pages/SignupLoginPage';
import { ProductsPage } from '@pages/ProductsPage';
import { CartPage } from '@pages/CartPage';
import { CheckoutPage } from '@pages/CheckoutPage';
import { ContactUsPage } from '@pages/ContactUsPage';
import { ApiClient } from '@api/ApiClient';
import { env } from '@utils/env';

interface Fixtures {
  homePage: HomePage;
  signupLoginPage: SignupLoginPage;
  productsPage: ProductsPage;
  cartPage: CartPage;
  checkoutPage: CheckoutPage;
  contactUsPage: ContactUsPage;
  apiClient: ApiClient;
}

// This site runs live third-party ad-injection scripts that mutate visible
// page text non-deterministically (confirmed: they've both appended stray
// text after a product name AND wrapped a real word *inside* a product name
// in their own element - see docs/target-application.md and the "Confidently
// wrong root cause" entry in docs/ai-defect-taxonomy.md for how that was
// found). Blocking their known hosts is the actual fix, at the source,
// rather than trying to out-guess what a live ad script might do to the DOM
// in any given run.
const AD_NETWORK_HOSTS =
  /googlesyndication\.com|doubleclick\.net|googleadservices\.com|fundingchoicesmessages\.google\.com/;

/**
 * Project-wide test/expect, extended with one fixture per page object plus
 * the API client. Import `test`/`expect` from here instead of
 * `@playwright/test` anywhere under tests/ so specs get instances for free
 * instead of constructing page objects by hand.
 */
export const test = base.extend<Fixtures>({
  page: async ({ page }, use) => {
    await page.route(
      (url) => AD_NETWORK_HOSTS.test(url.hostname),
      (route) => route.abort(),
    );
    await use(page);
  },
  homePage: async ({ page }, use) => {
    await use(new HomePage(page));
  },
  signupLoginPage: async ({ page }, use) => {
    await use(new SignupLoginPage(page));
  },
  productsPage: async ({ page }, use) => {
    await use(new ProductsPage(page));
  },
  cartPage: async ({ page }, use) => {
    await use(new CartPage(page));
  },
  checkoutPage: async ({ page }, use) => {
    await use(new CheckoutPage(page));
  },
  contactUsPage: async ({ page }, use) => {
    await use(new ContactUsPage(page));
  },
  apiClient: async ({ request }, use) => {
    await use(new ApiClient(request, env.apiBaseURL));
  },
});

export { expect } from '@playwright/test';
