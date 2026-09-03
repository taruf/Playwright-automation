import type { Page } from '@playwright/test';

/**
 * Common surface every page object shares. Keep this minimal on purpose —
 * add a method here only when at least two page objects would otherwise
 * duplicate it.
 */
export abstract class BasePage {
  constructor(protected readonly page: Page) {}

  async goto(path: string): Promise<void> {
    await this.page.goto(path);
  }
}
