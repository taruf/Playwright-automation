import path from 'node:path';
import { test, expect } from '@fixtures/fixtures';

/**
 * Contact form performance: how long a visitor waits between opening the
 * Contact Us page and seeing their message confirmed.
 *
 * What "confirmed" means here is worth knowing before reading the numbers.
 * The site's own script (inline on /contact_us) shows the success message
 * and then cancels the form submission - confirmed by tracing the network:
 * no request reaches the server, and the attached file is never uploaded.
 * So the submit step measures how quickly the page responds, not a server
 * round-trip, and measures in tens of milliseconds. The test records
 * whether the form reached the server, so if the site ever starts really
 * sending it, the report shows that the numbers changed meaning.
 *
 * Like the rest of this folder it is a smoke check, not a load test: one
 * message, one pass, generous budgets (see homepage.perf.spec.ts for why).
 */
const STEP_BUDGET_MS = 15_000;
const CONTACT_BUDGET_MS = 30_000;

// The repo's own package.json - a few KB, always present, no fixtures folder.
const ATTACHMENT = path.join(__dirname, '../../../package.json');

test.describe('contact form performance', () => {
  test('open form -> fill and attach a file -> submit -> success stays within budget', async ({
    page,
    contactUsPage,
  }) => {
    const timings: Record<string, number> = {};

    // Each step ends on the thing the visitor is waiting to see, so the
    // number is "time until I can carry on", not "time until the click".
    async function timedStep(name: string, action: () => Promise<void>): Promise<void> {
      await test.step(name, async () => {
        const startedAt = Date.now();
        await action();
        timings[name] = Date.now() - startedAt;
      });
    }

    await timedStep('open contact page', async () => {
      // goto() waits for the load event, so the form's submit handler is
      // attached before the step ends - same late-binding caution as the
      // search box in user-journey.perf.spec.ts.
      await contactUsPage.goto();
      await expect(contactUsPage.submitButton).toBeVisible();
    });

    await timedStep('fill the form and attach a file', async () => {
      await contactUsPage.fillForm({
        name: 'QA Performance',
        email: `qa.perf.contact.${Date.now()}@example.com`,
        subject: 'Performance smoke check',
        message: 'Submitted by an automated performance test.',
      });
      await contactUsPage.fileInput.setInputFiles(ATTACHMENT);
    });

    let formReachedServer = false;
    page.on('request', (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/contact_us') {
        formReachedServer = true;
      }
    });

    await timedStep('submit and see confirmation', async () => {
      // submit() also accepts the site's native confirm() dialog.
      await contactUsPage.submit();
      await expect(contactUsPage.successMessage).toContainText('Success');
    });

    const total = Object.values(timings).reduce((sum, ms) => sum + ms, 0);
    await test.info().attach('contact-form-timings', {
      body: JSON.stringify({ ...timings, total, formReachedServer }, null, 2),
      contentType: 'application/json',
    });
    test.info().annotations.push({
      type: 'form-reached-server',
      description: String(formReachedServer),
    });

    // Soft, so the report shows every slow step rather than only the first.
    for (const [step, ms] of Object.entries(timings)) {
      expect.soft(ms, step).toBeLessThan(STEP_BUDGET_MS);
    }
    expect(total).toBeLessThan(CONTACT_BUDGET_MS);
  });
});
