/* global process */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { parseArgs, readCandidateSlices, summarize } from './verify-azah.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, '..', 'dist', 'index.js');

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'verify-azah-'));
}

const room = (id, title, description, exits = {}) => ({ id, title, description, exits, sources: [] });
const link = (id, from, dir, to) => ({ id, from, dir, to, state: 'candidate', confidence: 0.4, offPage: false, traversals: 0, reverse: false });
const mapOf = (rooms, links, area = 'az-a1') => ({
  version: 1,
  continents: [{ id: 'c1', name: 'Continent', areas: [{ id: area, name: 'Area', placement: null, subzones: [{ id: `${area}-s`, name: 'S', kind: 'consistent', rooms }] }] }],
  links,
});

test('parseArgs needs all four options and refuses anything but the DSL', () => {
  const ok = ['--world', 'dsl', '--azah', 'a', '--walked', 'w', '--out', 'o'];
  assert.deepEqual(parseArgs(ok), { world: 'dsl', azah: 'a', walked: 'w', out: 'o' });
  assert.deepEqual(parseArgs(['--', ...ok]), { world: 'dsl', azah: 'a', walked: 'w', out: 'o' });
  assert.throws(() => parseArgs(['--world', 'sandbox', '--azah', 'a', '--walked', 'w', '--out', 'o']), /Azah mapped the DSL only/);
  assert.throws(() => parseArgs(['--world', 'dsl', '--azah', 'a', '--walked', 'w']), /--out is required/);
  assert.throws(() => parseArgs(['--nope']), /unknown argument/);
  assert.throws(() => parseArgs(['--world']), /--world needs a value/);
  assert.throws(() => parseArgs(['--world', '--azah']), /--world needs a value/);
});

test('readCandidateSlices reads every gzip slice of an Azah layer and refuses other folders', () => {
  const dir = tmp();
  try {
    assert.throws(() => readCandidateSlices(dir), /no manifest.json/);
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ source: { name: 'someone-else' } }));
    assert.throws(() => readCandidateSlices(dir), /not the Azah layer/);
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ source: { name: 'azah' } }));
    fs.writeFileSync(path.join(dir, 'az-a2.json.gz'), gzipSync(JSON.stringify(mapOf([room('r2', 'Two', 'Two.')], [], 'az-a2'))));
    fs.writeFileSync(path.join(dir, 'az-a1.json.gz'), gzipSync(JSON.stringify(mapOf([room('r1', 'One', 'One.')], []))));
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'ignored');
    const { manifest, slices } = readCandidateSlices(dir);
    assert.equal(manifest.source.name, 'azah');
    assert.deepEqual(slices.map((s) => s.continents[0].areas[0].id), ['az-a1', 'az-a2']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('summarize ranks areas by how much of them is verified and lists the areas nobody walked', () => {
  const byArea = {
    a: { rooms: 10, verified: 5, verifiedDiffers: 0, ambiguous: 0, unverified: 5 },
    b: { rooms: 4, verified: 3, verifiedDiffers: 1, ambiguous: 0, unverified: 0 },
    c: { rooms: 50, verified: 0, verifiedDiffers: 0, ambiguous: 0, unverified: 50 },
    d: { rooms: 0, verified: 0, verifiedDiffers: 0, ambiguous: 0, unverified: 0 },
  };
  const summary = summarize({ counts: { azahRooms: 64 }, byArea, samples: [{ class: 'target-differs' }] }, new Map([['a', 'Alpha']]));
  assert.equal(summary.areasTotal, 4);
  assert.equal(summary.areasWithAnyVerifiedRoom, 2);
  assert.deepEqual(summary.bestAreas.map((a) => [a.id, a.name, a.rate]), [['b', 'b', 1], ['a', 'Alpha', 0.5]]);
  assert.deepEqual(summary.largestUnverifiedAreas.map((a) => a.id), ['c', 'd']);
  assert.deepEqual(summary.samples, [{ class: 'target-differs' }]);
});

test('the command line writes the report and summary, and refuses a world that is not the DSL', { skip: !fs.existsSync(dist) && 'the core package is not built' }, () => {
  const dir = tmp();
  try {
    const azah = path.join(dir, 'azah');
    fs.mkdirSync(azah);
    fs.writeFileSync(path.join(azah, 'manifest.json'), JSON.stringify({ source: { name: 'azah' } }));
    const azahMap = mapOf([room('r1', 'Hall', 'A hall.', { N: 'l1' }), room('r2', 'Study', 'A study.', {})], [link('l1', 'r1', 'N', 'r2')]);
    fs.writeFileSync(path.join(azah, 'az-a1.json.gz'), gzipSync(JSON.stringify(azahMap)));
    const walkedMap = mapOf([room('w1', 'Hall', 'A hall.', { N: 'k1' }), room('w2', 'Study', 'A study.', {})], [link('k1', 'w1', 'N', 'w2')], 'walked');
    const walked = path.join(dir, 'walked.json');
    fs.writeFileSync(walked, JSON.stringify({ v: 1, map: walkedMap }));
    const out = path.join(dir, 'out');
    const run = (world) => spawnSync(process.execPath, [path.join(here, 'verify-azah.mjs'), '--world', world, '--azah', azah, '--walked', walked, '--out', out], { encoding: 'utf8' });

    const bad = run('sandbox');
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /Azah mapped the DSL only/);

    const good = run('dsl');
    assert.equal(good.status, 0, good.stderr);
    const summary = JSON.parse(fs.readFileSync(path.join(out, 'verify-summary.json'), 'utf8'));
    assert.equal(summary.counts.rooms.verified, 2);
    assert.equal(summary.counts.links.agree, 1);
    const report = JSON.parse(fs.readFileSync(path.join(out, 'verify-report.json'), 'utf8'));
    assert.equal(report.report.links.l1, 'agree');
    assert.deepEqual(JSON.parse(good.stdout), summary);

    fs.writeFileSync(walked, JSON.stringify({ v: 1, map: { version: 1 } }));
    const broken = run('dsl');
    assert.equal(broken.status, 1);
    assert.match(broken.stderr, /walked layer is not a valid map/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
