/* global process */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { listedFiles, parseArgs, readAreas } from './import-merc.mjs';
import { parseArgs as checkArgs } from './check-against-builder.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, '..', 'dist', 'index.js');

test('parseArgs needs the area folder and the output, a real date, and refuses a wwwroot output or report', () => {
  assert.deepEqual(parseArgs(['--area-dir', 'a', '--out', 'o', '--date', '2026-11-11']), { areaDir: 'a', out: 'o', date: '2026-11-11' });
  assert.equal(parseArgs(['--', '--area-dir', 'a', '--out', 'o', '--report', 'r']).report, 'r');
  assert.throws(() => parseArgs(['--out', 'o']), /--area-dir is required/);
  assert.throws(() => parseArgs(['--area-dir', 'a']), /--out is required/);
  assert.throws(() => parseArgs(['--area-dir', 'a', '--out', 'o', '--nope']), /unknown argument/);
  assert.throws(() => parseArgs(['--area-dir']), /--area-dir needs a value/);
  assert.throws(() => parseArgs(['--area-dir', 'a', '--out', 'o', '--date', 'soon']), /--date must be YYYY-MM-DD/);
  assert.throws(() => parseArgs(['--area-dir', 'a', '--out', 'C:/site/wwwroot/map.json']), /--out may not be under a wwwroot folder/);
  assert.throws(() => parseArgs(['--area-dir', 'a', '--out', 'o', '--report', 'C:/site/wwwroot/r.json']), /--report may not be under a wwwroot folder/);
});

test('the builder check takes the area folder and a date and nothing else', () => {
  assert.deepEqual(checkArgs(['--area-dir', 'a', '--date', '2026-11-11']), { areaDir: 'a', date: '2026-11-11' });
  assert.match(checkArgs(['--', '--area-dir', 'a']).date, /^\d{4}-\d{2}-\d{2}$/);
  assert.throws(() => checkArgs([]), /--area-dir is required/);
  assert.throws(() => checkArgs(['--area-dir', 'a', '--out', 'x']), /unknown argument/);
  assert.throws(() => checkArgs(['--area-dir']), /--area-dir needs a value/);
});

test('listedFiles reads area.lst in order, skips blank lines and stops at the dollar sign', () => {
  assert.deepEqual(listedFiles('a.are\r\n\r\n b.are \n$\nc.are\n'), ['a.are', 'b.are']);
  assert.deepEqual(listedFiles(''), []);
});

test('readAreas parses the listed files and reports one that is missing and one that does not parse', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'merc-areas-'));
  try {
    fs.writeFileSync(path.join(dir, 'area.lst'), 'good.are\nmissing.are\nbad.are\n$\n');
    fs.writeFileSync(path.join(dir, 'good.are'), 'good');
    fs.writeFileSync(path.join(dir, 'bad.are'), 'bad');
    const parse = (text) => {
      if (text === 'bad') throw new Error('broken');
      return { sections: [] };
    };
    assert.deepEqual(readAreas(dir, parse), {
      files: [{ file: 'good.are', area: { sections: [] } }],
      missing: ['missing.are'],
      failed: [{ file: 'bad.are', error: 'broken' }],
    });
    const nonError = readAreas(dir, () => {
      throw 'plain';
    });
    assert.equal(nonError.failed[0].error, 'plain');
    assert.throws(() => readAreas(path.join(dir, 'nowhere'), parse), /no area.lst/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the script writes a valid map and a report for a folder of areas, and prints no room text', { skip: !fs.existsSync(dist) }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'merc-run-'));
  try {
    const room = (v, name, exits) => `#${v}\n${name}~\nText of ${name}.\n~\n0 0 1\n${exits}S\n`;
    const exit = (door, to) => `D${door}\nx~\n~\n0 0 ${to}\n`;
    const are = `#AREA\nt.are~\n{ 1 9} Test~\n{ 1 9} Me~\n0 99\n\n#ROOMS\n${room(1, 'First', exit(0, 2) + exit(1, -1))}${room(2, 'Second', exit(2, 1))}#0\n\n#RESETS\nS\n\n#$\n`;
    fs.writeFileSync(path.join(dir, 'area.lst'), 't.are\nmissing.are\n$\n');
    fs.writeFileSync(path.join(dir, 't.are'), are);
    const out = path.join(dir, 'out', 'map.json');
    const report = path.join(dir, 'out', 'report.json');
    const run = spawnSync(process.execPath, [path.join(here, 'import-merc.mjs'), '--area-dir', dir, '--out', out, '--report', report, '--date', '2026-11-11'], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const summary = JSON.parse(run.stdout);
    assert.deepEqual([summary.areas, summary.rooms, summary.links, summary.deadExits, summary.missingFiles], [1, 2, 2, 1, ['missing.are']]);
    assert.ok(!run.stdout.includes('Text of First'));
    const map = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.equal(map.continents[0].areas[0].subzones[0].rooms.length, 2);
    assert.equal(JSON.parse(fs.readFileSync(report, 'utf8')).deadList[0].toVnum, -1);

    const bad = spawnSync(process.execPath, [path.join(here, 'import-merc.mjs'), '--area-dir', path.join(dir, 'none'), '--out', out], { encoding: 'utf8' });
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /import-merc: no area.lst/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
