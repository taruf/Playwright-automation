import { defineConfig, devices } from '@playwright/test';
import { env } from './src/utils/env';

/**
 * Naming conventions that control execution scope (see README.md):
 *  - "*.api.spec.ts"      -> runs once, in the browserless "api" project
 *  - "*.a11y.spec.ts",
 *    "*.perf.spec.ts",
 *    "*.security.spec.ts" -> chromium only, to limit load on the shared
 *                            public demo site
 *  - everything else       -> chromium, firefox and webkit, as usual
 */
const apiSpecs = /\.api\.spec\.ts$/;
const chromiumOnlySpecs = /\.(a11y|perf|security)\.spec\.ts$/;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // automationexercise.com is a small shared practice site, not
  // infrastructure built for load: high worker counts have been observed to
  // both time out navigations and, once, cause the server to bleed unrelated
  // category text into a search response under concurrent hits (see
  // docs/target-application.md, "known quirks"). A modest worker count plus
  // one retry keeps the suite reliable without hammering someone else's site.
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : 2,
  // Playwright's default (30s) is a per-TEST budget, not a per-action one.
  // A multi-step flow (signup -> cart -> checkout -> payment -> confirm ->
  // delete, e.g. flow-03) chains several real round-trips against a real,
  // occasionally slow site, and can approach 30s on total time alone even
  // when every individual action is comfortably within its own timeout -
  // confirmed live: a "page.goto: Test timeout of 30000ms exceeded" on the
  // final cleanup step, despite that goto being fine in isolation.
  timeout: 60_000,
  reporter: 'html',
  use: {
    baseURL: env.baseURL,
    trace: 'on-first-retry',
    navigationTimeout: 45_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: [apiSpecs],
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      testIgnore: [apiSpecs, chromiumOnlySpecs],
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      testIgnore: [apiSpecs, chromiumOnlySpecs],
    },
    {
      name: 'api',
      testMatch: [apiSpecs],
    },
  ],
});
