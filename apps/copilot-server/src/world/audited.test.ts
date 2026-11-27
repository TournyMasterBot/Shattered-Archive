import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import type { MapFile } from '@shatteredarchive/shattered-maps-core';
import { combineEvidence, createAuditedEvidence, loadAuditedLayer, mergeEvidence, noEvidence } from './audited';

const room = (id: string, title: string, exits: Record<string, string> = {}) => ({ id, title, description: 'Plain.', exits, sources: [{ kind: 'azah', ref: id }] });
const link = (id: string, from: string, dir: string, to: string | null, state: string, confidence: number) => ({ id, from, dir, to, state, confidence, offPage: false, traversals: 0, reverse: false });

function map(): MapFile {
  return {
    version: 1,
    continents: [
      {
        id: 'c1',
        name: 'C',
        areas: [
          {
            id: 'a1',
            name: 'A',
            placement: null,
            subzones: [{ id: 's1', name: 'S', kind: 'consistent', rooms: [room('r1', 'Hall', { N: 'l1', E: 'l2', S: 'l3' }), room('r2', 'Study')] }],
          },
        ],
      },
    ],
    links: [link('l1', 'r1', 'N', 'r2', 'confirmed', 0.95), link('l2', 'r1', 'E', 'r2', 'conflict', 0), link('l3', 'r1', 'S', null, 'unknown-target', 0.4)],
  } as unknown as MapFile;
}

let root: string;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'audited-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function folder(manifest: unknown, slices: Record<string, unknown> = { 'a1.json.gz': map() }, name = 'audited'): string {
  const dir = path.join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
  for (const [name, body] of Object.entries(slices)) writeFileSync(path.join(dir, name), gzipSync(JSON.stringify(body)));
  return dir;
}

describe('loadAuditedLayer', () => {
  it('reads an audited layer as one map', async () => {
    const loaded = await loadAuditedLayer(folder({ status: 'audited' }));
    expect(loaded?.continents[0].areas[0].subzones[0].rooms.map((r) => r.id)).toEqual(['r1', 'r2']);
  });

  it('is undefined (no evidence, not an error) for a missing folder, an unreadable or non-audited manifest, or no slices', async () => {
    expect(await loadAuditedLayer(path.join(root, 'nothing'))).toBeUndefined();
    expect(await loadAuditedLayer(folder({ status: 'candidate' }))).toBeUndefined();
    writeFileSync(path.join(root, 'audited', 'manifest.json'), '{broken');
    expect(await loadAuditedLayer(path.join(root, 'audited'))).toBeUndefined();
    expect(await loadAuditedLayer(folder({ status: 'audited' }, {}, 'empty'))).toBeUndefined();
  });

  it('refuses a slice that is not a valid map, saying which', async () => {
    await expect(loadAuditedLayer(folder({ status: 'audited' }, { 'bad.json.gz': { version: 1 } }))).rejects.toThrow(/bad.json.gz is not a valid map/);
  });
});

describe('createAuditedEvidence', () => {
  const placed = async () => {
    const evidence = createAuditedEvidence(map());
    await evidence.tracer.apply({ title: 'Hall', description: 'Plain.', exits: ['N', 'E', 'S'] }, { day: '2026-11-11', session: 's' });
    return evidence;
  };

  it('gives the map\'s confidence for the exit a movement command takes, once the room is known', async () => {
    const e = await placed();
    expect(e.edgeEvidence('Hall', 'north')).toBe(0.95);
    expect(e.edgeEvidence('hall', 'n')).toBe(0.95);
    expect(e.edgeEvidence('Hall', 'east')).toBe(0);
  });

  it('says nothing for a command that is not a move, an exit nobody knows the end of, a room it is not in, or no room title', async () => {
    const e = await placed();
    expect(e.edgeEvidence('Hall', 'look')).toBeNull();
    expect(e.edgeEvidence('Hall', 'south')).toBeNull();
    expect(e.edgeEvidence('Hall', 'west')).toBeNull();
    expect(e.edgeEvidence('Study', 'north')).toBeNull();
    expect(e.edgeEvidence(undefined, 'north')).toBeNull();
  });

  it('says nothing before any view', () => {
    expect(createAuditedEvidence(map()).edgeEvidence('Hall', 'north')).toBeNull();
  });
});

describe('mergeEvidence', () => {
  it.each([
    [null, null, null],
    [0.6, null, 0.6],
    [null, 0.95, 0.95],
    [0.6, 0.95, 0.95],
    [0.95, 0.4, 0.95],
    [0, 0.95, 0],
    [0.95, 0, 0],
    [0, 0, 0],
  ])('%p and %p make %p', (a, b, expected) => {
    expect(mergeEvidence(a, b)).toBe(expected);
  });
});

describe('combineEvidence', () => {
  const says = (n: number | null) => () => n;

  it('merges what every source says: a contradiction wins, otherwise the surest, and null when none can say', () => {
    expect(combineEvidence([says(0.6), says(null), says(0.95)])('Hall', 'north')).toBe(0.95);
    expect(combineEvidence([says(0.95), says(0), says(0.4)])('Hall', 'north')).toBe(0);
    expect(combineEvidence([says(null), says(null)])('Hall', 'north')).toBeNull();
    expect(combineEvidence([])('Hall', 'north')).toBeNull();
  });

  it('asks each source the same question, and noEvidence never knows', () => {
    const seen: unknown[] = [];
    const spy = (title: string | undefined, command: string) => (seen.push([title, command]), 0.6);
    expect(combineEvidence([spy, noEvidence])('Hall', 'n')).toBe(0.6);
    expect(seen).toEqual([['Hall', 'n']]);
    expect(noEvidence('Hall', 'n')).toBeNull();
  });
});
