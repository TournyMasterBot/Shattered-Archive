// Phase 24: the Builder export panel of the Mapper, driven like a person against the container (127.0.0.1:22081).
//   node mapper-export.mjs <out folder for screenshots> <scratch folder> [base url]
// Checks: the panel asks for a zoom at the continent level, offers a file name and a number range at an area, the report of a 12-room
// export (rooms, exits, what the file leaves out), the downloaded .are file and import request against the Builder's own parser, a
// range that is too small (the reason, no download), dark-theme native controls (H2), and that the page makes no request at all to
// the Builder (no POST, no PUT, no other origin).
import { withPage } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/browser.mjs';
import { validateMapFile } from 'file:///C:/Projects/ShatteredArchive/services/shattered-maps-core/dist/index.js';
import { parseAreaFile, emitAreaFile } from 'file:///C:/Projects/ShatteredArchive/services/merc-area/dist/index.js';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2];
const SCRATCH = process.argv[3];
const BASE = process.argv[4] ?? 'http://127.0.0.1:22081';
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(SCRATCH, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// ---- an invented audited map: 12 rooms in two rows, a gap, a room with an odd sector, a "~" in a description ----
const sectors = ['city', 'city', 'field', 'forest', 'hills', 'inside', 'city', 'field', 'mountain', 'underground', 'city', 'water'];
const rooms = [];
const links = [];
for (let i = 0; i < 12; i += 1) {
  const id = `m${i + 1}`;
  const x = i % 6;
  const y = Math.floor(i / 6);
  const exits = {};
  const add = (dir, to, extra = {}) => {
    const lid = `${id}-${dir.toLowerCase()}`;
    links.push({ id: lid, from: id, dir, to, state: to === null ? 'unknown-target' : 'confirmed', confidence: to === null ? 0 : 0.95, offPage: false, traversals: to === null ? 0 : 2, reverse: to !== null, ...extra });
    exits[dir] = lid;
  };
  if (x < 5) add('E', `m${i + 2}`);
  if (x > 0) add('W', `m${i}`);
  if (y === 0) add('S', `m${i + 7}`);
  if (y === 1) add('N', `m${i - 5}`);
  if (i === 11) add('E', null);
  rooms.push({
    id,
    title: `Mill Lane ${i + 1}`,
    sector: sectors[i],
    description: i === 2 ? 'A rutted lane. Someone scratched ~danger~ on a post.' : `A rutted lane, number ${i + 1}, between hedges and a low wall.`,
    exits,
    coords: { x, y, z: 0 },
    sources: [{ kind: 'manual', credit: 'Test Author', date: '2026-11-01' }],
  });
}
const demo = {
  version: 1,
  generatedAt: '2026-11-08',
  continents: [{ id: 'c-check', name: 'Check Land', areas: [{ id: 'a-mill', name: 'Mill Lane', placement: { x: 0, y: 0, w: 6, h: 2 }, subzones: [{ id: 's-mill', name: 'Main', kind: 'consistent', rooms }] }] }],
  links,
};
const demoPath = path.join(SCRATCH, 'export-audited.json');
fs.writeFileSync(demoPath, JSON.stringify(demo));
check('the invented audited map is a valid neutral map file', validateMapFile(demo).ok, JSON.stringify(validateMapFile(demo).errors?.slice(0, 4)));

await withPage(
  `${BASE}/`,
  async (page) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const errors = [];
    const requests = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('request', (r) => requests.push({ method: r.method(), url: r.url() }));
    page.on('dialog', (d) => d.accept());
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForLoadState('networkidle');

    await page.getByLabel('Open the audited file').setInputFiles(demoPath);
    await page.waitForSelector('text=Check Land');
    const panel = page.getByRole('region', { name: 'Export to the Builder' });
    check('at the continent level the panel asks for a zoom and offers no button', (await panel.getByText(/Zoom to an area or a subzone/).count()) === 1 && (await panel.getByRole('button').count()) === 0);

    await page.getByRole('list', { name: 'Areas' }).getByRole('button', { name: /Mill Lane/ }).click();
    await page.waitForSelector('svg polygon[data-room]');
    const fileName = await panel.getByLabel('File name').inputValue();
    const first = await panel.getByLabel('First room number').inputValue();
    const last = await panel.getByLabel('Last room number').inputValue();
    check('at an area the panel offers the file name of the area and a range of at least a hundred numbers', fileName === 'a-mill.are' && first === '30000' && last === '30099', `${fileName} ${first}-${last}`);

    await panel.getByRole('button', { name: 'Make the Builder file' }).click();
    await page.waitForSelector('[role="status"]:has-text("rooms and")');
    const report = (await panel.textContent()) ?? '';
    check('the report counts 12 rooms and 32 exits, in the range', /12\s*rooms and\s*32\s*exits, numbers 30000 to 30099/.test(report), report.slice(0, 160));
    check('and lists what the file leaves out: positions, origin records, the gap, the odd sector, the "~"',
      report.includes('12 rooms with a position on the map grid') && report.includes('12 rooms with a record of where they came from') &&
      report.includes('1 exits whose target is not known (left out)') && report.includes('"underground" is not a Merc sector') && report.includes('1 descriptions with a "~"'));
    check('and says committing is a separate step in the Builder', report.includes('a separate step'));
    await page.screenshot({ path: path.join(OUT, 'phase-24_export.png'), fullPage: true });

    const [fileDownload] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'Download the .are file' }).click()]);
    const areText = fs.readFileSync(await fileDownload.path(), 'utf8');
    const parsed = parseAreaFile(areText);
    const mercRooms = parsed.sections.find((s) => s.kind === 'rooms').rooms;
    check('the downloaded .are file is named as asked and the Builder parser reads it back to 12 rooms', fileDownload.suggestedFilename() === 'a-mill.are' && mercRooms.length === 12, fileDownload.suggestedFilename());
    check('re-emitting the parsed text changes nothing (the Builder\'s round-trip rule)', emitAreaFile(parsed) === areText);
    check('the numbers are 30000 to 30011 and the gap exit is not written',
      mercRooms.map((r) => r.vnum).join() === Array.from({ length: 12 }, (_, i) => 30000 + i).join() && mercRooms[11].exits.length === 2, mercRooms[11].exits.length + ' exits in the last room');
    check('the "~" was replaced and the odd sector written as inside', mercRooms[2].description.includes('-danger-') && mercRooms[9].sectorType === 0);

    const [reqDownload] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'Download as an import request' }).click()]);
    const body = JSON.parse(fs.readFileSync(await reqDownload.path(), 'utf8'));
    check('the import request is { file, text } with the same text', reqDownload.suggestedFilename() === 'a-mill.are.request.json' && body.file === 'a-mill.are' && body.text === areText);

    // a range too small
    await panel.getByLabel('Last room number').fill('30003');
    await panel.getByRole('button', { name: 'Make the Builder file' }).click();
    await page.waitForSelector('[role="alert"]:has-text("too few")');
    const alertText = (await panel.getByRole('alert').textContent()) ?? '';
    check('a range that is too small says by how much and offers no download', /4 numbers but 12 rooms need one \(8 too few/.test(alertText) && (await panel.getByRole('button', { name: /Download/ }).count()) === 0, alertText.slice(0, 120));
    await page.screenshot({ path: path.join(OUT, 'phase-24_export-error.png'), fullPage: true });

    // the range is remembered
    await page.reload();
    await page.waitForSelector('text=Check Land');
    await page.getByRole('list', { name: 'Areas' }).getByRole('button', { name: /Mill Lane/ }).click();
    check('the number range typed last is offered again after a reload', (await panel.getByLabel('Last room number').inputValue()) === '30003');

    const scheme = await page.evaluate(() => {
      const el = document.querySelector('section[aria-label="Export to the Builder"] input');
      return el ? getComputedStyle(el).colorScheme : 'missing';
    });
    check('H2: the panel\'s inputs follow the dark scheme', scheme === 'dark', scheme);

    const outbound = requests.filter((r) => !r.url.startsWith(BASE) && !r.url.startsWith('blob:') && !r.url.startsWith('data:'));
    const writes = requests.filter((r) => r.method !== 'GET');
    check('the page never calls the Builder: no request to another origin, no POST or PUT', outbound.length === 0 && writes.length === 0, JSON.stringify([...outbound, ...writes].slice(0, 3)));
    check('no page error and no console error during the run', errors.length === 0, errors.slice(0, 2).join(' | '));
  },
  { contextOptions: { acceptDownloads: true } },
);

const failed = results.filter((ok) => !ok).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exitCode = failed === 0 ? 0 : 1;
