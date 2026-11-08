import { test, expect } from '@fixtures/fixtures';
import { env } from '@utils/env';

const SITE_PATHS = [
  '/',
  '/products',
  '/product_details/1',
  '/login',
  '/view_cart',
  '/contact_us',
  '/test_cases',
  '/api_list',
];

// these serve generated files, so they can't be pinned with an integrity hash
const UNPINNABLE_HOSTS = new Set([
  'pagead2.googlesyndication.com',
  'maps.google.com',
  'fonts.googleapis.com',
]);

interface ExternalAsset {
  url: string;
  hasIntegrity: boolean;
}

interface NewTabLink {
  href: string;
  rel: string;
}

test.describe('third-party content', () => {
  test('third-party scripts and stylesheets that can be pinned carry an integrity hash', async ({
    page,
  }) => {
    const assets = new Map<string, ExternalAsset>();

    for (const path of SITE_PATHS) {
      await page.goto(path);
      const found = await page.evaluate(() =>
        [
          ...document.querySelectorAll<HTMLScriptElement>('script[src]'),
          ...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
        ]
          .map((el) => ({
            url: el instanceof HTMLScriptElement ? el.src : el.href,
            hasIntegrity: Boolean(el.integrity),
          }))
          .filter((asset) => new URL(asset.url).origin !== location.origin),
      );
      found.forEach((asset) => assets.set(asset.url, asset));
    }

    await test.info().attach('third-party-assets', {
      body: JSON.stringify([...assets.values()], null, 2),
      contentType: 'application/json',
    });

    const unpinned = [...assets.values()]
      .filter((asset) => !UNPINNABLE_HOSTS.has(new URL(asset.url).hostname))
      .filter((asset) => !asset.hasIntegrity)
      .map((asset) => asset.url);
    expect(unpinned).toEqual([]);
  });

  test('links that open another site in a new tab use rel="noopener"', async ({ page }) => {
    const unsafe: NewTabLink[] = [];

    for (const path of SITE_PATHS) {
      await page.goto(path);
      const links = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLAnchorElement>('a[target="_blank"]')]
          .filter((a) => new URL(a.href, location.href).origin !== location.origin)
          .map((a) => ({ href: a.href, rel: a.rel })),
      );
      unsafe.push(...links.filter((link) => !/\bno(opener|referrer)\b/.test(link.rel)));
    }

    expect(unsafe).toEqual([]);
  });

  test('a page opened in a new tab cannot reach back to the site through window.opener', async ({
    page,
  }) => {
    // the API list links open in a new tab without rel="noopener"
    await page.goto('/api_list');

    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.evaluate(() => document.querySelector<HTMLAnchorElement>('a[target="_blank"]')?.click()),
    ]);
    await popup.waitForLoadState();

    expect(popup.url()).toContain(env.apiBaseURL);
    expect(await popup.evaluate(() => window.opener === null)).toBe(true);
  });
});
