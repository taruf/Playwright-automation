# Advanced Topics

One worked example per subtopic lives here as a starting pattern; extend
each one rather than starting from scratch.

## Checklist

- [ ] **API testing beyond status codes** — done, see
      [`api/products.api.spec.ts`](api/products.api.spec.ts). Add a test for
      `brandsList` or `verifyLogin` following the same pattern: assert shape
      and content, not just `responseCode === 200`.
- [ ] **Modern API tools refresh** — spend an evening in Postman, Bruno, or
      Insomnia against `https://automationexercise.com/api_list`; compare
      the experience of exploring an API that way versus only ever hitting
      it through `ApiClient`.
- [ ] **Backend & root-cause skills** — no code exercise here by design; next
      time a test fails against the real site, practice reading the
      response body/status/headers first before assuming it's a locator
      problem. `security-headers.security.spec.ts` and
      `products.api.spec.ts` both model "inspect the response, don't guess."
- [ ] **CI/CD: Playwright in GitHub Actions** — done, see
      `.github/workflows/playwright.yml`. Read it end to end, then try
      adding a matrix over the `chromium`/`api` projects so they run in
      parallel jobs instead of one sequential `npx playwright test`.
- [ ] **Accessibility (one evening)** — done, see
      [`accessibility/homepage.a11y.spec.ts`](accessibility/homepage.a11y.spec.ts).
      Run it against `/products` and `/login` too and see what axe finds on
      form-heavy pages versus the homepage.
- [ ] **Performance/load (one evening)** — done at smoke-check scale, see
      [`performance/homepage.perf.spec.ts`](performance/homepage.perf.spec.ts)
      and its comment on why this repo doesn't run real load tests against a
      shared public site. If you want to practice real load testing, point
      k6 or Artillery at a small app you run locally instead.
- [ ] **Security testing basics (one evening)** — done, see
      [`security/security-headers.security.spec.ts`](security/security-headers.security.spec.ts).
      Read up on OWASP ZAP's baseline scan mode next; it's the natural next
      step once you have a target you're authorized to scan.
