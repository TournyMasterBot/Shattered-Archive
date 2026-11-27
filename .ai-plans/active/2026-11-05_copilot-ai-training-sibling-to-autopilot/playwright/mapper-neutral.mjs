// Phase 23: the Mapper on the neutral map model, driven like a person against the container (127.0.0.1:22081).
//   node mapper-neutral.mjs <out folder for screenshots> <scratch folder> [base url]
// Checks: the DslMapper seed read through the adapter, each zoom level, a gap / a conflict / an off-page link drawn as such, the baseline
// of a room, candidate review into the audited file (accept, reject, accept with a changed field and a note), the downloaded audited
// file against the strict validator, a gzipped Azah area file, a 1,000-room slice (a merge of real Azah area files, built here, kept
// out of the repository), keyboard use of the zoom control, and the dark-theme classifiers H1 (scrollbars), H2 (native controls), H3 (states).
import { withPage } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/browser.mjs';
import { validateMapFile } from 'file:///C:/Projects/ShatteredArchive/services/shattered-maps-core/dist/index.js';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const OUT = process.argv[2];
const SCRATCH = process.argv[3];
const BASE = process.argv[4] ?? 'http://127.0.0.1:22081';
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(SCRATCH, { recursive: true });
const SEED = 'C:/Projects/ShatteredArchive/apps/shattered-maps-client/seed_data/mapdoc.json';
const CANDIDATES = 'C:/Projects/DSL/GameLogs/ShatteredArchive/Docker/copilot-server/world-map/candidates';

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// ---- an invented demo map: a gap, a conflict, an off-page link, a baseline with a fixture, a transient and a "was" ----
const DAY = '2026-11-01';
const rec = (label, status, seen, observed, count = 1) => ({ label, kind: 'mob', status, seen, observed, count, days: [DAY], firstSeen: DAY, lastSeen: DAY, missed: 0, returns: 0 });
const room = (id, title, x, y, extra = {}) => ({ id, title, exits: {}, coords: { x, y, z: 0 }, sources: [{ kind: 'azah', ref: id, credit: 'Test Author', date: '2026-10-01' }], ...extra });
const link = (id, from, dir, to, extra = {}) => ({ id, from, dir, to, state: to === null ? 'unknown-target' : 'candidate', confidence: to === null ? 0 : 0.6, offPage: false, traversals: 0, reverse: false, ...extra });
const demo = {
  version: 1,
  generatedAt: '2026-11-07',
  continents: [
    {
      id: 'c-green',
      name: 'Greenmarch',
      areas: [
        {
          id: 'a-farm',
          name: 'North Farm',
          placement: { x: 0, y: 0, w: 3, h: 2 },
          subzones: [
            {
              id: 's-fields',
              name: 'Fields',
              kind: 'consistent',
              rooms: [
                room('r-gate', 'The Gate', 0, 0, { sector: 'city', vnum: 100, description: 'A tall gate of grey stone, with a lamp above it.', exits: { E: 'l1', N: 'l3', S: 'l6' },
                  baseline: { visits: 6, days: ['2026-11-01', '2026-11-03'], contents: [rec('a tired guard', 'fixture', 6, 6, 2), rec('a wandering bard', 'transient', 1, 6)],
                    was: [{ label: 'a lost cat', kind: 'mob', seen: 4, observed: 8, count: 1, firstSeen: DAY, lastSeen: DAY, demotedOn: '2026-11-03', returns: 0 }] } }),
                room('r-barn', 'The Barn', 1, 0, { exits: { W: 'l2', S: 'l5', E: 'l7' } }),
                room('r-well', 'The Well', 1, 1, { exits: { E: 'l4' } }),
                room('r-lane', 'A Muddy Lane', 0, 1, { exits: { N: 'l8' } }),
                room('r-yard', 'The Yard', 2, 0, { exits: { W: 'l9' } }),
              ],
            },
            { id: 's-cellar', name: 'Cellar', kind: 'maze', rooms: [room('r-cellar', 'The Cellar', 0, 0)] },
          ],
        },
        { id: 'a-harbor', name: 'Harbor', placement: { x: 3, y: 0, w: 2, h: 2 }, subzones: [{ id: 's-quay', name: 'Quay', kind: 'consistent', rooms: [room('r-quay', 'The Quay', 0, 0)] }] },
      ],
    },
  ],
  links: [
    link('l1', 'r-gate', 'E', 'r-barn', { state: 'confirmed', confidence: 0.95, reverse: true, traversals: 3 }),
    link('l2', 'r-barn', 'W', 'r-gate', { state: 'confirmed', confidence: 0.95, reverse: true, traversals: 2 }),
    link('l3', 'r-gate', 'N', null),
    link('l4', 'r-well', 'E', 'r-quay', { offPage: true }),
    link('l5', 'r-barn', 'S', 'r-well', { state: 'conflict', confidence: 0, conflictTo: ['r-cellar'] }),
    link('l6', 'r-gate', 'S', 'r-lane'),
    link('l7', 'r-barn', 'E', 'r-yard'),
    link('l8', 'r-lane', 'N', 'r-gate'),
    link('l9', 'r-yard', 'W', 'r-barn'),
  ],
};
const demoPath = path.join(SCRATCH, 'demo-candidates.json');
fs.writeFileSync(demoPath, JSON.stringify(demo));
check('the invented demo map is a valid neutral map file', validateMapFile(demo).ok);

