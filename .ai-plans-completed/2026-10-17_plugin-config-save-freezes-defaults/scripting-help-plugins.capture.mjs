// Final-phase showcase for work item 2026-10-17_plugin-config-save-freezes-defaults: the in-app Scripting Help, Plugins section, with
// the new text about Save and Reset to defaults. Opens Help > Scripting…, asserts the text is really there, and shoots that section.
//
//   node <this file>
//
// Needs the stack the owner already runs (http://localhost:30080/); never starts or stops anything. Fresh ephemeral browser context.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withPage, saveShowcase } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/browser.mjs';

const SLUG = '2026-10-17_plugin-config-save-freezes-defaults';
const here = path.dirname(fileURLToPath(import.meta.url));
const showcaseDir = path.join(here, 'screenshots', 'showcase');
fs.mkdirSync(showcaseDir, { recursive: true });

let shot = null;
const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures.push(name);
};

await withPage('http://localhost:30080/', async (page) => {
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.waitForTimeout(2500);

  await page.locator('xpath=//div[text()="Help"]').first().click();
  await page.waitForTimeout(200);
  await page.locator('text=Scripting…').first().click();
  await page.waitForTimeout(500);

  const section = page.locator('[data-section="plugins"]');
  await section.waitFor({ timeout: 5000 });
  await section.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);

  const text = await section.innerText();
  check('the Plugins section mentions Configure and Save', /Configure/.test(text) && /Save/.test(text));
  check('the Plugins section explains that unchanged settings follow the plugin defaults', /keep following the plugin's own defaults/.test(text));
  check('the Plugins section mentions Reset to defaults', /Reset to defaults/.test(text));

  // The Plugins section is ~1500 lines of help; shooting the whole element gives an unreadable strip. Scroll the new paragraph to the
  // top of the modal's scroll area and shoot the viewport instead.
  const para = section.locator('p', { hasText: 'Reset to defaults' }).first();
  await para.waitFor({ timeout: 5000 });
  await para.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(400);

  shot = await saveShowcase(page, SLUG, '02-scripting-help-plugins', {
    description: 'In-app Scripting Help, Plugins section: Configure and Save, settings left alone keep following the plugin defaults, Reset to defaults',
  });
  check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 200));
});

if (shot) {
  const dest = path.join(showcaseDir, 'showcase_02_scripting-help-plugins.png');
  fs.copyFileSync(shot, dest);
  console.log(`showcase copied to ${dest}`);
}
console.log(failures.length ? `\n${failures.length} check(s) FAILED: ${failures.join('; ')}` : '\nAll checks passed.');
process.exit(failures.length ? 1 : 0);
