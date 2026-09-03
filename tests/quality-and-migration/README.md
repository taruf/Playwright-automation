# Quality Habits & Migration

This is less about new Playwright APIs and more about the review
discipline that keeps an AI-accelerated workflow trustworthy. The only fully
worked example here is the migration project; everything else is a checklist
you work through in `docs/`.

## Checklist

- [ ] **Build your AI defect taxonomy** — start filling in
      [`docs/ai-defect-taxonomy.md`](../../docs/ai-defect-taxonomy.md) as you
      find real examples (your own code and AI-generated code both count).
- [ ] **Drill: review 10 AI-generated functions** — log findings using the
      drill log table in
      [`docs/ai-validation-process.md`](../../docs/ai-validation-process.md).
- [ ] **Drill: review 10 AI-generated tests** — same log, same file. Look
      specifically for the failure modes called out in entry #1 (a strict
      locator that was too broad) and entry #2 (asserting business logic you
      never independently verified).
- [ ] **Define your AI-validation process** — turn the drill findings into a
      short checklist you actually run before accepting generated test code.
      A starting checklist is already in `docs/ai-validation-process.md`;
      edit it until it reflects what you actually check.
- [ ] **Migration project: Selenium → Playwright** — done. See
      [`legacy-selenium/login.legacy-reference.md`](legacy-selenium/login.legacy-reference.md)
      for the "before" and [`migrated/login.spec.ts`](migrated/login.spec.ts)
      for the "after". Once you've read both, migrate a second flow yourself
      (pick anything from fundamentals `flows/` and imagine what the Selenium
      version would have looked like) to prove the pattern generalizes.
- [ ] **Write the two flagship AI stories** — use the template in
      [`docs/flagship-ai-stories.md`](../../docs/flagship-ai-stories.md).
