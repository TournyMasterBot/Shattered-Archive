// Phase 30: the beta map is retired. The old URL lands on the new page (301), and the new page is linked under Tools in the site's menu.
//   node maps-retire-beta.mjs <out folder>
import { withPage } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const [OUT] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:5000';
const log = (t) => console.log(`[retire] ${t}`);
const checks = [];
const check = (name, ok, detail = '') => (checks.push(ok), log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` \u2014 ${detail}` : ''}`));

await withPage(`${BASE}/`, async (page) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/`);
  await page.locator('#toolsDropdown').click();
  const item = page.locator('#toolsDropdown + .dropdown-menu a.dropdown-item', { hasText: 'World Map' });
  check('Tools menu lists World Map', (await item.count()) === 1, await item.getAttribute('href'));
  await page.screenshot({ path: path.join(OUT, 'phase-30_tools-menu.png') });

  await item.click();
  await page.waitForFunction(() => /areas on/.test(document.getElementById("wm2-status")?.textContent ?? ""), null, { timeout: 30000 });
  check('the menu item opens the new world map', new URL(page.url()).pathname === '/maps/world-v2', page.url());

  const response = await page.goto(`${BASE}/maps/world-map`);
  await page.waitForFunction(() => /areas on/.test(document.getElementById("wm2-status")?.textContent ?? ""), null, { timeout: 30000 });
  check('the old URL lands on the new page', new URL(page.url()).pathname === '/maps/world-v2', page.url());
  check('the redirect was permanent', response.request().redirectedFrom()?.url().endsWith('/maps/world-map') === true && (await response.request().redirectedFrom().response()).status() === 301);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, "phase-30_redirect.png") });

  const beta = await page.goto(`${BASE}/directions?is_beta=true`);
  const text = await page.locator('body').innerText();
  check('the old beta flag on /directions shows no map grid', beta.status() === 200 && !/Map Count/.test(text));
}, { headless: true });

log(`${checks.filter(Boolean).length}/${checks.length} checks pass`);
process.exit(checks.every(Boolean) ? 0 : 1);
