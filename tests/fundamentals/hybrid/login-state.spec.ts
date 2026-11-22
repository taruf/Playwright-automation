import { test, expect, AD_NETWORK_HOSTS } from '@fixtures/fixtures';
import type { NewAccountPayload } from '@api/ApiClient';
import { createTestUser } from '@data/users';
import { HomePage } from '@pages/HomePage';
import type { SignupLoginPage } from '@pages/SignupLoginPage';
import { env } from '@utils/env';

interface LoginPages {
  homePage: HomePage;
  signupLoginPage: SignupLoginPage;
}

test.describe('hybrid: login state', () => {
  test('a login saved from the UI is reused by a fresh browser context', async ({
    browser,
    context,
    apiClient,
    signupLoginPage,
    homePage,
  }) => {
    const user = createTestUser('hybrid-storage');
    expect((await apiClient.createAccount(user)).responseCode).toBe(201);

    await signupLoginPage.goto();
    await signupLoginPage.login(user.email, user.password);
    await expect(homePage.loggedInAs).toBeVisible();
    const statePath = test.info().outputPath('login-state.json');
    await context.storageState({ path: statePath });

    const freshContext = await browser.newContext({
      storageState: statePath,
      baseURL: env.baseURL,
    });
    await freshContext.route(
      (url) => AD_NETWORK_HOSTS.test(url.hostname),
      (route) => route.abort(),
    );
    const freshHome = new HomePage(await freshContext.newPage());
    await freshHome.goto();

    await expect(freshHome.loggedInAs).toContainText(user.name);
    await freshContext.close();

    const deleted = await apiClient.deleteAccount(user.email, user.password);
    expect(deleted.responseCode).toBe(200);
  });

  const cases = [
    {
      name: 'valid credentials',
      credentials: (user: NewAccountPayload) => ({ email: user.email, password: user.password }),
      apiCode: 200,
      uiResult: (pages: LoginPages) => pages.homePage.loggedInAs,
    },
    {
      name: 'wrong password',
      credentials: (user: NewAccountPayload) => ({
        email: user.email,
        password: `${user.password}-wrong`,
      }),
      apiCode: 404,
      uiResult: (pages: LoginPages) => pages.signupLoginPage.loginErrorMessage,
    },
    {
      name: 'unknown email',
      credentials: (user: NewAccountPayload) => ({
        email: `nobody-${Date.now()}@example.com`,
        password: user.password,
      }),
      apiCode: 404,
      uiResult: (pages: LoginPages) => pages.signupLoginPage.loginErrorMessage,
    },
  ];

  for (const { name, credentials, apiCode, uiResult } of cases) {
    test(`the UI and verifyLogin API agree on ${name}`, async ({
      apiClient,
      signupLoginPage,
      homePage,
    }) => {
      const user = createTestUser('hybrid-parity');
      expect((await apiClient.createAccount(user)).responseCode).toBe(201);
      const { email, password } = credentials(user);

      expect((await apiClient.verifyLogin(email, password)).responseCode).toBe(apiCode);

      await signupLoginPage.goto();
      await signupLoginPage.login(email, password);
      await expect(uiResult({ homePage, signupLoginPage })).toBeVisible();

      const deleted = await apiClient.deleteAccount(user.email, user.password);
      expect(deleted.responseCode).toBe(200);
    });
  }
});
