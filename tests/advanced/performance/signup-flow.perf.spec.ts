import { test as base, expect } from '@fixtures/fixtures';
import type { NewAccountPayload } from '@api/ApiClient';
import { createTestUser } from '@data/users';

/**
 * Signup performance: how long a new visitor waits from the signup form to
 * being logged in to their new account. Signup is the first real thing a
 * new customer does on the site, and the other journey specs in this
 * folder skip it by creating accounts through the API.
 *
 * Like the rest of this folder it is a smoke check, not a load test: one
 * account, one pass, generous budgets (see homepage.perf.spec.ts for why).
 */
// The first page of a run has measured up to 7.3s on its own (a cold
// server), so 10s - the browse journey's limit - would be too tight here.
const STEP_BUDGET_MS = 15_000;
const SIGNUP_BUDGET_MS = 30_000;

const test = base.extend<{ newUser: NewAccountPayload }>({
  // The account is created by the test itself through the UI - this
  // fixture only supplies its details and deletes it afterwards, through
  // the API, whether or not the signup got all the way through.
  newUser: async ({ apiClient }, use) => {
    const user = createTestUser('perf-signup');
    await use(user);
    await apiClient.deleteAccount(user.email, user.password);
  },
});

test.describe('signup flow performance', () => {
  test('signup form -> account details -> account created -> logged in stays within budget', async ({
    newUser,
    signupLoginPage,
    homePage,
  }) => {
    const timings: Record<string, number> = {};

    // Each step ends on the thing the visitor is waiting to see, so the
    // number is "time until I can carry on", not "time until the click".
    async function timedStep(name: string, action: () => Promise<void>): Promise<void> {
      await test.step(name, async () => {
        const startedAt = Date.now();
        await action();
        timings[name] = Date.now() - startedAt;
      });
    }

    await timedStep('open signup page', async () => {
      await signupLoginPage.goto();
      await expect(signupLoginPage.signupButton).toBeVisible();
    });

    await timedStep('submit name and email', async () => {
      await signupLoginPage.startSignup(newUser.name, newUser.email);
      await expect(signupLoginPage.createAccountButton).toBeVisible();
    });

    await timedStep('submit account details', async () => {
      await signupLoginPage.completeAccountInformation(newUser);
      await expect(
        signupLoginPage.confirmationHeading.filter({ hasText: /account created/i }),
      ).toBeVisible();
    });

    await timedStep('continue to the site, logged in', async () => {
      await signupLoginPage.continueButton.click();
      await expect(homePage.loggedInAs).toContainText(newUser.name);
    });

    const total = Object.values(timings).reduce((sum, ms) => sum + ms, 0);
    await test.info().attach('signup-timings', {
      body: JSON.stringify({ ...timings, total }, null, 2),
      contentType: 'application/json',
    });

    // Soft, so the report shows every slow step rather than only the first.
    for (const [step, ms] of Object.entries(timings)) {
      expect.soft(ms, step).toBeLessThan(STEP_BUDGET_MS);
    }
    expect(total).toBeLessThan(SIGNUP_BUDGET_MS);
  });
});