// ---- a 1,000-room slice: real Azah area files of one continent, merged (kept out of the repository) ----
const manifest = JSON.parse(fs.readFileSync(path.join(CANDIDATES, 'manifest.json'), 'utf8'));
const first = manifest.areas[0].continentId;
const merged = { version: 1, generatedAt: '2026-11-07', continents: [], links: [] };
let roomCount = 0;
for (const entry of manifest.areas.filter((a) => a.continentId === first)) {
  const part = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(CANDIDATES, entry.file))));
  let into = merged.continents.find((c) => c.id === part.continents[0].id);
  if (!into) merged.continents.push((into = { id: part.continents[0].id, name: part.continents[0].name, areas: [] }));
  into.areas.push(...part.continents[0].areas);
  merged.links.push(...part.links);
  roomCount += entry.rooms;
  if (roomCount >= 1000) break;
}
const slicePath = path.join(SCRATCH, 'slice-1000.json');
fs.writeFileSync(slicePath, JSON.stringify(merged));
check(`the merged Azah slice has at least 1,000 rooms and passes the strict validator (${roomCount} rooms, ${merged.continents[0].areas.length} areas)`, roomCount >= 1000 && validateMapFile(merged).ok);
const gzArea = manifest.areas.find((a) => a.id === 'az-a207') ?? manifest.areas[0];

const text = async (page, sel) => (await page.locator(sel).first().textContent()) ?? '';
const polys = (page) => page.locator('svg polygon[data-room]').count();

