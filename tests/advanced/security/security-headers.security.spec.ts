import { test as base, expect } from '@fixtures/fixtures';
import type { NewAccountPayload } from '@api/ApiClient';
import { endpoints } from '@api/endpoints';
import { createTestUser } from '@data/users';
import { HomePage } from '@pages/HomePage';
import { env } from '@utils/env';

/**
 * "Security testing basics" here means passive, read-only inspection of
 * what the server and browser are already telling us - response headers,
 * cookie flags, form markup - plus ordinary user actions (log in, log out)
 * on an account this suite creates and deletes itself. It is not active
 * scanning: no injection payloads, no fuzzing, no brute force. This site is
 * a public practice target, not something we have authorization to run an
 * intrusive scanner (e.g. an OWASP ZAP active scan) against; a baseline ZAP
 * scan against a target you're authorized to test is the natural next step
 * beyond this file, wired into CI the same way playwright.yml runs this
 * suite.
 */
interface AccountFixtures {
  existingUser: NewAccountPayload;
  loggedInUser: NewAccountPayload;
}

const test = base.extend<AccountFixtures>({
  existingUser: async ({ apiClient }, use) => {
    const user = createTestUser('security');
    expect((await apiClient.createAccount(user)).responseCode).toBe(201);
    await use(user);
    await apiClient.deleteAccount(user.email, user.password);
  },
  loggedInUser: async ({ existingUser, signupLoginPage, homePage }, use) => {
    await signupLoginPage.goto();
    await signupLoginPage.login(existingUser.email, existingUser.password);
    await expect(homePage.loggedInAs).toBeVisible();
    await use(existingUser);
  },
});

const SESSION_COOKIE = 'sessionid';
const SITE_HOST = new URL(env.baseURL).hostname;
const SITE_PATHS = ['/', '/products', '/product_details/1', '/login', '/view_cart', '/contact_us'];
const API_PRODUCTS_URL = `${env.apiBaseURL}${endpoints.productsList}`;
const DAY_IN_SECONDS = 24 * 60 * 60;

test.describe('transport security', () => {
  test('the site is served over HTTPS', async ({ page }) => {
    await page.goto('/');
    expect(page.url()).toMatch(/^https:\/\//);
  });

  test('the connection uses modern TLS with a valid, matching certificate', async ({ page }) => {
    const response = await page.goto('/');
    const tls = await response?.securityDetails();

    await test.info().attach('tls-details', {
      body: JSON.stringify(tls, null, 2),
      contentType: 'application/json',
    });

    // TLS 1.0/1.1 are deprecated and no longer considered safe.
    expect(tls?.protocol).toMatch(/^TLS 1\.[23]$/);
    expect(tls?.subjectName).toBe(SITE_HOST);
    // An expired certificate takes the whole site down for every user, so
    // this is the early warning. The margin is small because the site's
    // 90-day certificates are renewed automatically close to expiry.
    const daysLeft = ((tls?.validTo ?? 0) - Date.now() / 1000) / DAY_IN_SECONDS;
    expect(daysLeft).toBeGreaterThan(7);
  });

  test('plain HTTP is permanently redirected to HTTPS', async ({ request }) => {
    const response = await request.get(env.baseURL.replace(/^https:/, 'http:'), {
      maxRedirects: 0,
    });

    // 301/308 are the permanent redirects; a 302 would work for users but
    // tells browsers and crawlers the HTTP URL is still the canonical one.
    expect([301, 308]).toContain(response.status());
    expect(response.headers()['location']).toMatch(/^https:\/\//);
  });

  test('pages load no plain-HTTP subresources beyond the known baseline', async ({ page }) => {
    // Mixed content: an HTTPS page pulling a resource over HTTP hands a
    // network attacker a way to tamper with it. The site's own templates
    // link Google Fonts over http:// (confirmed), so that host is the
    // documented baseline - anything else is a new finding.
    const knownInsecureHosts = new Set(['fonts.googleapis.com']);
    const insecureHosts = new Set<string>();
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.protocol === 'http:') insecureHosts.add(url.hostname);
    });

    for (const path of ['/', '/products', '/login', '/view_cart', '/contact_us']) {
      await page.goto(path);
    }

    await test.info().attach('insecure-request-hosts', {
      body: JSON.stringify([...insecureHosts], null, 2),
      contentType: 'application/json',
    });
    expect([...insecureHosts].filter((host) => !knownInsecureHosts.has(host))).toEqual([]);
  });
});

