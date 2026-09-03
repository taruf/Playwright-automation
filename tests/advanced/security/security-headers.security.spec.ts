import { test, expect } from '@fixtures/fixtures';

/**
 * "Security testing basics" here means passive, read-only inspection of
 * what the server and browser are already telling us - response headers and
 * cookie flags - not active scanning. This site is a public practice
 * target, not something we have authorization to run an intrusive scanner
 * (e.g. an OWASP ZAP active scan) against; a baseline ZAP scan against a
 * target you're authorized to test is the natural next step beyond this
 * file, wired into CI the same way playwright.yml runs this suite.
 */
test.describe('security basics', () => {
  test('the site is served over HTTPS', async ({ page }) => {
    await page.goto('/');
    expect(page.url()).toMatch(/^https:\/\//);
  });

  test('response security headers are reported, not assumed', async ({ request }) => {
    const response = await request.get('/');
    const headers = response.headers();

    const expectedHeaders = [
      'strict-transport-security',
      'x-content-type-options',
      'x-frame-options',
      'content-security-policy',
    ];
    const present = expectedHeaders.filter((name) => name in headers);
    const missing = expectedHeaders.filter((name) => !(name in headers));

    // Recorded rather than hard-failed: this is a third-party site we don't
    // control, so the useful outcome is an accurate report of its current
    // posture, not a red CI run every time an external team's config drifts.
    await test.info().attach('security-headers', {
      body: JSON.stringify({ present, missing }, null, 2),
      contentType: 'application/json',
    });

    expect(response.status()).toBe(200);
  });

  test('cookies set on the homepage carry expected flags', async ({ page, context }) => {
    await page.goto('/');
    const cookies = await context.cookies();

    // Session-identifying cookies should not be readable from JS.
    const sessionCookies = cookies.filter((cookie) =>
      cookie.name.toLowerCase().includes('session'),
    );
    for (const cookie of sessionCookies) {
      expect(cookie.httpOnly).toBe(true);
    }

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
  });
});
