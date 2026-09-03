import type { NewAccountPayload } from '@api/ApiClient';

/**
 * Automation Exercise is a shared public site: every signup persists a real
 * account. Building the email from the current timestamp keeps concurrent
 * test runs from colliding, and every test that creates one is responsible
 * for deleting it again (via ApiClient.deleteAccount or the UI "Delete
 * Account" link) so we don't leave junk data behind on someone else's site.
 */
export function createTestUser(prefix = 'qa'): NewAccountPayload {
  const unique = Date.now();
  return {
    name: `QA Automation ${unique}`,
    email: `${prefix}.automation.${unique}@example.com`,
    password: 'Test1234!',
    title: 'Mr',
    birth_date: '10',
    birth_month: '5',
    birth_year: '1990',
    firstname: 'QA',
    lastname: 'Automation',
    company: 'Acme Testing Co',
    address1: '123 Main St',
    address2: '',
    country: 'United States',
    zipcode: '12345',
    state: 'CA',
    city: 'Los Angeles',
    mobile_number: '1234567890',
  };
}