test.describe('response security headers', () => {
  test('the full header posture is attached to the report', async ({ request }) => {
    const response = await request.get('/');
    const headers = response.headers();

    const expectedHeaders = [
      'strict-transport-security',
      'x-content-type-options',
      'x-frame-options',
      'content-security-policy',
      'referrer-policy',
      'permissions-policy',
    ];
    const present = Object.fromEntries(
      expectedHeaders.filter((name) => name in headers).map((name) => [name, headers[name]]),
    );
    const missing = expectedHeaders.filter((name) => !(name in headers));

    await test.info().attach('security-headers', {
      body: JSON.stringify({ present, missing }, null, 2),
      contentType: 'application/json',
    });

    expect(response.status()).toBe(200);
  });

  test('X-Content-Type-Options stops browsers from MIME-sniffing responses', async ({
    request,
  }) => {
    const response = await request.get('/');
    expect(response.headers()['x-content-type-options']).toBe('nosniff');
  });

  test('X-Frame-Options stops other sites from framing the page (clickjacking)', async ({
    request,
  }) => {
    const response = await request.get('/');
    expect(response.headers()['x-frame-options']).toMatch(/^(DENY|SAMEORIGIN)$/i);
  });

  test('Referrer-Policy does not leak full URLs to other origins', async ({ request }) => {
    const response = await request.get('/');
    expect(response.headers()['referrer-policy']).toMatch(
      /^(no-referrer|same-origin|strict-origin|strict-origin-when-cross-origin)$/,
    );
  });
});

test.describe('login form', () => {
  test('submits credentials by POST to a same-origin HTTPS endpoint', async ({
    signupLoginPage,
  }) => {
    await signupLoginPage.goto();

    const form = await signupLoginPage.loginPasswordInput.evaluate((input: HTMLInputElement) => ({
      method: input.form?.method,
      action: input.form?.action,
    }));

    // A GET form would put the password in the URL - and from there into
    // browser history, server logs and Referer headers.
    expect(form.method).toBe('post');
    expect(form.action).toMatch(new RegExp(`^${env.baseURL}/`));
  });

  test('carries a CSRF token', async ({ signupLoginPage }) => {
    await signupLoginPage.goto();

    const token = await signupLoginPage.loginPasswordInput.evaluate(
      (input: HTMLInputElement) =>
        input.form?.querySelector<HTMLInputElement>('input[name="csrfmiddlewaretoken"]')?.value,
    );

    expect(token).toMatch(/\S{20,}/);
  });

  test('masks the password as it is typed', async ({ signupLoginPage }) => {
    await signupLoginPage.goto();
    await expect(signupLoginPage.loginPasswordInput).toHaveAttribute('type', 'password');
  });

  test('a failed login keeps the credentials out of the URL', async ({ page, signupLoginPage }) => {
    const email = 'nobody@example.com';
    const password = 'wrong-password';
    await signupLoginPage.goto();
    await signupLoginPage.login(email, password);
    await expect(signupLoginPage.loginErrorMessage).toBeVisible();

    expect(page.url()).not.toContain(password);
    expect(decodeURIComponent(page.url())).not.toContain(email);
  });

  test('the error does not reveal whether an email is registered', async ({
    signupLoginPage,
    existingUser,
  }) => {
    // If "wrong password" and "no such account" read differently, the login
    // form doubles as a tool for checking which emails have accounts.
    await signupLoginPage.goto();
    await signupLoginPage.login(existingUser.email, `${existingUser.password}-wrong`);
    const wrongPasswordMessage = await signupLoginPage.loginErrorMessage.innerText();

    await signupLoginPage.goto();
    await signupLoginPage.login(`unregistered-${existingUser.email}`, existingUser.password);

    await expect(signupLoginPage.loginErrorMessage).toHaveText(wrongPasswordMessage);
  });
});

