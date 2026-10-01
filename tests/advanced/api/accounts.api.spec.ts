import { test, expect } from '@fixtures/fixtures';
import { createTestUser } from '@data/users';
import { endpoints } from '@api/endpoints';
import { env } from '@utils/env';

/**
 * Account endpoints: the full create -> verify -> delete lifecycle, plus the
 * negative paths. Each test creates its own uniquely-named user and deletes
 * it, so tests stay independent and safe to run in parallel.
 */
test.describe('accounts API', () => {
  test('an account goes through create -> verify login -> delete -> gone', async ({
    apiClient,
  }) => {
    const user = createTestUser('api-lifecycle');

    await test.step('create', async () => {
      const created = await apiClient.createAccount(user);
      expect(created.responseCode).toBe(201);
      expect(created.message).toBe('User created!');
    });

    await test.step('verify login with correct credentials', async () => {
      const login = await apiClient.verifyLogin(user.email, user.password);
      expect(login.responseCode).toBe(200);
      expect(login.message).toBe('User exists!');
    });

    await test.step('delete', async () => {
      const deleted = await apiClient.deleteAccount(user.email, user.password);
      expect(deleted.responseCode).toBe(200);
      expect(deleted.message).toBe('Account deleted!');
    });

    await test.step('login no longer works after deletion', async () => {
      const login = await apiClient.verifyLogin(user.email, user.password);
      expect(login.responseCode).toBe(404);
    });
  });

  test('creating an account with an email that already exists is rejected', async ({
    apiClient,
  }) => {
    const user = createTestUser('api-duplicate');
    expect((await apiClient.createAccount(user)).responseCode).toBe(201);

    try {
      const duplicate = await apiClient.createAccount(user);
      expect(duplicate.responseCode).toBe(400);
      expect(duplicate.message).toMatch(/already exists/i);
    } finally {
      await apiClient.deleteAccount(user.email, user.password);
    }
  });

  test('verifyLogin with a wrong password does not authenticate', async ({ apiClient }) => {
    const user = createTestUser('api-wrong-pw');
    expect((await apiClient.createAccount(user)).responseCode).toBe(201);

    try {
      const login = await apiClient.verifyLogin(user.email, `${user.password}-wrong`);
      expect(login.responseCode).toBe(404);
      expect(login.message).toBe('User not found!');
    } finally {
      await apiClient.deleteAccount(user.email, user.password);
    }
  });

  test('verifyLogin for an unknown email returns 404', async ({ apiClient }) => {
    const login = await apiClient.verifyLogin(`nobody-${Date.now()}@example.com`, 'irrelevant');

    expect(login.responseCode).toBe(404);
    expect(login.message).toBe('User not found!');
  });

  test('verifyLogin without an email parameter is a 400, not a 404', async ({ request }) => {
    // Missing input and wrong input are different failures - an API that
    // answers both with "User not found!" hides client bugs.
    const response = await request.post(`${env.apiBaseURL}${endpoints.verifyLogin}`, {
      form: { password: 'whatever' },
    });
    const body = await response.json();

    expect(body.responseCode).toBe(400);
    expect(body.message).toMatch(/email or password parameter is missing/i);
  });

  test('DELETE verifyLogin is rejected as an unsupported method', async ({ request }) => {
    const response = await request.delete(`${env.apiBaseURL}${endpoints.verifyLogin}`);
    const body = await response.json();

    expect(body.responseCode).toBe(405);
    expect(body.message).toMatch(/not supported/i);
  });
});
