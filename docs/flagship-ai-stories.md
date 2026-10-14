# Two Flagship AI Stories

Two concrete, specific stories about working with AI on this project - the
kind you'd actually tell in an interview or a performance review, not a
generic "AI helped me write tests faster." Fill in both using real examples
from this repo once you have them; a story grounded in one specific bug or
decision is far more convincing than a general claim.

Each story should cover:

1. **The situation** — what you were building or fixing, and why it
   mattered.
2. **Where AI helped** — specifically what it produced or suggested.
3. **Where you caught or corrected it** — the actual review moment. If
   nothing needed correcting, that's a weaker story; the interesting stories
   involve catching a real problem (see `docs/ai-validation-process.md`'s
   drill log for raw material).
4. **The outcome** — what shipped, and what you'd do differently next time.

## Story 1

**The situation.** While expanding `tests/fundamentals/02-assertions-and-autowaiting.spec.ts`
with more auto-waiting examples (`expect.poll`, action-level auto-wait, soft
assertions), I re-read the file's existing tests first to use as the model
for new ones - standard practice before extending anything, not optional.

**Where AI helped.** Claude had itself written the earlier version of this
file in a prior session. One of its existing tests was titled `'toHaveCount
waits for the final number of matches, not the first render'` - but its body
never called `toHaveCount` at all. It called `.count()` (a plain, one-shot
snapshot read) immediately after `productsPage.search('Dress')`, then
asserted `expect(count).toBeGreaterThan(0)`.

**Where I caught or corrected it.** That assertion is too weak to ever prove
the thing the test's name claims: `toBeGreaterThan(0)` passes whether
`.count()` catches the pre-search catalog count or the real post-search
count. Rather than take the title on faith, I wrote a throwaway script
against the live site to reproduce the actual race: `search()` returns as
soon as the click fires, before the AJAX response renders, so a `.count()`
read taken that instant can catch 34 (the full catalog) instead of 9 (the
real "Dress" match count) - and the test's own assertion would have passed
either way. A test whose assertion can't fail even when it hits the exact
race it's named after is a real defect, not a style nit.

**The outcome.** Rewrote the test to use a real `toHaveCount(...)`
assertion, and sourced the expected count from the API
(`apiClient.searchProduct('Dress')`) instead of hardcoding a number that
could silently drift if the shared demo site's catalog changes later. Next
time, I'd review a file's existing tests for title/body mismatches _before_
treating them as the template for new ones - this one had already been
copied as a pattern without the gap getting noticed. See
`tests/fundamentals/02-assertions-and-autowaiting.spec.ts:22`.

## Story 2

**The situation.** Asked to add new tests to
`tests/advanced/accessibility/homepage.a11y.spec.ts`, which already follows
a "confirmed baseline + `test.fail()` for known, unfixed bugs" pattern for a
third-party site's real axe-scan violations.

**Where AI helped.** Instead of padding the file with filler assertions,
Claude proposed two checks for gaps axe's own ruleset doesn't cover: whether
each page has exactly one `<h1>` (axe's `heading-order` rule only flags
skipped levels, not duplicate/missing top-level headings), and whether the
cart page's table exposes its column headers as real `<th>` elements.

**Where I caught or corrected it.** Neither claim was written from a guess.
Before adding either test, a small Node script against the live site
confirmed: the homepage renders three `<h1>`s (one visible, two CSS-hidden
duplicates with identical text) while every other page renders none at all;
and the cart table's header row (`Item / Description / Price / Quantity /
Total`) uses plain `<td>` cells - zero `<th>` elements, zero `scope`
attributes, confirmed by reading the live DOM rather than trusting what the
markup "should" look like.

**The outcome.** Both landed as `test.fail()`-wrapped entries in the "known
accessibility bugs" section, consistent with how the file already handles
third-party defects that can't be fixed immediately - they fail the specific
check while it's broken and flip red automatically the day the site actually
fixes it, instead of silently passing or permanently failing the whole
suite. Next time, I'd also log these two in `docs/ai-defect-taxonomy.md`

- right now they only exist as test markers, not as a reusable record of the
  pattern ("verify against the live DOM before asserting accessibility
  semantics the markup implies but doesn't guarantee").
