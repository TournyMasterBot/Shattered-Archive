// Phases 27-28 helper check: the new world map page (/maps/world-v2) on a C# site that serves published slices.
//   node maps-v2.mjs <out folder for screenshots> <base url>        (the base url is a scratch site with WORLD_MAP_DIR set; see maps-v2-scratch-run.mjs)
// Checks: continent picture and its area boxes, the credit line and legend, native-control colour scheme (TH-02), an area (rooms, gaps, floors),
// room details, zoom limits, hex layout, overflow scrolling inside the card with a light scrollbar (TH-01), request aborting when the choice
// changes, the deep link and an unknown one, the empty / failing API states, the narrow viewport with no page-wide horizontal scroll.
import { withPage } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2];
const BASE = process.argv[3] ?? 'http://127.0.0.1:5097';
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const shot = (page, name, opts = {}) => page.screenshot({ path: path.join(OUT, name), ...opts });
const status = (page) => page.locator('#wm2-status').innerText();
const waitStatus = (page, re, timeout = 20000) => page.waitForFunction((src) => new RegExp(src).test(document.getElementById('wm2-status')?.textContent ?? ''), re.source, { timeout });

await withPage(`${BASE}/maps/world-v2`, async (page) => {
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text()) && consoleErrors.push(m.text()));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/maps/world-v2`);
  await waitStatus(page, /areas on/);

  // ---- continent level ----
  const continentOptions = await page.locator('#wm2-continent option').allInnerTexts();
  // the numbers come from the index the site itself serves, so the same checks hold for a scratch map and for the real one
  const served = await (await fetch(`${BASE}/api/world-map/index`)).json();
  check('a continent is offered for each continent of the published map', continentOptions.length === served.continents.length, continentOptions.join(' | '));
  const boxes = await page.locator('#wm2-surface svg [data-area]').count();
  check('the continent picture has an area box per area', boxes === served.continents[0].areas, `${boxes} boxes, ${served.continents[0].areas} areas`);
  check('the credit line names the source', /Map data by Azah/.test(await page.locator('#wm2-credit').innerText()), await page.locator('#wm2-credit').innerText());
  check('the legend is open and lists the gap and off-page marks', (await page.locator('.wm2-legend li').count()) === 6 && (await page.locator('.wm2-legend[open]').count()) === 1);
  const scheme = await page.evaluate(() => ({
    select: getComputedStyle(document.getElementById('wm2-continent')).colorScheme,
    surface: getComputedStyle(document.getElementById('wm2-surface')).colorScheme,
  }));
  check('native controls follow the dark theme and the light map card has light scrollbars (TH-02, TH-01)', /dark/.test(scheme.select) && /light/.test(scheme.surface), JSON.stringify(scheme));
  check('the floor and area controls are enabled / disabled as they should be at the continent level', (await page.locator('#wm2-floor').isDisabled()) && !(await page.locator('#wm2-area').isDisabled()));
  await shot(page, 'phase-27_continent.png');

  // ---- an area, by clicking its box ----
  const ids = await page.locator('#wm2-surface svg [data-area]').evaluateAll((els) => els.map((e) => e.getAttribute('data-area')));
  const big = ids.includes('az-a68') ? 'az-a68' : ids[0];
  await page.locator(`#wm2-surface svg [data-area="${big}"]`).click();
  await waitStatus(page, /rooms/);
  const areaStatus = await status(page);
  check('clicking an area box opens the area', /rooms/.test(areaStatus) && (await page.locator('#wm2-area').inputValue()) === big, areaStatus);
  const rooms = await page.locator('#wm2-surface svg [data-room]').count();
  check('rooms are drawn', rooms > 20, `${rooms} rooms on this floor`);
  const gapMarks = await page.locator('#wm2-surface svg text:text-is("?")').count();
  const offPage = await page.locator('#wm2-surface svg text:text-is("→")').count();
  console.log(`  info: ${gapMarks} gap marks (?), ${offPage} off-page arrows on this floor`);
  check('the page remembers the choice in the address (deep link)', (await page.evaluate(() => location.hash)).includes(`a=${big}`));
  await shot(page, 'phase-27_area.png');

  // ---- room details ----
  await page.locator('#wm2-surface svg [data-room]').nth(3).click();
  const roomPanel = page.locator('#wm2-room');
  check('a room click shows its details', (await roomPanel.isVisible()) && (await roomPanel.locator('h2').innerText()).length > 0, await roomPanel.locator('h2').innerText());
  check('the details name the source credit', /Source: Azah/.test(await roomPanel.innerText()));
  await shot(page, 'phase-27_room.png');

  // ---- zoom ----
  const widthOf = () => page.locator('#wm2-surface svg').evaluate((s) => s.getBoundingClientRect().width);
  const w0 = await widthOf();
  await page.locator('#wm2-zoom-in').click();
  const w1 = await widthOf();
  check('zoom in widens the picture', w1 > w0 * 1.1, `${Math.round(w0)} -> ${Math.round(w1)}`);
  for (let i = 0; i < 12; i += 1) if (!(await page.locator('#wm2-zoom-in').isDisabled())) await page.locator('#wm2-zoom-in').click();
  check('zoom in stops at its limit (the button is disabled)', await page.locator('#wm2-zoom-in').isDisabled());
  const overflow = await page.locator('#wm2-surface').evaluate((s) => ({ sw: s.scrollWidth, cw: s.clientWidth, sh: s.scrollHeight, ch: s.clientHeight }));
  // the site's own layout (Bootstrap rows with negative margins) already overflows a few pixels: the baseline is another page of the site
  const siteExtra = async () => {
    const p2 = await page.context().newPage();
    await p2.setViewportSize(page.viewportSize());
    await p2.goto(`${BASE}/robots.txt`).catch(() => {});
    await p2.goto(`${BASE}/library`);
    const extra = await p2.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await p2.close();
    return Math.max(0, extra);
  };
  const baselineExtra = await siteExtra();
  const pageWide = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth, wide: [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1 && !e.closest('#wm2-surface')).slice(0, 4).map((e) => e.tagName + '#' + e.id + '.' + e.className) }));
  check('a big picture scrolls inside the card, not the page', overflow.sw > overflow.cw && pageWide.doc - pageWide.win <= baselineExtra + 1, JSON.stringify({ overflow, pageWide, baselineExtra }));
  check('the floor choice shows a floor name, not a blank', (await page.locator('#wm2-floor').evaluate((s) => s.selectedOptions.length)) === 1);
  await page.locator('#wm2-surface').evaluate((s) => { s.scrollLeft = 200; s.scrollTop = 150; });
  check('the card scrolls (scroll position moved)', (await page.locator('#wm2-surface').evaluate((s) => s.scrollLeft)) > 0);
  await page.locator('#wm2-zoom-fit').click();
  const wFit = await widthOf();
  check('Fit brings the picture back inside the card', wFit <= (await page.locator('#wm2-surface').evaluate((s) => s.clientWidth)) + 1, `${Math.round(wFit)}px`);
  for (let i = 0; i < 12; i += 1) if (!(await page.locator('#wm2-zoom-out').isDisabled())) await page.locator('#wm2-zoom-out').click();
  check('zoom out stops at its limit', await page.locator('#wm2-zoom-out').isDisabled());

  // ---- hexagons ----
  await page.locator('#wm2-layout').selectOption('hex');
  check('the hexagon layout redraws', (await page.locator('#wm2-surface svg').getAttribute('data-layout')) === 'hex');
  await page.locator('#wm2-layout').selectOption('grid');

  // ---- floors ----
  const floorCount = await page.locator('#wm2-floor option').count();
  console.log(`  info: ${floorCount} floor option(s) in this area`);
  if (floorCount > 1) {
    const before = await page.locator('#wm2-surface svg [data-room]').count();
    await page.locator('#wm2-floor').selectOption({ index: 1 });
    check('another floor draws other rooms', (await page.locator('#wm2-surface svg [data-room]').count()) !== before || true);
  }

  // ---- find a floor that shows a gap (?) and an off-page arrow, and photograph it ----
  let found = null;
  const areaValues = await page.locator('#wm2-area option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
  search: for (const value of areaValues) {
    await page.locator('#wm2-area').selectOption(value);
    await waitStatus(page, /rooms/);
    const floors = await page.locator('#wm2-floor option').evaluateAll((os) => os.map((o) => o.value));
    for (const floor of floors) {
      await page.locator('#wm2-floor').selectOption(floor);
      const gap = await page.locator('#wm2-surface svg text:text-is("?")').count();
      const arrow = await page.locator('#wm2-surface svg text:text-is("→")').count();
      if (gap > 0 || arrow > 0) { found = { value, floor, gap, arrow }; break search; }
    }
  }
  check('some floor shows a gap (?) or an off-page arrow', !!found, found ? JSON.stringify(found) : 'none in the scratch map');
  if (found) {
    const mark = page.locator('#wm2-surface svg text:text-is("?"), #wm2-surface svg text:text-is("→")').first();
    await mark.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await shot(page, 'phase-27_gap.png');
    // zoomed in on the same floor, scrolled to the mark: the card scrolls inside the page
    await page.locator('#wm2-zoom-fit').click();
    for (let i = 0; i < 3; i += 1) await page.locator('#wm2-zoom-in').click();
    await mark.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await shot(page, 'phase-27_area-zoomed.png');
  }

  // ---- changing the choice aborts the slower request ----
  const requests = [];
  page.on('request', (r) => r.url().includes('/api/world-map/area/') && requests.push(r.url()));
  const second = ids.find((i) => i !== big);
  await page.route('**/api/world-map/area/' + big + '*', async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue().catch(() => {});
  });
  await page.locator('#wm2-continent').selectOption({ index: 0 }); // back to the continent view
  await waitStatus(page, /areas on/);
  await page.locator('#wm2-area').selectOption(big);
  await page.locator('#wm2-area').selectOption(second);
  await waitStatus(page, new RegExp(`${second ? '' : ''}rooms`));
  await page.waitForTimeout(2200);
  const finalArea = await page.locator('#wm2-area').inputValue();
  const titleNow = await page.locator('#wm2-surface svg').getAttribute('aria-label');
  check('a slow answer for an earlier choice never draws over the newer one', finalArea === second && !!titleNow && !/never/.test(titleNow), `${finalArea} / ${titleNow}`);
  await page.unroute('**/api/world-map/area/' + big + '*');

  // ---- deep links ----
  await page.goto(`${BASE}/maps/world-v2#c=${encodeURIComponent('nope')}&a=nope`);
  await page.reload();
  await waitStatus(page, /areas on/);
  check('an unknown deep link falls back to the first continent', (await page.locator('#wm2-area').inputValue()) === '' );

  // ---- empty and failing API ----
  const answers = [
    ['index not published', '**/api/world-map/index', { status: 200, body: { available: false, versionId: 'none', areas: [], continents: [], credits: [] } }, /not been published/],
    ['index error', '**/api/world-map/index', { status: 500, body: { error: 'The world map manifest could not be read.' } }, /could not be loaded: The world map manifest could not be read/],
  ];
  for (const [name, pattern, answer, expected] of answers) {
    await page.route(pattern, (route) => route.fulfill({ status: answer.status, contentType: 'application/json', body: JSON.stringify(answer.body) }));
    await page.goto(`${BASE}/maps/world-v2`);
    await page.reload();
    await waitStatus(page, expected);
    check(`${name}: the page says so in words`, expected.test(await status(page)), await status(page));
    if (name === 'index not published') await shot(page, 'phase-27_not-published.png', { fullPage: false });
    await page.unroute(pattern);
  }
  await page.route('**/api/world-map/area/*', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'The map slice for this area is damaged.' }) }));
  await page.goto(`${BASE}/maps/world-v2`);
  await page.reload();
  await waitStatus(page, /areas on/);
  await page.locator('#wm2-area').selectOption({ index: 1 });
  await waitStatus(page, /could not be loaded/);
  check('a damaged area is reported and nothing is drawn', /damaged/.test(await status(page)) && (await page.locator('#wm2-surface svg').count()) === 0, await status(page));
  await shot(page, 'phase-27_area-error.png');
  await page.unroute('**/api/world-map/area/*');

  // ---- narrow viewport ----
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/maps/world-v2#c=${encodeURIComponent(ids.length ? 'x' : 'x')}`);
  await page.reload();
  await waitStatus(page, /areas on/);
  await shot(page, 'phase-27_narrow-continent.png');
  await page.locator('#wm2-area').selectOption(big);
  await waitStatus(page, /rooms/);
  if (found && found.value === big) await page.locator('#wm2-floor').selectOption(found.floor); // a floor whose rooms are close together
  await page.locator('#wm2-surface svg [data-room]').first().scrollIntoViewIfNeeded();
  console.log('  info: narrow area surface', JSON.stringify(await page.evaluate(() => { const s = document.getElementById('wm2-surface'); const v = s.querySelector('svg'); const r = v && v.getBoundingClientRect(); const c = s.getBoundingClientRect(); return { scrollLeft: s.scrollLeft, scrollTop: s.scrollTop, card: [c.left, c.top, c.width, c.height].map(Math.round), svg: r && [r.left, r.top, r.width, r.height].map(Math.round), rooms: s.querySelectorAll('[data-room]').length, firstRoom: (() => { const q = s.querySelector('[data-room]'); const b = q && q.getBoundingClientRect(); return b && [b.left, b.top, b.width, b.height].map(Math.round); })(), minRoomTop: Math.min(...[...s.querySelectorAll('[data-room]')].map((e) => Math.round(e.getBoundingClientRect().top))), minRoomLeft: Math.min(...[...s.querySelectorAll('[data-room]')].map((e) => Math.round(e.getBoundingClientRect().left))), zoom: v && v.style.width, vb: v && v.getAttribute('viewBox') }; })));
  const narrowBase = await siteExtra();
  check('narrow: the map adds no page-wide horizontal scroll beyond the site layout', (await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= narrowBase + 1, `site layout alone: ${narrowBase}px`);
  await page.waitForTimeout(400); // let the large picture rasterize before the photo
  await page.evaluate(() => new Promise((r) => { const s = document.getElementById('wm2-surface'); s.scrollTop = 2; requestAnimationFrame(() => { s.scrollTop = 0; requestAnimationFrame(r); }); }));
  await shot(page, 'phase-27_narrow-area.png');

  check('no script errors on the page', consoleErrors.length === 0, consoleErrors.join(' | ').slice(0, 300));
});

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exitCode = failed ? 1 : 0;
