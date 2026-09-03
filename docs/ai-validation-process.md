# AI Validation Process

A checklist to run before accepting AI-generated (or AI-assisted) test code

- yours or a tool's. Edit this until it reflects what you actually check;
  it's meant to evolve as the drill log below turns up new failure modes.

## Checklist

- [ ] **Run it.** Against the real target, not just a type-check. Passing
      `tsc` proves the code is well-typed, not that it does the right thing.
- [ ] **Check every locator's cardinality.** Does `getByRole`/`locator(...)`
      match exactly the elements you think it does? If you had to add
      `.first()` or `.nth()`, ask why there's more than one match at all
      before assuming that's fine.
- [ ] **Verify every assertion about the app's behavior independently**,
      not just about the DOM. If a test claims "search results contain the
      search term," confirm that's actually how the app's search works
      (cross-check against a second surface - the API, a manual run - rather
      than trusting the assumption baked into the assertion).
- [ ] **Look for missing teardown** on any test that creates state (an
      account, an order, cart contents) - especially against a shared public
      target, where leftover data isn't just untidy, it's someone else's
      problem.
- [ ] **Read the failure message it would produce.** A vague assertion
      (`expect(x).toBeTruthy()`) debugs badly at 2am; would this one tell you
      what actually went wrong?
- [ ] **Confirm it fails when it should.** Temporarily break the thing under
      test and make sure the test actually catches it - a test that always
      passes is worse than no test.

## Drill log

One row per function or test reviewed. The point of the drill isn't to fix
everything - it's to notice patterns worth adding to
`docs/ai-defect-taxonomy.md`.

| #   | What was reviewed                                  | Category (see taxonomy)             | Finding                                                                                                                                                            | Action taken                                                                                                             |
| --- | -------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | `tests/suacedemo.spec.ts` (`has title` test)       | Overly broad locator                | `getByRole('link', { name: 'Sauce' })` matched both the site's own "Sauce Demo" link and an unrelated third-party link, causing a Playwright strict-mode violation | Narrowed to an exact match on the actual link text                                                                       |
| 2   | Draft of `flow-01-search-and-view-product.spec.ts` | Unverified business-logic assertion | Draft asserted every search result's name contains the search term; the real app returns loosely-related results for "Dress" (confirmed via `/api/searchProduct`)  | Rewrote the assertion to cross-check the UI against the API's own search response instead of assuming substring matching |

Add your own rows as you complete the level 2 drills (review 10 AI-generated
functions, then 10 AI-generated tests).
