# Level 3 — Advanced Topics

The task checklist lives in
[`tests/advanced/README.md`](../../tests/advanced/README.md);
this page just maps each curriculum topic to where it's addressed.

| Topic                                 | Where                                                                                                                                                                       |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API testing beyond status codes       | [`tests/advanced/api/products.api.spec.ts`](../../tests/advanced/api/products.api.spec.ts)                                                                      |
| Modern API tools refresh              | No code - explore Postman/Bruno/Insomnia against `automationexercise.com/api_list`                                                                                          |
| Backend & root-cause skills           | No dedicated exercise - practice reading response bodies/headers before assuming a locator problem                                                                          |
| CI/CD: Playwright in GitHub Actions   | [`.github/workflows/playwright.yml`](../../.github/workflows/playwright.yml)                                                                                                |
| Accessibility (one evening)           | [`tests/advanced/accessibility/homepage.a11y.spec.ts`](../../tests/advanced/accessibility/homepage.a11y.spec.ts)                                                |
| Performance/load (one evening)        | [`tests/advanced/performance/homepage.perf.spec.ts`](../../tests/advanced/performance/homepage.perf.spec.ts) - smoke-level only, see the file's comment for why |
| Security testing basics (one evening) | [`tests/advanced/security/security-headers.security.spec.ts`](../../tests/advanced/security/security-headers.security.spec.ts) - passive checks only            |
