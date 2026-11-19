import type { APIRequestContext } from '@playwright/test';
import { test, expect } from '@fixtures/fixtures';
import { createTestUser } from '@data/users';
import { env } from '@utils/env';

// context.request shares cookies with the browser, so a session made on one side works on the other.
async function loginThroughRequest(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<void> {
  const loginPage = await (await request.get('/login')).text();
  const csrfToken = loginPage.match(/name="csrfmiddlewaretoken" value="([^"]+)"/)?.[1];
  expect(csrfToken, 'login form should carry a CSRF token').toBeTruthy();

  // Django checks the Referer on HTTPS form posts
  const response = await request.post('/login', {
    form: { csrfmiddlewaretoken: csrfToken ?? '', email, password },
    headers: { Referer: `${env.baseURL}/login` },
  });
  expect(response.ok()).toBe(true);
}

test.describe('hybrid: shared browser and request session', () => {
  test('logging in through the request context logs the browser in', async ({
    page,
    context,
    apiClient,
    homePage,
  }) => {
    const user = createTestUser('hybrid-session');
    expect((await apiClient.createAccount(user)).responseCode).toBe(201);

    await loginThroughRequest(context.request, user.email, user.password);
    await homePage.goto();

    await expect(homePage.loggedInAs).toContainText(user.name);
    expect((await context.cookies()).some((c) => c.name === 'sessionid')).toBe(true);
    await expect(page).toHaveURL(`${env.baseURL}/`);

    const deleted = await apiClient.deleteAccount(user.email, user.password);
    expect(deleted.responseCode).toBe(200);
  });

  test('a product added to the cart in the UI is in the cart the request context sees', async ({
    page,
    productsPage,
  }) => {
    await productsPage.goto();
    await productsPage.addToCartFromListing(1);
    await productsPage.continueShoppingButton.click();

    const cartHtml = await (await page.request.get('/view_cart')).text();

    expect(cartHtml).toContain('id="product-1"');
  });

  test('logging out through the request context logs the browser out', async ({
    context,
    apiClient,
    signupLoginPage,
    homePage,
  }) => {
    const user = createTestUser('hybrid-session-logout');
    expect((await apiClient.createAccount(user)).responseCode).toBe(201);

    await signupLoginPage.goto();
    await signupLoginPage.login(user.email, user.password);
    await expect(homePage.loggedInAs).toBeVisible();

    await context.request.get('/logout');
    await homePage.goto();

    await expect(homePage.signupLoginLink).toBeVisible();
    await expect(homePage.loggedInAs).toBeHidden();

    const deleted = await apiClient.deleteAccount(user.email, user.password);
    expect(deleted.responseCode).toBe(200);
  });
});
