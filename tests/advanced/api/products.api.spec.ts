import { test, expect } from '@fixtures/fixtures';
import { endpoints } from '@api/endpoints';
import { env } from '@utils/env';

test.describe('products API', () => {
  test('GET productsList returns a well-formed product catalog', async ({ apiClient }) => {
    const { responseCode, products } = await apiClient.getProductsList();

    expect(responseCode).toBe(200);
    expect(Array.isArray(products)).toBe(true);
    expect(products.length).toBeGreaterThan(0);

    for (const product of products.slice(0, 10)) {
      expect(typeof product.id).toBe('number');
      expect(typeof product.name).toBe('string');
      expect(product.name.length).toBeGreaterThan(0);
      // price is a formatted string, e.g. "Rs. 500"
      expect(product.price).toMatch(/^Rs\. \d+$/);
      expect(typeof product.category.category).toBe('string');
    }
  });

  test('POST searchProduct without a search term is a client error, not a crash', async ({
    request,
  }) => {
    const response = await request.post('https://automationexercise.com/api/searchProduct');
    const body = await response.json();

    expect(body.responseCode).toBe(400);
    expect(body.message).toMatch(/search_product/);
  });

  test('POST searchProduct only returns products the API itself considers matches', async ({
    apiClient,
  }) => {
    const { products } = await apiClient.searchProduct('Dress');

    expect(products.length).toBeGreaterThan(0);
    const { products: allProducts } = await apiClient.getProductsList();
    const allIds = new Set(allProducts.map((p) => p.id));
    for (const product of products) {
      expect(allIds.has(product.id)).toBe(true);
    }
  });

  test('POST searchProduct for a term that matches nothing returns an empty list, not an error', async ({
    apiClient,
  }) => {
    const { responseCode, products } = await apiClient.searchProduct('zzz-no-such-product-zzz');

    expect(responseCode).toBe(200);
    expect(products).toEqual([]);
  });

  test('product ids in the catalog are unique', async ({ apiClient }) => {
    const { products } = await apiClient.getProductsList();
    const ids = products.map((p) => p.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  test('POST productsList is rejected as an unsupported method', async ({ request }) => {
    // errors come back as HTTP 200 with responseCode in the body
    const response = await request.post(`${env.apiBaseURL}${endpoints.productsList}`);
    const body = await response.json();

    expect(body.responseCode).toBe(405);
    expect(body.message).toMatch(/not supported/i);
  });
});

test.describe('brands API', () => {
  test('GET brandsList returns a well-formed brand list', async ({ apiClient }) => {
    const { responseCode, brands } = await apiClient.getBrandsList();

    expect(responseCode).toBe(200);
    expect(brands.length).toBeGreaterThan(0);
    for (const brand of brands) {
      expect(typeof brand.id).toBe('number');
      expect(brand.brand.length).toBeGreaterThan(0);
    }
  });

  test('every product references a brand that exists in brandsList', async ({ apiClient }) => {
    const [{ products }, { brands }] = await Promise.all([
      apiClient.getProductsList(),
      apiClient.getBrandsList(),
    ]);
    const brandNames = new Set(brands.map((b) => b.brand));

    for (const product of products) {
      expect(brandNames, `product ${product.id} brand "${product.brand}"`).toContain(product.brand);
    }
  });

  test('PUT brandsList is rejected as an unsupported method', async ({ request }) => {
    const response = await request.put(`${env.apiBaseURL}${endpoints.brandsList}`);
    const body = await response.json();

    expect(body.responseCode).toBe(405);
    expect(body.message).toMatch(/not supported/i);
  });
});
