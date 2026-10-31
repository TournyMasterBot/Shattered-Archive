import { axe } from 'jest-axe';

/**
 * Component-level axe audit for jest tests; returns what is wrong as readable strings (empty = clean).
 *
 * Two deliberate differences from a plain `expect(await axe(el)).toHaveNoViolations()`:
 *  - jsdom has no layout, so axe cannot decide `aria-hidden-focus` there: a link inside `aria-hidden` comes back as
 *    INCOMPLETE, not a violation, and a plain check passes it silently. That rule's incomplete results are counted as
 *    failures here (App.test.tsx has a test that proves it).
 *  - `region` is a whole-page rule and `color-contrast` needs real rendering; the live-page audit
 *    (Shattered-AI/tools/browser-test, `pnpm a11y`) owns both.
 */
const STRICT_WHEN_INCOMPLETE = ['aria-hidden-focus'];

export async function a11yProblems(container: Element): Promise<string[]> {
  const results = await axe(container, { rules: { region: { enabled: false } } });
  const problems = [
    ...results.violations,
    ...results.incomplete.filter((r) => STRICT_WHEN_INCOMPLETE.includes(r.id)),
  ];
  return problems.map((r) => `${r.id}: ${r.help} -> ${r.nodes.map((n) => n.html.slice(0, 120)).join(' | ')}`);
}
