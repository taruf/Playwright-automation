# QA Automation Playwright

A Playwright + TypeScript learning repo built around one target app,
[automationexercise.com](https://automationexercise.com) - a full
e-commerce UI plus a documented public REST API on the same domain. 
see `docs/target-application.md` for why this app and what its quirks
are.

## Quick start

```bash
npm install
npx playwright install
npm run test:fundamentals
```

## Project structure

```
src/
  pages/       Page objects (one per logical page/flow area of the site)
  api/         ApiClient + typed endpoint/response shapes for the public REST API
  fixtures/    Custom test/expect - extends Playwright's base test with the page objects and ApiClient as fixtures
  data/        Test data factories (e.g. createTestUser)
  utils/       env.ts - base URL configuration

tests/
  fundamentals/   Locators, assertions, fixtures, 5 UI flows, the API-setup/UI-verify hybrid pattern
  quality-and-migration/   Selenium -> Playwright migration example
  advanced/       API depth, accessibility, performance smoke check, security basics

docs/
  target-application.md         Why this app, its API surface, known quirks
  curriculum/                   Topic -> file map
  ai-defect-taxonomy.md         Categories for classifying AI/code-review findings
  ai-validation-process.md      Checklist + drill log for reviewing AI-generated test code
  flagship-ai-stories.md        Template for the two flagship AI stories
```

Every spec imports `test`/`expect` from `src/fixtures/fixtures.ts`, not from
`@playwright/test` directly - that's what makes `homePage`, `productsPage`,
`apiClient`, etc. available as fixtures instead of being constructed by
hand in every test.

## Running tests

```bash
npm test                # everything
npm run test:fundamentals      # one level at a time
npm run test:quality-and-migration
npm run test:advanced
npm run test:ui         # Playwright's UI mode
npm run test:headed     # headed browser
npm run report          # open the last HTML report
npm run codegen         # Playwright codegen against the target site
```

### Execution-scope conventions

File naming controls which Playwright project(s) a spec runs under (see
`playwright.config.ts`):

| Suffix                                                   | Runs in                                  |
| -------------------------------------------------------- | ---------------------------------------- |
| `*.api.spec.ts`                                          | The browserless `api` project only, once |
| `*.a11y.spec.ts`, `*.perf.spec.ts`, `*.security.spec.ts` | `chromium` only                          |
| everything else                                          | `chromium`, `firefox`, and `webkit`      |

This keeps load on the shared public target down - accessibility/perf/
security checks don't need three-browser coverage, and API tests don't need
a browser at all.

### Overriding the target

```bash
BASE_URL=https://staging.example.com npm test        # bash
$env:BASE_URL="https://staging.example.com"; npm test # PowerShell
```

Defaults live in `src/utils/env.ts` and point at the public site, so no
setup is required to get started.

## Tooling

- `npm run lint` — ESLint, including `eslint-plugin-playwright`'s
  recommended rules (catches exactly the class of locator/assertion
  mistakes documented in `docs/ai-validation-process.md`).
- `npm run format` — Prettier.
- `.github/workflows/playwright.yml` — runs the full suite on push/PR.

## A note on being a good citizen

This repo's target is a small, shared public practice site, not
infrastructure built to absorb load. `playwright.config.ts` caps local
concurrency and adds a retry because of real flakiness observed while
building this repo (see `docs/target-application.md`, "known quirks"), and
performance/security tests stay at smoke/passive level rather than
generating load or running active scans. Any test that creates account data
also deletes it before finishing.
