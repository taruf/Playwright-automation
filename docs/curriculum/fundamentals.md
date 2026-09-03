# Level  1 — Fundamentals

Everything in this level is fully implemented and runnable
(`npm run test:fundamentals`). Read the code, run it, then modify it - the fastest
way to learn a fixture or locator pattern is to break it on purpose and see
what Playwright reports.

| Topic                                 | Where                                                                                                                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TypeScript essentials                 | No dedicated file - `src/` uses interfaces, generics-free typed fixtures, and strict mode throughout. Read `src/api/ApiClient.ts` and `src/fixtures/fixtures.ts` as real (small) examples. |
| Playwright setup & core concepts      | `playwright.config.ts`, `package.json` scripts                                                                                                                                             |
| Locators the Playwright way           | `tests/fundamentals/01-locators.spec.ts`                                                                                                                                             |
| Assertions & auto-waiting             | `tests/fundamentals/02-assertions-and-autowaiting.spec.ts`                                                                                                                           |
| Fixtures & test organization          | `tests/fundamentals/03-fixtures.spec.ts`, `src/fixtures/fixtures.ts`                                                                                                                 |
| Build: 5 flows on demo sites          | `tests/fundamentals/flows/*.spec.ts`                                                                                                                                                 |
| Hybrid pattern: API setup + UI verify | `tests/fundamentals/hybrid/api-setup-ui-verify.spec.ts`                                                                                                                              |
| GitHub repo + start AI habit          | Commit this repo; start logging entries in `docs/ai-validation-process.md` as you go, don't wait for level 2.                                                                               |

## Suggested order

1. Run `npm install` and `npx playwright test --list` to see every spec this
   repo defines without running anything yet.
2. Read `src/pages/BasePage.ts` through `ContactUsPage.ts` - these are the
   page objects every flow test uses.
3. Run `01-locators.spec.ts`, `02-assertions-and-autowaiting.spec.ts`, and
   `03-fixtures.spec.ts` first (`npx playwright test tests/fundamentals/0*`)
   - they're the fastest and most concept-dense.
4. Run the five flows (`npx playwright test tests/fundamentals/flows`).
5. Run the hybrid test and compare it against a flow test that does the same
   signup purely through the UI (`flow-02-*`) - notice how much faster the
   API-setup version is.
6. Pick one flow and rewrite its page-object calls back into raw
   `page.locator(...)` calls, then revert. Feeling that difference is the
   point of the "fixtures & test organization" topic.
