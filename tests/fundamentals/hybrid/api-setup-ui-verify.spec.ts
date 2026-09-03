import { test, expect } from '@fixtures/fixtures';
import { createTestUser } from '@data/users';

/**
 * Hybrid pattern: set up state through the API (fast, no UI flakiness) and
 * verify the outcome through the UI (what a real user would actually see).
 * This is the pattern to reach for whenever a UI-only setup step would be
 * slow or unreliable but the thing under test genuinely is the UI.
 */
test.describe('hybrid: API setup, UI verification', () => {
  test('an account created via the API can log in through the UI', async ({
    apiClient,
    signupLoginPage,
    homePage,
  }) => {
    const user = createTestUser('hybrid');

    const created = await apiClient.createAccount(user);
    expect(created.responseCode).toBe(201);

    await signupLoginPage.goto();
    await signupLoginPage.login(user.email, user.password);

    await expect(homePage.loggedInAs).toContainText(user.name);

    // Teardown through the API too - no need to drive the UI just to clean up.
    const deleted = await apiClient.deleteAccount(user.email, user.password);
    expect(deleted.responseCode).toBe(200);
  });

  test('the products shown in the UI match what the API reports', async ({
    apiClient,
    productsPage,
  }) => {
    const { products } = await apiClient.getProductsList();
    const firstProduct = products[0];

    await productsPage.goto();

    // Cross-check one real data point between the two surfaces, instead of
    // just asserting each one independently returns "something".
    await expect(productsPage.productNames.first()).toHaveText(firstProduct.name);
  });
});
