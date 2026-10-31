// Phase 3 UI check for work item 2026-10-17_plugin-config-save-freezes-defaults.
// Drives the REAL Configure panel of the Roller plugin against the running dev stack (http://localhost:30080/) and asserts
// what ends up in localStorage, then captures progress shots (git-ignored) and one final-state showcase shot.
//
//   node <this file>
//
// Needs the stack the owner already runs; this script never starts or stops anything. Each run uses a fresh, ephemeral
// browser context (no persisted storage), so it cannot touch real saved settings.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withPage, saveShowcase } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/browser.mjs';

const SLUG = '2026-10-17_plugin-config-save-freezes-defaults';
const APP_URL = 'http://localhost:30080/';
const STORE_KEY = 'shatteredArchive.plugins.installed';
const here = path.dirname(fileURLToPath(import.meta.url));
const incremental = path.join(here, 'screenshots', 'incremental');
const showcase = path.join(here, 'screenshots', 'showcase');
fs.mkdirSync(incremental, { recursive: true });
fs.mkdirSync(showcase, { recursive: true });

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures.push(name);
};

const rollerStored = (page) =>
  page.evaluate((key) => {
    const rec = JSON.parse(localStorage.getItem(key) ?? '[]').find((r) => r.id === 'roller');
    return rec ? rec.userConfig : null;
  }, STORE_KEY);

const styleOf = (locator) =>
  locator.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      background: s.backgroundColor,
      color: s.color,
      border: `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}`,
      radius: s.borderTopLeftRadius,
      font: `${s.fontSize} ${s.fontWeight}`,
    };
  });

async function openPluginsList(page) {
  await page.locator('xpath=//div[text()="Plugins"]').first().click();
  await page.waitForTimeout(200);
  await page.locator('text=Manage Plugins…').first().click();
  await page.waitForTimeout(300);
}

const rollerRow = (page) => page.locator('xpath=//div[text()="Roller"]/ancestor::div[contains(@class,"row")][1]');

async function installAndEnableRoller(page) {
  const row = rollerRow(page);
  const install = row.getByRole('button', { name: 'Install' });
  if (await install.count()) {
    await install.click();
    await page.waitForTimeout(250);
  }
  const toggle = row.locator('input[type="checkbox"]');
  if (!(await toggle.isChecked())) await toggle.click();
  await page.waitForTimeout(250);
}

async function openConfigure(page) {
  await rollerRow(page).getByRole('button', { name: /configure/i }).click();
  await page.getByRole('button', { name: 'Reset to defaults' }).waitFor({ timeout: 5000 });
}

const spin = (page, i) => page.getByRole('spinbutton').nth(i);
const save = (page) => page.getByRole('button', { name: 'Save', exact: true }).click();

/** TH-03: the new button must look and react exactly like its neighbour Cancel, in whatever theme is active. */
async function compareButtons(page, themeName) {
  const reset = page.getByRole('button', { name: 'Reset to defaults' });
  const cancel = page.getByRole('button', { name: 'Cancel', exact: true });
  const rest = [await styleOf(reset), await styleOf(cancel)];
  check(`[${themeName}] Reset button looks like Cancel at rest`, JSON.stringify(rest[0]) === JSON.stringify(rest[1]), JSON.stringify(rest[0]));
  await reset.hover();
  await page.waitForTimeout(150);
  const resetHover = await styleOf(reset);
  await page.screenshot({ path: path.join(incremental, `phase-03_reset-hover-${themeName}.png`) });
  await cancel.hover();
  await page.waitForTimeout(150);
  const cancelHover = await styleOf(cancel);
  check(`[${themeName}] Reset button reacts to hover like Cancel`, JSON.stringify(resetHover) === JSON.stringify(cancelHover), JSON.stringify(resetHover));
  check(`[${themeName}] hover actually changes the button (the state is styled)`, JSON.stringify(resetHover) !== JSON.stringify(rest[0]));
}

let showcasePath = null;

