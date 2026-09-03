import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@fixtures/fixtures';

/**
 * Accessibility checks don't need cross-browser coverage the way visual
 * rendering does, so this file's ".a11y.spec.ts" name keeps it chromium-only
 * (see playwright.config.ts).
 *
 * The homepage genuinely has real WCAG violations today (confirmed while
 * writing this test: 1 button-name, 41 color-contrast, 4 link-name - all
 * serious/critical impact). Failing the suite on every one of them would
 * just make it permanently red on a site we don't own and can't fix, which
 * teaches "ignore the accessibility test" rather than anything useful. The
 * professional pattern for a third-party/legacy target you can't remediate
 * immediately is a documented baseline: fail only on a *regression* past
 * what's already known, so a genuinely new violation still gets caught.
 */
const KNOWN_VIOLATION_BASELINE: Record<string, number> = {
  'button-name': 1,
  'color-contrast': 41,
  'link-name': 4,
};

test.describe('homepage accessibility', () => {
  test('has no new critical or serious axe violations beyond the known baseline', async ({
    page,
  }) => {
    await page.goto('/');

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const seriousOrWorse = results.violations.filter((violation) =>
      ['critical', 'serious'].includes(violation.impact ?? ''),
    );

    // Attach the full report so a failure is debuggable from the HTML
    // report, not just a bare count in the terminal.
    await test.info().attach('axe-results', {
      body: JSON.stringify(results.violations, null, 2),
      contentType: 'application/json',
    });

    const regressions = seriousOrWorse.filter(
      (violation) => violation.nodes.length > (KNOWN_VIOLATION_BASELINE[violation.id] ?? 0),
    );
    const unexpectedRuleIds = seriousOrWorse
      .filter((violation) => !(violation.id in KNOWN_VIOLATION_BASELINE))
      .map((violation) => violation.id);

    expect(
      regressions.map(
        (v) => `${v.id}: ${v.nodes.length} node(s) (baseline ${KNOWN_VIOLATION_BASELINE[v.id]})`,
      ),
    ).toEqual([]);
    expect(unexpectedRuleIds).toEqual([]);
  });
});