await withPage(
  `${BASE}/`,
  async (page) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('dialog', (d) => d.accept());
    const candidatesInput = page.getByLabel('Open a candidates file');
    await page.waitForLoadState('networkidle');

    check('the home page is the neutral viewer, empty at first', (await page.getByRole('heading', { name: 'The audited file is empty' }).count()) === 1);
    check('the classic editor is still there at #/legacy', await (async () => {
      await page.goto(`${BASE}/#/legacy`);
      await page.waitForSelector('text=Export JSON', { timeout: 15000 });
      await page.goto(`${BASE}/#/`);
      await page.waitForSelector('text=The audited file is empty');
      return true;
    })());

    // 1. the DslMapper seed, through the adapter
    await candidatesInput.setInputFiles(SEED);
    await page.waitForSelector('text=Read 176 rooms', { timeout: 15000 });
    const reportText = await text(page, 'details');
    check('the seed document is read through the adapter: 176 rooms, with the report of what was left behind', /Read 176 rooms and \d+ exits/.test(reportText) && /Not carried over/.test(reportText), reportText.slice(0, 200));
    check('and the continent level lists its areas', (await page.getByRole('list', { name: 'Areas' }).count()) === 1);
    await page.screenshot({ path: path.join(OUT, 'phase-23_seed-continent.png') });
    // an area of the seed, one level down (its areas have one subzone each, so the area opens the drawing)
    const firstArea = page.getByRole('list', { name: 'Areas' }).getByRole('button').first();
    await firstArea.click();
    await page.waitForSelector('svg polygon[data-room]', { timeout: 15000 });
    check('an area with one subzone draws it, with rooms as tiles', (await polys(page)) > 0, String(await polys(page)));
    await page.screenshot({ path: path.join(OUT, 'phase-23_seed-area.png') });

    // 2. the demo map: gap, conflict, off-page link, baseline
    await candidatesInput.setInputFiles(demoPath);
    await page.waitForSelector('text=Opened demo-candidates.json');
    await page.getByRole('list', { name: 'Areas' }).getByRole('button', { name: /North Farm/ }).click();
    check('an area with several subzones asks which to open', (await page.getByText(/2 subzones, each laid out on its own grid/).count()) === 1);
    await page.screenshot({ path: path.join(OUT, 'phase-23_area-chooser.png') });
    await page.getByRole('button', { name: /Fields/ }).click();
    await page.waitForSelector('svg polygon[data-room]');
    const gap = await page.locator('svg line[data-state="unknown-target"]').count();
    const conflict = await page.locator('svg line[data-state="conflict"]').count();
    const offpage = await page.locator('svg text[data-link="l4"]').allTextContents();
    check('a gap is drawn as its own element: a stub ending in "?"', gap === 1 && (await page.locator('svg text[data-link="l3"]').allTextContents()).join('') === '?', `lines=${gap}`);
    check('a conflict is drawn apart: red, short dashes', conflict === 1 && (await page.locator('svg line[data-state="conflict"]').getAttribute('stroke')) === '#c0392b');
    check('a link that leaves the page ends in an arrow', offpage.join('') === '→', offpage.join(''));
    check('the counts say so', (await text(page, 'p[aria-live="polite"]')).includes('1 unknown exit') );
    await page.getByRole('button', { name: 'The Gate', exact: true }).first().click();
    await page.waitForSelector('article[aria-label="Room The Gate"]');
    const panel = await text(page, 'article[aria-label="Room The Gate"]');
    check('the room panel separates what is always there, what was only seen, and what used to be there',
      panel.includes('Always here') && panel.includes('a tired guard ×2') && panel.includes('Seen, not part of the room') && panel.includes('a wandering bard') && panel.includes('Used to be here') && panel.includes('a lost cat'));
    check('and credits its source', panel.includes('azah, by Test Author, 2026-10-01'));
    await page.screenshot({ path: path.join(OUT, 'phase-23_gap-offpage-baseline.png') });

    // 3. review: accept (with a note), reject, accept with a changed field
    await page.getByLabel('Note for the decision').fill('checked in game');
    await page.getByRole('button', { name: /room The Barn/ }).click();
    await page.getByRole('button', { name: 'Accept', exact: true }).click();
    await page.getByRole('button', { name: /room The Well/ }).click();
    await page.getByRole('button', { name: 'Reject', exact: true }).click();
    await page.getByRole('button', { name: /room A Muddy Lane/ }).click();
    await page.getByLabel('Title').fill('The Muddy Lane');
    await page.getByRole('button', { name: 'Accept with these changes' }).click();
    const tally = await text(page, 'section[aria-label="Candidate review"] p[aria-live="polite"]');
    check('the review counts are 1 accepted, 1 changed, 1 rejected', /1 accepted/.test(tally) && /1 changed/.test(tally) && /1 rejected/.test(tally), tally);
    check('decided rooms are marked on the drawing', (await page.locator('svg [data-review="accepted"]').count()) === 1 && (await page.locator('svg [data-review="rejected"]').count()) === 1 && (await page.locator('svg [data-review="edited"]').count()) === 1);
    await page.screenshot({ path: path.join(OUT, 'phase-23_review.png') });

    // the audited file the browser keeps, and the file the curator downloads, against the strict validator
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('shatteredmaps.audited') ?? 'null'));
    const log = await page.evaluate(() => JSON.parse(localStorage.getItem('shatteredmaps.review') ?? 'null'));
    check('the audited file in the browser is valid and holds the two accepted rooms', validateMapFile(saved).ok && saved.continents[0].areas[0].subzones[0].rooms.length === 2, JSON.stringify(validateMapFile(saved).errors ?? []));
    const decided = log.decisions.map((d) => `${d.id}:${d.status}`).sort().join(',');
    check('the review log keeps each decision with its note and date', decided === 'r-barn:accepted,r-lane:edited,r-well:rejected' && log.decisions.find((d) => d.id === 'r-barn').note === 'checked in game' && log.decisions.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.at)), decided);
    const lane = saved.continents[0].areas[0].subzones[0].rooms.find((r) => r.id === 'r-lane');
    check('an accepted room keeps its source and gains the review stamp and a history line', lane.title === 'The Muddy Lane' && lane.sources.some((s) => s.kind === 'azah') && lane.sources.some((s) => s.ref === 'review') && lane.history?.[0].note.startsWith('review: accepted with changes (title)'), JSON.stringify(lane.history));
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download audited file' }).click()]);
    const downloaded = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    check('the downloaded audited file passes the strict validator', validateMapFile(downloaded).ok && /^audited-map-\d{4}-\d{2}-\d{2}\.json$/.test(download.suggestedFilename()), download.suggestedFilename());
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.getByRole('radio', { name: 'Audited' }).check();
    check('the audited file survives a reload', (await page.getByRole('heading', { name: 'Greenmarch' }).count()) === 1);

    // 4. a gzipped Azah area file
    await page.reload();
    await candidatesInput.setInputFiles(path.join(CANDIDATES, gzArea.file));
    await page.waitForSelector(`text=Opened ${gzArea.file}`, { timeout: 15000 });
    check(`a gzipped Azah area file opens (${gzArea.name}, ${gzArea.rooms} rooms)`, (await page.getByRole('heading', { name: /./ }).count()) > 0);

    // 5. the 1,000-room slice
    const t0 = Date.now();
    await candidatesInput.setInputFiles(slicePath);
    await page.waitForSelector('text=Opened slice-1000.json', { timeout: 60000 });
    const openMs = Date.now() - t0;
    check(`the 1,000-room slice opens in a few seconds (${openMs} ms)`, openMs < 15000);
    const totalAreas = merged.continents[0].areas.length;
    check('its continent lists all its areas', (await page.getByRole('list', { name: 'Areas' }).getByRole('button').count()) === totalAreas, String(totalAreas));
    await page.screenshot({ path: path.join(OUT, 'phase-23_slice-continent.png') });
    const biggest = [...merged.continents[0].areas].sort((a, b) => b.subzones.reduce((n, s) => n + s.rooms.length, 0) - a.subzones.reduce((n, s) => n + s.rooms.length, 0))[0];
    await page.getByRole('list', { name: 'Areas' }).getByRole('button', { name: new RegExp(biggest.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first().click();
    await page.waitForSelector('svg polygon[data-room]', { timeout: 30000 });
    const drawn = await polys(page);
    check(`the largest area of the slice draws on its busiest floor (${drawn} tiles)`, drawn > 50, String(drawn));
    // H1: the picture and the side column overflow, and their scrollbars follow the dark scheme
    const overflow = await page.evaluate(() => {
      const pic = document.querySelector('svg')?.parentElement;
      const side = pic?.closest('main')?.querySelector('aside');
      const q = (el) => (el ? { scheme: getComputedStyle(el).colorScheme, scrollable: el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth } : null);
      return { picture: q(pic), side: q(side) };
    });
    check('H1: the drawing overflows (scrollbars visible) and follows color-scheme: dark', overflow.picture?.scrollable === true && overflow.picture?.scheme === 'dark', JSON.stringify(overflow));
    await page.screenshot({ path: path.join(OUT, 'phase-23_slice-area.png') });

    // 6. keyboard use of the zoom control
    await page.getByRole('toolbar', { name: 'Zoom level' }).getByRole('button').nth(1).focus();
    await page.keyboard.press('ArrowLeft');
    const onContinent = await page.evaluate(() => document.activeElement?.textContent ?? '');
    await page.keyboard.press('End');
    const onLast = await page.evaluate(() => document.activeElement?.textContent ?? '');
    check('the zoom control is a toolbar: arrow keys and End move between its levels', onContinent.startsWith('Continent') && onLast.startsWith('Subzone') || onLast.startsWith('Area'), `${onContinent} | ${onLast}`);
    await page.keyboard.press('Home');
    await page.keyboard.press('Enter');
    check('Enter zooms to the level in focus', (await page.getByRole('list', { name: 'Areas' }).count()) === 1);
    // H3, at the continent level, where Zoom out is disabled: a disabled control is dimmed, a button shows a pointer, a focused control has a ring
    const states = await page.evaluate(() => {
      const btn = document.querySelector('button:not(:disabled)');
      const disabled = document.querySelector('button:disabled');
      return { disabledOpacity: disabled ? getComputedStyle(disabled).opacity : 'none', pointer: btn ? getComputedStyle(btn).cursor : '' };
    });
    await page.getByRole('list', { name: 'Areas' }).getByRole('button').first().focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    const focusRing = await page.evaluate(() => { const el = document.activeElement; const cs = getComputedStyle(el); return `${cs.outlineStyle} ${cs.outlineWidth}`; });
    check('H3: disabled controls are dimmed, buttons show a pointer, and the focused control has a visible ring', states.disabledOpacity === '0.45' && states.pointer === 'pointer' && /solid 2px/.test(focusRing), `${JSON.stringify(states)} ${focusRing}`);

    // 7. H2 and H3 on the review panel's controls
    await page.getByRole('list', { name: 'Areas' }).getByRole('button').first().click();
    await page.waitForSelector('svg polygon[data-room]');
    await page.getByRole('button', { name: /^Zoom in to / }).first().click();
    await page.waitForSelector('article[aria-label^="Room "]');
    await page.getByRole('region', { name: 'Exits' }).getByRole('button').first().click(); // opens the link editor, which has a select
    await page.waitForSelector('select');
    const controls = await page.evaluate(() => {
      const scheme = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el).colorScheme : 'missing'; };
      return { select: scheme('select'), input: scheme('input[type="text"], input:not([type])'), textarea: scheme('textarea'), radio: scheme('input[type="radio"]') };
    });
    check('H2: native controls (select, text input, radio) follow the dark scheme', controls.select === 'dark' && controls.input === 'dark' && controls.radio === 'dark', JSON.stringify(controls));
    await page.screenshot({ path: path.join(OUT, 'phase-23_room-controls.png') });

    check('no page error and no console error during the run', errors.length === 0, errors.slice(0, 2).join(' | '));
  },
  { contextOptions: { acceptDownloads: true } },
);

const failed = results.filter((ok) => !ok).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exitCode = failed === 0 ? 0 : 1;