test.describe('cookies and session', () => {
  test('cookies set before login are attached to the report', async ({ page, context }) => {
    await page.goto('/');
    const cookies = await context.cookies();

    await test.info().attach('cookies', {
      body: JSON.stringify(
        cookies.map((c) => ({
          name: c.name,
          secure: c.secure,
          httpOnly: c.httpOnly,
          sameSite: c.sameSite,
        })),
        null,
        2,
      ),
      contentType: 'application/json',
    });

    // No session should exist until someone actually logs in.
    expect(cookies.map((c) => c.name)).not.toContain(SESSION_COOKIE);
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructuring loggedInUser is what logs in; the value itself isn't needed here.
  test('the session cookie is HttpOnly and SameSite', async ({ context, loggedInUser }) => {
    const session = (await context.cookies()).find((c) => c.name === SESSION_COOKIE);

    expect(session).toBeDefined();
    // HttpOnly keeps the cookie away from injected scripts; SameSite keeps
    // the browser from attaching it to requests other sites trigger.
    expect(session?.httpOnly).toBe(true);
    expect(['Lax', 'Strict']).toContain(session?.sameSite);
  });

  test('the session cookie is not readable from page JavaScript', async ({
    page,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructuring loggedInUser is what logs in; the value itself isn't needed here.
    loggedInUser,
  }) => {
    const visibleToScripts = await page.evaluate(() => document.cookie);

    expect(visibleToScripts).not.toContain(`${SESSION_COOKIE}=`);
  });

  test('logging out ends the session, even when navigating back', async ({
    page,
    homePage,
    loggedInUser,
  }) => {
    await expect(homePage.loggedInAs).toContainText(loggedInUser.name);

    await homePage.logoutLink.click();
    await expect(page).toHaveURL(/\/login$/);

    // The Back button must not resurrect an authenticated view.
    await page.goBack();
    await page.reload();
    await expect(homePage.loggedInAs).toBeHidden();
    await expect(homePage.signupLoginLink).toBeVisible();
  });

  test('a session cookie copied before logout stops working after logout', async ({
    browser,
    context,
    homePage,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructuring loggedInUser is what logs in; the value itself isn't needed here.
    loggedInUser,
  }) => {
    // Logout must end the session on the server, not just in this browser:
    // otherwise a cookie that was copied earlier (a shared computer, a
    // stolen backup) would keep working forever. A second, clean browser
    // context plays the part of "someone holding the old cookie".
    const session = (await context.cookies()).find((c) => c.name === SESSION_COOKIE);
    expect(session).toBeDefined();

    await homePage.logoutLink.click();
    await expect(homePage.signupLoginLink).toBeVisible();

    const otherContext = await browser.newContext();
    try {
      await otherContext.addCookies([
        { name: SESSION_COOKIE, value: session!.value, domain: session!.domain, path: '/' },
      ]);
      const otherPage = await otherContext.newPage();
      await otherPage.goto(env.baseURL);
      const otherHome = new HomePage(otherPage);

      await expect(otherHome.signupLoginLink).toBeVisible();
      await expect(otherHome.loggedInAs).toBeHidden();
    } finally {
      await otherContext.close();
    }
  });

  test('deleting an account ends its live session', async ({
    apiClient,
    homePage,
    loggedInUser,
  }) => {
    const deleted = await apiClient.deleteAccount(loggedInUser.email, loggedInUser.password);
    expect(deleted.responseCode).toBe(200);

    await homePage.goto();

    await expect(homePage.loggedInAs).toBeHidden();
  });

  test('the session cookie has a bounded lifetime and is scoped to this site only', async ({
    context,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructuring loggedInUser is what logs in; the value itself isn't needed here.
    loggedInUser,
  }) => {
    const session = (await context.cookies()).find((c) => c.name === SESSION_COOKIE);
    const daysUntilExpiry = ((session?.expires ?? Infinity) - Date.now() / 1000) / DAY_IN_SECONDS;

    // A session that never expires stays valid for whoever finds it later.
    expect(daysUntilExpiry).toBeLessThanOrEqual(30);
    // An exact host (no leading dot) keeps the cookie from subdomains.
    expect(session?.domain).toBe(SITE_HOST);
  });

  test('credentials are not left in the page source or browser storage after login', async ({
    page,
    loggedInUser,
  }) => {
    const stored = await page.evaluate(() =>
      JSON.stringify([{ ...localStorage }, { ...sessionStorage }]),
    );

    expect(await page.content()).not.toContain(loggedInUser.password);
    expect(stored).not.toContain(loggedInUser.password);
  });
});

test.describe('site-wide checks', () => {
  test('every page and the API send the anti-sniffing and anti-framing headers', async ({
    request,
  }) => {
    // A header set on the homepage only protects the homepage.
    for (const url of [...SITE_PATHS, API_PRODUCTS_URL]) {
      const headers = (await request.get(url)).headers();

      expect(headers['x-content-type-options'], url).toBe('nosniff');
      expect(headers['x-frame-options'], url).toMatch(/^(DENY|SAMEORIGIN)$/i);
    }
  });

  test('every POST form carries a CSRF token and submits to this site over HTTPS', async ({
    page,
  }) => {
    for (const path of SITE_PATHS) {
      await page.goto(path);
      const postForms = await page.evaluate(() =>
        [...document.forms]
          .filter((form) => form.method === 'post')
          .map((form) => ({
            action: form.action,
            hasCsrfToken: !!form.querySelector('input[name="csrfmiddlewaretoken"]'),
          })),
      );

      expect(postForms.length, path).toBeGreaterThan(0);
      for (const form of postForms) {
        expect(form.hasCsrfToken, `${path} -> ${form.action}`).toBe(true);
        expect(new URL(form.action).origin, path).toBe(env.baseURL);
      }
    }
  });

  test('scripts load only from the known set of hosts', async ({ page }) => {
    // Every third-party script host is code the site runs with full access
    // to the page. This is the inventory: a new host appearing is a change
    // someone should have reviewed (the supply-chain attack surface).
    const knownScriptHosts = new Set([
      SITE_HOST,
      'pagead2.googlesyndication.com',
      'static.cloudflareinsights.com',
      'maps.google.com',
    ]);
    const seenHosts = new Set<string>();

    for (const path of SITE_PATHS) {
      await page.goto(path);
      const hosts = await page.evaluate(() =>
        [...document.scripts].filter((s) => s.src).map((s) => new URL(s.src).hostname),
      );
      hosts.forEach((host) => seenHosts.add(host));
    }

    await test.info().attach('script-hosts', {
      body: JSON.stringify([...seenHosts], null, 2),
      contentType: 'application/json',
    });
    expect([...seenHosts].filter((host) => !knownScriptHosts.has(host))).toEqual([]);
  });

  test('an unknown URL does not expose framework debug output', async ({ request }) => {
    // A debug error page (stack trace, settings, file paths) is a map of
    // the server's internals. One ordinary mistyped URL is enough to check.
    const response = await request.get(`/qa-no-such-page-${Date.now()}`);
    const body = await response.text();

    expect(body).not.toMatch(/Traceback \(most recent call last\)/);
    expect(body).not.toMatch(/DEBUG = True|Django Version|Exception Value/);
  });

  test('the API does not grant cross-origin access to other websites', async ({ request }) => {
    const response = await request.get(API_PRODUCTS_URL, {
      headers: { Origin: 'https://example.com' },
    });
    const allowOrigin = response.headers()['access-control-allow-origin'];

    // Absent is the safe default; "*" or an echo of whatever Origin was
    // sent would let any website read API responses from a visitor's browser.
    expect(allowOrigin).toBeUndefined();
  });
});

/**
 * Known gaps in the live site's configuration, each confirmed by
 * measurement. `test.fail()` inverts the result: the test passes while the
 * gap exists and turns red the day the site closes it - the cue to remove
 * the marker and keep the test as a normal regression check. That keeps CI
 * green on a site we don't own while the report still lists every gap by
 * name (see the same pattern in accessibility/homepage.a11y.spec.ts).
 */
test.describe('known security gaps (expected to fail until fixed)', () => {
  test('Strict-Transport-Security tells browsers to never use plain HTTP', async ({ request }) => {
    test.fail(true, 'No HSTS header: the first visit can still be downgraded to HTTP');
    const response = await request.get('/');
    expect(response.headers()['strict-transport-security']).toMatch(/max-age=\d+/);
  });

  test('Content-Security-Policy restricts where scripts can load from', async ({ request }) => {
    test.fail(true, 'No CSP header: nothing limits injected or third-party scripts');
    const response = await request.get('/');
    expect(response.headers()).toHaveProperty('content-security-policy');
  });

  test('the server does not advertise its software and version', async ({ request }) => {
    test.fail(true, 'X-Powered-By discloses the app server name and exact version');
    const response = await request.get('/');
    expect(response.headers()).not.toHaveProperty('x-powered-by');
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructuring loggedInUser is what logs in; the value itself isn't needed here.
  test('the session cookie is marked Secure', async ({ context, loggedInUser }) => {
    test.fail(true, 'sessionid lacks Secure: it would be sent over plain HTTP too');
    const session = (await context.cookies()).find((c) => c.name === SESSION_COOKIE);

    expect(session?.secure).toBe(true);
  });

  test('the CSRF cookie is marked Secure', async ({ page, context }) => {
    test.fail(true, 'csrftoken lacks Secure');
    await page.goto('/');
    const csrf = (await context.cookies()).find((c) => c.name === 'csrftoken');

    expect(csrf?.secure).toBe(true);
  });

  test('logging in again issues a fresh session id', async ({
    context,
    homePage,
    signupLoginPage,
    loggedInUser,
  }) => {
    test.fail(true, 'The same sessionid is reused across logout and re-login (session fixation)');
    const sessionId = async () =>
      (await context.cookies()).find((c) => c.name === SESSION_COOKIE)?.value;
    const firstSessionId = await sessionId();

    await homePage.logoutLink.click();
    await signupLoginPage.login(loggedInUser.email, loggedInUser.password);
    await expect(homePage.loggedInAs).toBeVisible();

    expect(await sessionId()).not.toBe(firstSessionId);
  });

  test('logged-in pages tell browsers and proxies not to cache them', async ({
    page,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructuring loggedInUser is what logs in; the value itself isn't needed here.
    loggedInUser,
  }) => {
    test.fail(true, 'No Cache-Control header on authenticated responses');
    const response = await page.goto('/');

    expect(response?.headers()['cache-control']).toMatch(/no-store|private/);
  });

  test('the API labels its JSON responses as JSON', async ({ request }) => {
    test.fail(true, 'JSON is served as text/html (only nosniff stops it rendering as a page)');
    const response = await request.get(API_PRODUCTS_URL);

    expect(response.headers()['content-type']).toContain('application/json');
  });

  test('a security.txt tells researchers where to report vulnerabilities', async ({ request }) => {
    test.fail(true, 'No /.well-known/security.txt (RFC 9116)');
    const response = await request.get('/.well-known/security.txt');

    expect(response.status()).toBe(200);
    expect(await response.text()).toMatch(/^Contact:/m);
  });
});
