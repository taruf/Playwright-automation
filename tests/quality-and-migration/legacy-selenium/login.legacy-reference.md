# Before: a Selenium WebDriver login test

Reference only — this is what a "typical" Selenium WebDriver test for the
Automation Exercise login form looked like before migration. It isn't
runnable as-is (no `selenium-webdriver` dependency in this repo, and it's
kept as Markdown specifically so no test runner ever tries to execute it).
Compare it against [`../migrated/login.spec.ts`](../migrated/login.spec.ts),
which is the same behavior rebuilt in Playwright.

```javascript
const { Builder, By, until } = require('selenium-webdriver');

describe('login', function () {
  this.timeout(30000);
  let driver;

  beforeEach(async function () {
    driver = await new Builder().forBrowser('chrome').build();
  });

  afterEach(async function () {
    await driver.quit();
  });

  it('rejects an unknown email', async function () {
    await driver.get('https://automationexercise.com/login');

    const emailInput = await driver.wait(
      until.elementLocated(By.css('input[data-qa="login-email"]')),
      10000,
    );
    await emailInput.sendKeys('no-such-user@example.com');

    const passwordInput = await driver.findElement(By.css('input[data-qa="login-password"]'));
    await passwordInput.sendKeys('wrong-password');

    const loginButton = await driver.findElement(By.css('button[data-qa="login-button"]'));
    await loginButton.click();

    // Explicit wait: nothing about the framework knows when the page is
    // "ready" - every dynamic condition needs its own wait call.
    const errorMessage = await driver.wait(
      until.elementLocated(By.xpath("//p[contains(text(), 'incorrect')]")),
      10000,
    );
    const isDisplayed = await errorMessage.isDisplayed();
    if (!isDisplayed) {
      throw new Error('Expected error message to be visible');
    }
  });
});
```

## What migration actually changes

| Selenium WebDriver                                                                | Playwright                                                                                          | Why it matters                                                                                                                        |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `driver.wait(until.elementLocated(...), ms)` before every interaction             | `page.locator(...)` + auto-waiting `expect(...)`                                                    | Playwright locators are lazy and every action/assertion retries on its own; there's no separate "wait strategy" to get wrong.         |
| `By.xpath("//p[contains(text(), 'incorrect')]")`                                  | `page.getByText(/incorrect/i)`                                                                      | Role/text-based locators read closer to what a user sees, and don't break when an unrelated wrapper `<div>` gets added.               |
| `driver.findElement(...)` throws immediately if the element isn't there yet       | `page.locator(...)` never throws on creation - only when acted on/asserted, and only after retrying | Removes an entire class of "element not found because I checked one tick too early" flakiness.                                        |
| Manual `try/finally`-style `beforeEach`/`afterEach` to launch and `driver.quit()` | Playwright Test's `page` fixture launches and tears down a browser context per test automatically   | Less boilerplate, and a crashed test still cleans up its browser.                                                                     |
| `if (!isDisplayed) throw new Error(...)`                                          | `await expect(locator).toBeVisible()`                                                               | Web-first assertions are self-describing on failure (locator, expected state, actual DOM snapshot) instead of a generic thrown error. |

The AI-validation habit from `docs/ai-validation-process.md` applies just as
much to migrated code as to newly generated code: run it, don't assume a
1:1 translation of Selenium calls onto Playwright APIs is correct just
because it type-checks.
