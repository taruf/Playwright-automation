/**
 * Central place for environment configuration. Every value has a sane default
 * pointing at the public practice site, so the suite runs with zero setup;
 * override via real environment variables when needed (CI, a different env).
 */
export const env = {
  baseURL: process.env.BASE_URL ?? 'https://automationexercise.com',
  apiBaseURL: process.env.API_BASE_URL ?? 'https://automationexercise.com/api',
};
