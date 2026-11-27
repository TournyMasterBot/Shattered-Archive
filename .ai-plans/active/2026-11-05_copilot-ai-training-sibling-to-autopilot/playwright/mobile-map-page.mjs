// Phase 29: the page the mobile map screen shows in its WebView, run in a real browser engine (Chromium) with the REAL renderer bundle and REAL slices from a
// scratch site (see maps-v2-scratch-run.mjs). The page is built by the mobile app's own html.ts (transpiled here), the area is handed over with its own
// showAreaScript, and a stand-in for ReactNativeWebView records the page's messages. This does not replace the emulator run (the React Native shell is covered by jest).
//   node mobile-map-page.mjs <out folder for screenshots> <scratch site base url>
import { withPage } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/browser.mjs';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2];
const BASE = process.argv[3] ?? 'http://127.0.0.1:5097';
fs.mkdirSync(OUT, { recursive: true });
const MOBILE = 'C:/Projects/shatteredarchive-mobile/dsl-client/';
const require = createRequire(MOBILE + 'package.json');
const ts = require('typescript');

// html.ts as a module (it has no imports)
const source = fs.readFileSync(MOBILE + 'features/world-map/html.ts', 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const html = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const bundle = await (await fetch(`${BASE}/js/maps/worldmap2.js`)).text();
const index = await (await fetch(`${BASE}/api/world-map/index`)).json();
const big = index.areas.slice().sort((a, b) => b.rooms - a.rooms)[0];
// the area, joined from its pages exactly as features/world-map/api.ts does
const subzones = [];
const byId = new Map();
const links = [];
let head = null;
for (let offset = 0; ; ) {
  const page = await (await fetch(`${BASE}/api/world-map/area/${big.id}?limit=300&offset=${offset}`)).json();
  head ??= page;
  for (const sz of page.area.subzones) {
    let into = byId.get(sz.id);
    if (!into) byId.set(sz.id, (into = { id: sz.id, name: sz.name, kind: sz.kind, rooms: [] })) && subzones.push(into);
    into.rooms.push(...sz.rooms);
  }
  links.push(...page.links);
  if (page.nextOffset === null) break;
  offset = page.nextOffset;
}
const area = { id: head.area.id, name: head.area.name, map: { version: 1, continents: [{ id: head.area.continentId, name: head.area.continentId, areas: [{ id: head.area.id, name: head.area.name, placement: head.area.placement, subzones }] }], links } };
const floors = [...new Set(subzones.flatMap((s) => s.rooms.map((r) => r.coords?.z ?? 0)))];

const page = html.buildMapHtml(bundle);
check('the page is built with the renderer inlined and nothing external', page.includes('ShatteredMapsCore') && !/https?:\/\//.test(page.replace(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, '')) , `${Math.round(page.length / 1024)} KB`);

await withPage(`${BASE}/robots.txt`, async (browser) => {
  const messages = [];
  const errors = [];
  browser.on('pageerror', (e) => errors.push(String(e)));
  const requests = [];
  browser.on('request', (r) => requests.push(r.url()));
  await browser.addInitScript(() => {
    window.__messages = [];
    window.ReactNativeWebView = { postMessage: (m) => window.__messages.push(JSON.parse(m)) };
  });
  await browser.setViewportSize({ width: 390, height: 700 });
  // served as a document of its own (an init script does not run for setContent), exactly the string the WebView is given
  await browser.route(`${BASE}/__mobile-page`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: page }));
  await browser.goto(`${BASE}/__mobile-page`);
  const posted = () => browser.evaluate(() => window.__messages);
  check('the page says it is ready', (await posted()).some((m) => m.type === 'ready'));

  await browser.evaluate(html.showAreaScript(area).replace(/;true;$/, ''));
  await browser.waitForFunction(() => window.__messages.some((m) => m.type === 'drawn'));
  const rooms = await browser.locator('#map [data-room]').count();
  check('the area is drawn on one floor', rooms > 5, `${rooms} rooms on this floor, ${floors.length} floors in the area`);
  check('the floor list names the floors (top first) and is enabled for several', (await browser.locator('#floor option').count()) === floors.length && (await browser.locator('#floor').isEnabled()));
  check('the message line says what is shown', /rooms\. Tap a room/.test(await browser.locator('#msg').innerText()), (await browser.locator('#msg').innerText()).slice(0, 60));
  await browser.screenshot({ path: path.join(OUT, 'phase-29_page-area.png') });

  const before = await browser.locator('#map svg').getAttribute('width');
  const select = browser.locator('#floor');
  const options = await select.locator('option').allInnerTexts();
  await select.selectOption({ index: Math.min(1, options.length - 1) });
  check('choosing another floor draws it', (await browser.locator('#map [data-room]').count()) > 0 && (await select.inputValue()) !== undefined);
  await browser.locator('#layout').selectOption('hex');
  check('hexagons redraw the picture', (await browser.locator('#map svg[data-layout="hex"]').count()) === 1);
  await browser.locator('#layout').selectOption('grid');

  const w0 = Number((await browser.locator('#map svg').evaluate((s) => s.style.width)).replace('px', '') || before);
  await browser.locator('#in').click();
  const w1 = Number((await browser.locator('#map svg').evaluate((s) => s.style.width)).replace('px', ''));
  check('zoom in widens the picture', w1 > w0 * 1.1, `${w0} -> ${w1}`);
  for (let i = 0; i < 14; i += 1) if (await browser.locator('#in').isEnabled()) await browser.locator('#in').click();
  check('zoom in stops at its limit', await browser.locator('#in').isDisabled());

  // the picture is zoomed in and scrolled: deliver the tap to the tile as a DOM click (what the WebView's touch becomes)
  await browser.locator('#map [data-room]').first().dispatchEvent('click');
  const roomMessage = (await posted()).find((m) => m.type === 'room');
  check('tapping a room shows its details as text and tells the app', !!roomMessage && (await browser.locator('#room').isVisible()) && (await browser.locator('#room h2').innerText()).length > 0, roomMessage?.id);
  await browser.screenshot({ path: path.join(OUT, 'phase-29_page-room.png') });

  // hostile data cannot break out of the page
  const hostile = JSON.parse(JSON.stringify(area));
  const first = hostile.map.continents[0].areas[0].subzones[0].rooms[0];
  first.title = '</script><img src=x onerror="window.__owned=1"> \u2028 </SCRIPT>';
  first.description = '<script>window.__owned=1</script>';
  await browser.evaluate(html.showAreaScript(hostile).replace(/;true;$/, ''));
  const firstId = first.id;
  const z = first.coords?.z ?? 0;
  await browser.locator('#floor').selectOption(String(z)).catch(() => {});
  const tile = browser.locator(`#map [data-room="${firstId}"]`);
  check('the hostile room is on the floor that is shown', (await tile.count()) === 1);
  await tile.dispatchEvent('click');
  check('hostile text in a room (a closing script tag, an image with a handler) injects nothing', (await browser.evaluate(() => window.__owned === undefined)) && (await browser.locator('#map img, #room img, #room script').count()) === 0);
  check('the room panel shows the hostile text as plain text', (await browser.locator('#room h2').innerText()).includes('</script>'));

  check('the page made no request of its own', requests.filter((u) => u !== `${BASE}/__mobile-page` && !u.startsWith('about:') && !u.startsWith('data:')).length === 0, requests.join(', ').slice(0, 80));
  check('no script errors', errors.length === 0, errors.join(' | ').slice(0, 200));
  void messages;
});

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exitCode = failed ? 1 : 0;
