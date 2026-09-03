import { test, expect } from '@fixtures/fixtures';
import { createTestUser } from '@data/users';

test.describe('flow: signup, login confirmation, and account deletion', () => {
  test('a new account can sign up, ends up logged in, and can delete itself', async ({
    signupLoginPage,
    homePage,
  }) => {
    const user = createTestUser('flow02');

    await signupLoginPage.goto();
    await signupLoginPage.signUp(user);

    await expect(
      signupLoginPage.confirmationHeading.filter({ hasText: 'Account Created' }),
    ).toBeVisible();
    await signupLoginPage.continueButton.click();

    // Signup logs the new user in immediately - confirm the header reflects it.
    await expect(homePage.loggedInAs).toContainText(user.name);

    // Clean up: this is a shared public site, so every account this suite
    // creates is responsible for deleting itself again.
    await signupLoginPage.deleteAccount();
    await expect(
      signupLoginPage.confirmationHeading.filter({ hasText: 'Account Deleted' }),
    ).toBeVisible();
  });

  test('logging in with an unknown email is rejected', async ({ signupLoginPage }) => {
    await signupLoginPage.goto();
    await signupLoginPage.login(`no-such-user-${Date.now()}@example.com`, 'wrong-password');

    await expect(signupLoginPage.loginErrorMessage).toBeVisible();
  });
});
