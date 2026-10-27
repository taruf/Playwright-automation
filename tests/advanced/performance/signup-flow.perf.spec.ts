import { test as base, expect } from '@fixtures/fixtures';
import type { NewAccountPayload } from '@api/ApiClient';
import { createTestUser } from '@data/users';

// first page load has taken up to 7.3s, so 10s was too tight
const STEP_BUDGET_MS = 15_000;
const SIGNUP_BUDGET_MS = 30_000;

const test = base.extend<{ newUser: NewAccountPayload }>({
  // test signs up through the UI; this just cleans up afterwards
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

    for (const [step, ms] of Object.entries(timings)) {
      expect.soft(ms, step).toBeLessThan(STEP_BUDGET_MS);
    }
    expect(total).toBeLessThan(SIGNUP_BUDGET_MS);
  });
});
