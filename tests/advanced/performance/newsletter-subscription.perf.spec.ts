import { test, expect } from '@fixtures/fixtures';

const SHOW_BUDGET_MS = 2_000;
const HIDE_BUDGET_MS = 5_000;
const PAGES = [
  { name: 'homepage', path: '/' },
  { name: 'cart page', path: '/view_cart' },
];

test.describe('newsletter subscription performance', () => {
  for (const { name, path } of PAGES) {
    test(`subscribing from the ${name} footer shows and clears the success message within budget`, async ({
      page,
      homePage,
    }) => {
      await page.goto(path);
      // submit handler is bound late, clicks before load do a full page post
      await page.waitForLoadState('load');
      await expect(homePage.subscribeButton).toBeVisible();

      // the site's script only shows a message - nothing is sent to the server
      const sentRequests: string[] = [];
      page.on('request', (req) => {
        if (req.method() === 'POST') sentRequests.push(req.url());
      });

      const startedAt = Date.now();
      await homePage.subscribe(`perf-subscribe-${Date.now()}@example.com`);
      await expect(homePage.subscribeSuccessMessage).toBeVisible();
      const shownMs = Date.now() - startedAt;

      await expect(homePage.subscribeSuccessMessage).toBeHidden({ timeout: HIDE_BUDGET_MS });
      await expect(homePage.subscribeEmailInput).toHaveValue('');
      const hiddenMs = Date.now() - startedAt;

      expect(page.url(), 'subscribing should not navigate away').toContain(path);
      test.info().annotations.push(
        { type: 'subscribe-shown-ms', description: String(shownMs) },
        { type: 'subscribe-hidden-ms', description: String(hiddenMs) },
        { type: 'formReachedServer', description: String(sentRequests.length > 0) },
      );
      expect(shownMs).toBeLessThan(SHOW_BUDGET_MS);
    });
  }
});
