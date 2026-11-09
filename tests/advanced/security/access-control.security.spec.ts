import { test as base, expect } from '@fixtures/fixtures';
import type { NewAccountPayload } from '@api/ApiClient';
import { createTestUser } from '@data/users';

// Passive checks only: normal page visits and our own throwaway accounts.
interface AccountFixtures {
  existingUser: NewAccountPayload;
  loggedInUser: NewAccountPayload;
}

const test = base.extend<AccountFixtures>({
  existingUser: async ({ apiClient }, use) => {
    const user = createTestUser('access');
    expect((await apiClient.createAccount(user)).responseCode).toBe(201);
    await use(user);
    // no-op if the test already deleted it
    await apiClient.deleteAccount(user.email, user.password);
  },
  loggedInUser: async ({ existingUser, signupLoginPage, homePage }, use) => {
    await signupLoginPage.goto();
    await signupLoginPage.login(existingUser.email, existingUser.password);
    await expect(homePage.loggedInAs).toBeVisible();
    await use(existingUser);
  },
});

test.describe('access control', () => {
  test('opening /delete_account while logged out deletes nothing', async ({
    page,
    apiClient,
    existingUser,
  }) => {
    await page.goto('/delete_account');

    const { responseCode } = await apiClient.verifyLogin(existingUser.email, existingUser.password);
    expect(responseCode, 'account should still exist').toBe(200);
  });

  test('the user-details API reveals nothing about an unknown email', async ({ apiClient }) => {
    const body = await apiClient.getUserDetailByEmail(`nobody-${Date.now()}@example.com`);

    expect(body.responseCode).toBe(404);
    expect(body.user).toBeUndefined();
  });
});

// Known gaps on the site. test.fail() keeps these green until they're fixed.
test.describe('known access control gaps (expected to fail until fixed)', () => {
  test('a server error does not show the framework debug page', async ({ request }) => {
    test.fail(true, '/logout while logged out shows the Django DEBUG traceback and version');
    const response = await request.get('/logout', { maxRedirects: 0 });
    const body = await response.text();

    expect(body).not.toContain('DEBUG = True');
    expect(body).not.toMatch(/Django Version/i);
  });

  test('deleting an account needs more than a plain GET link', async ({
    page,
    homePage,
    loggedInUser,
  }) => {
    test.fail(true, 'Delete Account is a GET link - another site can link a user to it');
    expect(loggedInUser.email).toBeTruthy();

    const [request] = await Promise.all([
      page.waitForRequest((req) => req.url().includes('/delete_account')),
      homePage.deleteAccountLink.click(),
    ]);

    expect(request.method()).not.toBe('GET');
  });

  test('the user-details API needs the account password', async ({ apiClient, existingUser }) => {
    test.fail(true, 'getUserDetailByEmail returns name, address and birth date for any email');
    const body = await apiClient.getUserDetailByEmail(existingUser.email);

    expect(body.user).toBeUndefined();
  });
});
