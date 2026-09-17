import { test, expect } from '@fixtures/fixtures';
import { createTestUser } from '@data/users';

/**
 * The Playwright rebuild of ../legacy-selenium/login.legacy-reference.md.
 * The first test below is that same behavior under test - an unknown email
 * is rejected - with no manual waits, no XPath, and automatic per-test
 * browser lifecycle via fixtures. The rest extend past the original
 * Selenium scope to round out login coverage.
 */
test.describe('migrated: login', () => {
  test('rejects an unknown email', async ({ signupLoginPage }) => {
    await signupLoginPage.goto();

    await signupLoginPage.login(`no-such-user-${Date.now()}@example.com`, 'wrong-password');

    await expect(signupLoginPage.loginErrorMessage).toBeVisible();
  });

  test('a wrong password for a real account fails the same way as an unknown email', async ({
    apiClient,
    signupLoginPage,
  }) => {
    // Same rejection, same message, whether or not the email exists - the
    // app never confirms/denies an account's existence through this form.
    const user = createTestUser('login-wrong-pw');
    const created = await apiClient.createAccount(user);
    expect(created.responseCode).toBe(201);

    await signupLoginPage.goto();
    await signupLoginPage.login(user.email, 'totally-wrong-password');

    await expect(signupLoginPage.loginErrorMessage).toBeVisible();

    const deleted = await apiClient.deleteAccount(user.email, user.password);
    expect(deleted.responseCode).toBe(200);
  });

  test('submitting the form with empty fields keeps the user on the login page', async ({
    page,
    signupLoginPage,
  }) => {
    await signupLoginPage.goto();

    // Both inputs carry the HTML `required` attribute, so the browser blocks
    // submission before it ever reaches the server - the app's own "email or
    // password is incorrect" rejection never fires for this case.
    await signupLoginPage.loginButton.click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(signupLoginPage.loginErrorMessage).toBeHidden();
  });
});
