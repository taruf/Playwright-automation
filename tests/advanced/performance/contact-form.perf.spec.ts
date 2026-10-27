import path from 'node:path';
import { test, expect } from '@fixtures/fixtures';

// Note: the site's inline script shows "Success" and cancels the submit,
// so nothing is actually sent to the server. formReachedServer tracks this.
const STEP_BUDGET_MS = 15_000;
const CONTACT_BUDGET_MS = 30_000;

const ATTACHMENT = path.join(__dirname, '../../../package.json');

test.describe('contact form performance', () => {
  test('open form -> fill and attach a file -> submit -> success stays within budget', async ({
    page,
    contactUsPage,
  }) => {
    const timings: Record<string, number> = {};

    async function timedStep(name: string, action: () => Promise<void>): Promise<void> {
      await test.step(name, async () => {
        const startedAt = Date.now();
        await action();
        timings[name] = Date.now() - startedAt;
      });
    }

    await timedStep('open contact page', async () => {
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

    for (const [step, ms] of Object.entries(timings)) {
      expect.soft(ms, step).toBeLessThan(STEP_BUDGET_MS);
    }
    expect(total).toBeLessThan(CONTACT_BUDGET_MS);
  });
});
