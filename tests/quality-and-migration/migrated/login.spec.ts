import { test, expect } from '@fixtures/fixtures';

/**
 * The Playwright rebuild of ../legacy-selenium/login.legacy-reference.md.
 * Same behavior under test - an unknown email is rejected - with no manual
 * waits, no XPath, and automatic per-test browser lifecycle via fixtures.
 */
test.describe('migrated: login', () => {
  test('rejects an unknown email', async ({ signupLoginPage }) => {
    await signupLoginPage.goto();

    await signupLoginPage.login(`no-such-user-${Date.now()}@example.com`, 'wrong-password');

    await expect(signupLoginPage.loginErrorMessage).toBeVisible();
  });
});
