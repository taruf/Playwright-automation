import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('https://sauce-demo.myshopify.com/');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Sauce Demo/);
  await expect(page.getByRole('link', { name: 'Sauce', exact: true })).toBeVisible();
});

