import { test as base, expect } from '@fixtures/fixtures';
import type { NewAccountPayload } from '@api/ApiClient';
import { createTestUser } from '@data/users';

const STEP_BUDGET_MS = 15_000;
const DELETION_BUDGET_MS = 30_000;

const test = base.extend<{ existingUser: NewAccountPayload }>({
  existingUser: async ({ apiClient }, use) => {
    const user = createTestUser('perf-delete');
    const { responseCode } = await apiClient.createAccount(user);
    expect(responseCode).toBe(201);
    await use(user);
    // no-op if the test already deleted it
    await apiClient.deleteAccount(user.email, user.password);
  },
});

test.describe('account deletion performance', () => {
  test('log in -> delete account -> continue logged out stays within budget', async ({
    existingUser,
    apiClient,
    signupLoginPage,
    homePage,
  }) => {
    const timings: Record<string, number> = {};

    async function timedStep(name: string, action: () => Promise<void>): Promise<void> {
      await test.step(name, async () => {
        const startedAt = Date.now();
        await action();
        timings[name] = Date.now() - startedAt;
      });
    }

    await timedStep('open login page', async () => {
      await signupLoginPage.goto();
      await expect(signupLoginPage.loginButton).toBeVisible();
    });

    await timedStep('log in', async () => {
      await signupLoginPage.login(existingUser.email, existingUser.password);
      await expect(homePage.loggedInAs).toBeVisible();
    });

    await timedStep('delete account', async () => {
      await homePage.deleteAccountLink.click();
      await expect(
        signupLoginPage.confirmationHeading.filter({ hasText: /account deleted/i }),
      ).toBeVisible();
    });

    await timedStep('continue to homepage', async () => {
      await signupLoginPage.continueButton.click();
      await expect(homePage.signupLoginLink).toBeVisible();
      await expect(homePage.loggedInAs).toBeHidden();
    });

    const { responseCode } = await apiClient.verifyLogin(existingUser.email, existingUser.password);
    expect(responseCode, 'account should no longer exist').toBe(404);

    const total = Object.values(timings).reduce((sum, ms) => sum + ms, 0);
    await test.info().attach('deletion-timings', {
      body: JSON.stringify({ ...timings, total }, null, 2),
      contentType: 'application/json',
    });

    for (const [step, ms] of Object.entries(timings)) {
      expect.soft(ms, step).toBeLessThan(STEP_BUDGET_MS);
    }
    expect(total).toBeLessThan(DELETION_BUDGET_MS);
  });
});
