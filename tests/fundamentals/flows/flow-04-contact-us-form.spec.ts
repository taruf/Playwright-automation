import path from 'node:path';
import { test, expect } from '@fixtures/fixtures';

test.describe('flow: contact us form submission', () => {
  test('submitting the form with an attachment shows a success message', async ({
    contactUsPage,
  }) => {
    await contactUsPage.goto();

    await contactUsPage.fillForm({
      name: 'QA Automation',
      email: `qa.contact.${Date.now()}@example.com`,
      subject: 'Automated test run',
      message: 'This message was submitted by an automated Playwright test.',
    });

    // The site accepts a file attachment; point it at this repo's own
    // package.json so the test doesn't depend on a fixtures folder.
    await contactUsPage.fileInput.setInputFiles(path.join(__dirname, '../../../package.json'));

    // Submitting fires a native confirm() dialog before the AJAX request -
    // contactUsPage.submit() auto-accepts it; see its implementation for why.
    await contactUsPage.submit();

    await expect(contactUsPage.successMessage).toContainText('Success');
  });
});