await withPage(APP_URL, async (page) => {
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.waitForTimeout(2500);

  await openPluginsList(page);
  await installAndEnableRoller(page);

  // 1. Save without changing anything must store nothing (the original bug stored every default).
  await openConfigure(page);
  check('the Reset to defaults button is present', (await page.getByRole('button', { name: 'Reset to defaults' }).count()) === 1);
  await page.screenshot({ path: path.join(incremental, 'phase-03_configure-modal.png') });
  await save(page);
  await page.waitForTimeout(300);
  const afterPlainSave = await rollerStored(page);
  check('Save with no edits stores nothing', JSON.stringify(afterPlainSave) === '{}', JSON.stringify(afterPlainSave));

  // 2. Edit one setting: only that setting is stored.
  await openConfigure(page);
  await spin(page, 1).fill('12');
  await save(page);
  await page.waitForTimeout(300);
  const afterEdit = await rollerStored(page);
  check('editing Min STR stores only Min STR', JSON.stringify(afterEdit) === JSON.stringify({ minStr: 12 }), JSON.stringify(afterEdit));

  // 3. The edit is shown again on reopen; Reset to defaults shows the defaults in the editor, stores nothing yet.
  await openConfigure(page);
  check('the edited value is shown on reopen', (await spin(page, 1).inputValue()) === '12');
  await page.getByRole('button', { name: 'Reset to defaults' }).click();
  await page.waitForTimeout(150);
  check('Reset to defaults puts the default (0) back in the editor', (await spin(page, 1).inputValue()) === '0');
  check('...and stores nothing until Save', JSON.stringify(await rollerStored(page)) === JSON.stringify({ minStr: 12 }));
  await page.screenshot({ path: path.join(incremental, 'phase-03_after-reset.png') });
  await save(page);
  await page.waitForTimeout(300);
  const afterReset = await rollerStored(page);
  check('Reset to defaults then Save stores nothing', JSON.stringify(afterReset) === '{}', JSON.stringify(afterReset));

  // 4. Cancel after Reset discards the reset.
  await openConfigure(page);
  await spin(page, 1).fill('9');
  await save(page);
  await page.waitForTimeout(300);
  await openConfigure(page);
  await page.getByRole('button', { name: 'Reset to defaults' }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.waitForTimeout(300);
  check('Cancel after Reset keeps the stored value', JSON.stringify(await rollerStored(page)) === JSON.stringify({ minStr: 9 }));

  // 5. TH-03 in the default theme, with the panel open on a stored override (the arrangement for the showcase).
  await openConfigure(page);
  await compareButtons(page, 'default');
  showcasePath = await saveShowcase(page, SLUG, '01-configure-modal-reset', {
    description: 'Configure panel for the Roller plugin: the new "Reset to defaults" button sits left of Cancel and Save',
  });
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.waitForTimeout(200);

  // 6. TH-03 in slate-amber, through the real Settings UI. Best effort: if the shell differs, say so instead of guessing.
  try {
    await page.getByText('✕', { exact: true }).first().click().catch(() => {});
    await page.locator('text=Game').first().click();
    await page.locator('text=Settings').first().click();
    await page.locator('text=Graphics…').first().click();
    await page.waitForTimeout(300);
    await page.locator('text=Layout').first().click();
    await page.getByLabel('Theme').selectOption('slate-amber');
    await page.waitForTimeout(1500);
    await page.getByText('✕', { exact: true }).first().click().catch(() => {});
    await page.waitForTimeout(500);
    await openPluginsList(page);
    await openConfigure(page);
    await compareButtons(page, 'slate-amber');
    await page.screenshot({ path: path.join(incremental, 'phase-03_configure-modal-slate-amber.png') });
  } catch (err) {
    console.log(`NOTE  slate-amber check NOT completed: ${String(err.message).split('\n')[0]}`);
    failures.push('slate-amber check could not be completed');
  }

  check('no uncaught page errors during the run', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 200));
});

if (showcasePath) {
  const dest = path.join(showcase, 'showcase_01_configure-modal-reset.png');
  fs.copyFileSync(showcasePath, dest);
  console.log(`showcase copied to ${dest}`);
}

console.log(failures.length ? `\n${failures.length} check(s) FAILED: ${failures.join('; ')}` : '\nAll checks passed.');
process.exit(failures.length ? 1 : 0);
