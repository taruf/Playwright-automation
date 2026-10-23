import { test, expect } from '@fixtures/fixtures';
import { createTestUser } from '@data/users';
import type { Product } from '@api/endpoints';

/**
 * Pure helper, deliberately kept OUTSIDE any test body: eslint-plugin-playwright's
 * `no-conditional-in-test` rule flags branching inside a test on principle - a
 * test's own body should be a straight line of requests and assertions, with
 * any real logic (like "which brand wins") factored out and named, exactly as
 * `ProductsPage.addToCartCardByProductId` factors locator logic out of specs.
 */
function mostCommonBrand(products: Product[]): { brand: string; count: number } | undefined {
  const productsPerBrand = new Map<string, number>();
  for (const product of products) {
    productsPerBrand.set(product.brand, (productsPerBrand.get(product.brand) ?? 0) + 1);
  }

  let top: { brand: string; count: number } | undefined;
  for (const [brand, count] of productsPerBrand) {
    if (!top || count > top.count) top = { brand, count };
  }
  return top;
}

/**
 * Request chaining: a later request's input comes from an earlier
 * response, not from a hard-coded value. This is the pattern behind most
 * "advanced" API testing - pagination with a next-page cursor, an id
 * returned from a POST driving a later GET, and so on.
 *
 * automationexercise.com's public API (see docs/target-application.md)
 * doesn't expose pagination - productsList/brandsList always return the
 * full collection in one response, with no page/cursor/limit parameter to
 * chain off. So this file demonstrates the same underlying skill three
 * other ways this API genuinely supports:
 *   1. a created resource's own identity (email/password) chained from the
 *      create call, into the verify call, into the cleanup call;
 *   2. a value discovered INSIDE one response (a product's name) chained
 *      into the next request's parameters, then cross-checked against that
 *      same original response's id;
 *   3. a value AGGREGATED from one response (the catalog's most common
 *      brand) chained into a lookup against a second, independent
 *      response (the brand list), instead of chaining a single item.
 */
test.describe('chained API requests', () => {
  test("create -> verify login -> delete, each step driven by the previous one's own data", async ({
    apiClient,
  }) => {
    // Step 0: build the payload locally - no network call yet.
    // `createTestUser` timestamps the email so this can run concurrently
    // with other tests without colliding on a real account
    // automationexercise.com actually persists.
    const user = createTestUser('chain-account');

    // Every call below chains off `user.email` / `user.password` - neither
    // is re-typed anywhere, they flow from this one object into every
    // request that follows.
    try {
      // REQUEST 1: create the account. POST /api/createAccount.
      // Nothing from `created` is read back out below - what's "chained"
      // here is that this call succeeding is the precondition that makes
      // request 2 meaningful at all.
      const created = await apiClient.createAccount(user);
      expect(created.responseCode).toBe(201);
      expect(created.message).toBe('User created!');

      // REQUEST 2: chained on request 1 - it can only return "User
      // exists!" because request 1 just created that exact email/password
      // combination. Swap in a wrong password here and this becomes a 404
      // instead: the two requests are coupled through shared server-side
      // state (the account itself), not through a literal value passed
      // between them in this test's own code.
      const login = await apiClient.verifyLogin(user.email, user.password);
      expect(login.responseCode).toBe(200);
      expect(login.message).toBe('User exists!');
    } finally {
      // REQUEST 3: cleanup, chained on the SAME credentials used to create
      // the account in request 1. `finally` means this still runs even if
      // an `expect` above throws - a failed assertion must never leave a
      // real account behind on a shared public site.
      await apiClient.deleteAccount(user.email, user.password);
    }
  });

  test('a product discovered in one response drives the next request, then is cross-checked', async ({
    apiClient,
  }) => {
    // REQUEST 1: fetch the full catalog. GET /api/productsList.
    // This response is what the rest of the test chains off - nothing
    // below is hard-coded against today's actual catalog contents.
    const { products } = await apiClient.getProductsList();

    // Whichever product happens to sit at index 1 in today's catalog
    // becomes the target. If the catalog's order or contents change
    // tomorrow, this test adapts instead of silently testing a product
    // that may no longer exist.
    const targetProduct = products[1];
    expect(targetProduct).toBeDefined();

    // REQUEST 2: chained on request 1's own data - `targetProduct.name`
    // (read out of the previous response, not a literal string typed into
    // this test) becomes this request's search term.
    // POST /api/searchProduct.
    const searchResult = await apiClient.searchProduct(targetProduct.name);
    expect(searchResult.responseCode).toBe(200);

    // Cross-check: request 2's results must contain a product whose id
    // matches request 1's. This is the actual point of chaining two real
    // requests instead of testing each endpoint in isolation - it proves
    // the two surfaces (catalog listing vs. search) agree about the exact
    // same product, not just that each one individually returns "something".
    const matched = searchResult.products.find((product) => product.id === targetProduct.id);
    expect(matched).toBeDefined();
    expect(matched?.name).toBe(targetProduct.name);
  });

  test("the catalog's most common brand, found by aggregating one response, is verified against a second", async ({
    apiClient,
  }) => {
    // REQUEST 1: fetch the full catalog. GET /api/productsList.
    const { products } = await apiClient.getProductsList();

    // No single item is chained here - a VALUE AGGREGATED from the whole
    // response is: which brand the most products in today's catalog claim.
    // The actual counting/branching logic lives in `mostCommonBrand` above,
    // outside this test body - see why in that function's own comment.
    const top = mostCommonBrand(products);
    // Guards the chain below: if the catalog were empty, `top` would stay
    // `undefined` and the real assertion would pass for the wrong reason
    // (nothing to look up).
    expect(top).toBeDefined();

    // REQUEST 2: chained on request 1's aggregated result - `top.brand`
    // (computed from request 1, not typed as a literal) is looked up
    // against an entirely independent endpoint. GET /api/brandsList.
    const { brands } = await apiClient.getBrandsList();
    const brandNames = new Set(brands.map((brand) => brand.brand));

    // Cross-check: the brand request 1's data says is most common must
    // genuinely exist in request 2's own, separately-maintained list -
    // catching a real-world bug class where a product references a brand
    // that was renamed or removed from the brand catalog itself.
    expect(brandNames.has(top?.brand as string)).toBe(true);
  });
});
