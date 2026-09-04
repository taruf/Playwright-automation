# Target application: automationexercise.com

## Why this site

The curriculum needs one app that supports UI flows, an API-setup/UI-verify
hybrid pattern, and pure API testing, without switching targets between
levels. [automationexercise.com](https://automationexercise.com) is a full
e-commerce UI (catalog, search, cart, checkout, account management, a
contact form) with a documented public REST API
(https://automationexercise.com/api_list) on the same domain, and it ships
`data-qa` attributes on most interactive elements - built specifically to be
automated against.

## API surface used in this repo

| Endpoint             | Method        | Used by                     |
| -------------------- | ------------- | --------------------------- |
| `/api/productsList`  | GET           | `ApiClient.getProductsList` |
| `/api/searchProduct` | POST (form)   | `ApiClient.searchProduct`   |
| `/api/verifyLogin`   | POST (form)   | `ApiClient.verifyLogin`     |
| `/api/createAccount` | POST (form)   | `ApiClient.createAccount`   |
| `/api/deleteAccount` | DELETE (form) | `ApiClient.deleteAccount`   |

Full field requirements for `createAccount` are captured in
`NewAccountPayload` (`src/api/ApiClient.ts`) and `createTestUser`
(`src/data/users.ts`).

## It's a shared public site - act accordingly

Every signup, order, and contact-form submission persists real data on
someone else's infrastructure. Two rules follow from that:

1. **Clean up what you create.** Any test that signs up an account deletes
   it again (via `ApiClient.deleteAccount` or the UI "Delete Account" link)
   before it finishes. `createTestUser` timestamps the email so concurrent
   runs don't collide.
2. **Don't hammer it.** `playwright.config.ts` deliberately caps local
   workers at 2 (1 on CI) and adds a retry - see "known quirks" below for
   why. Performance and security tests stay passive/smoke-level rather than
   generating load or running an active scanner (see the comments in
   `tests/advanced/performance/homepage.perf.spec.ts` and
   `.../security/security-headers.security.spec.ts`).

## Known quirks (confirmed while building this repo)

- **Guest checkout is blocked.** Clicking "Proceed To Checkout" while logged
  out shows a modal ("Register / Login account to proceed on checkout")
  instead of a guest-checkout form. Every checkout flow in this repo signs
  up/logs in first.
- **Search isn't a strict substring match.** Searching `"Dress"` also
  returns products like "Sleeves Top and Short - Blue & Pink" - confirmed
  independently via `/api/searchProduct`, so it's the backend's behavior,
  not a UI bug. Tests that check search results compare the UI against the
  API's own response instead of assuming the search term appears in every
  result name (see `tests/fundamentals/flows/flow-01-*`).
- **Each product card renders twice.** `.product-image-wrapper` contains
  both an always-visible `.productinfo` block and a hover-only
  `.product-overlay` duplicate with the same "Add to cart" link and product
  name. A locator scoped only to the card matches both and trips Playwright
  strict mode - see `tests/fundamentals/01-locators.spec.ts` for the
  worked example, and `ProductsPage.addToCartCardByProductId` for the fix
  applied throughout the page objects.
- **Icon-prefixed nav links have a leading space in their accessible name.**
  Markup like `<a><i class="fa fa-lock"></i> Signup / Login</a>` computes to
  `" Signup / Login"` (leading space), so `getByRole('link', { name: 'Signup
/ Login', exact: true })` matches nothing even though the link exists.
  Non-exact (substring) matches work fine.
- **Live ad-injection scripts mutate visible product-name text.** This site
  runs third-party contextual-ad tooling (visible in its `<head>`:
  `pagead2.googlesyndication.com`, `fundingchoicesmessages.google.com`,
  `adsbygoogle`) that rewrites the DOM inside the same `<p>` that holds a
  product's name, in two different ways confirmed on the real site:
  appending a whole sponsored-content chip after the name (e.g. "Apparel",
  "Take Economics Courses" appended straight onto real names), and, once,
  wrapping a real word _inside_ the name in its own element (`"Sleeveless
Dress"` read back as just `"Sleeveless"`). Because it can also alter text
  that's genuinely part of the name, no amount of cleverness reading the
  element's text (e.g. direct text-node children only, which was tried and
  disproven here) reliably tells "real" from "injected" apart - the fix has
  to happen before the ad script runs at all. The `page` fixture
  (`src/fixtures/fixtures.ts`) blocks the ad network's hosts outright via
  `page.route(...)`, so nothing ever gets injected in the first place.
  Reproducible even running a single test serially, so it was never a
  server-concurrency artifact either, despite how it first looked.
- **Higher local concurrency has still caused real navigation timeouts**,
  independent of the ad-injection issue above - this small public site isn't
  provisioned for heavy parallel load. It's why local `workers` is capped at
  2 with 1 retry rather than left at the default.
- **"Proceed To Checkout" occasionally doesn't register its click.** Reproduced
  both outcomes (navigates to `/checkout`; silently stays on `/view_cart`)
  from an identical script with no code difference between runs - confirmed
  it's not a locator problem (the element resolves uniquely both times).
  `CartPage.proceedToCheckout()` verifies the navigation actually happened
  and retries the click once if it didn't, rather than the whole test
  eating a long timeout on it.
- **The homepage has real, pre-existing accessibility violations.** An axe
  scan finds 1 button-name, 41 color-contrast, and 4 link-name violations
  (all serious/critical) - not something this repo can fix upstream.
  `tests/advanced/accessibility/homepage.a11y.spec.ts` checks against
  a documented baseline of these counts rather than asserting zero
  violations, so it still catches a genuinely _new_ regression without
  being permanently red over issues outside this repo's control.
