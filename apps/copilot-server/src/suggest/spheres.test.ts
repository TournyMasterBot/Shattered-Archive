import { SPHERES } from '@shatteredarchive/copilot-core';
import { BUILT_IN_SPHERES, parseSpheres, readSpheres } from './spheres';

const FILE = {
  spheres: {
    world: { neighbours: ['fighting'], misrouteHint: { fighting: 'A mob in the room is a fight, not a place.' } },
    fighting: { neighbours: ['world', 'things'] },
    interaction: { neighbours: ['world'], misrouteHint: { world: 'ok', bogus: 'ignored', things: 5 } },
    things: { neighbours: [], misrouteHint: 'not an object' },
  },
};

describe('BUILT_IN_SPHERES', () => {
  it('has neighbours that are two-sided, never a sphere’s own, and the same as the Shattered-AI map (world and things are the one pair that are not neighbours)', () => {
    for (const a of SPHERES) {
      expect(BUILT_IN_SPHERES.neighbours(a)).not.toContain(a);
      for (const b of BUILT_IN_SPHERES.neighbours(a)) expect(BUILT_IN_SPHERES.neighbours(b)).toContain(a);
    }
    expect([...BUILT_IN_SPHERES.neighbours('world')]).toEqual(['fighting', 'interaction']);
    expect([...BUILT_IN_SPHERES.neighbours('fighting')]).toEqual(['world', 'things', 'interaction']);
    expect(BUILT_IN_SPHERES.neighbours('world')).not.toContain('things');
    expect(BUILT_IN_SPHERES.misrouteHint('world', 'fighting')).toBeUndefined();
  });
});

describe('parseSpheres', () => {
  it('reads the neighbours and the misroute hints of the Shattered-AI file', () => {
    const table = parseSpheres(FILE);
    expect(table?.neighbours('world')).toEqual(['fighting']);
    expect(table?.neighbours('things')).toEqual([]);
    expect(table?.misrouteHint('world', 'fighting')).toBe('A mob in the room is a fight, not a place.');
    expect(table?.misrouteHint('interaction', 'world')).toBe('ok');
    expect(table?.misrouteHint('interaction', 'things')).toBeUndefined();
    expect(table?.misrouteHint('fighting', 'world')).toBeUndefined();
  });

  it('gives undefined for anything that is not a complete, valid table', () => {
    const without = (sphere: string) => ({ spheres: Object.fromEntries(Object.entries(FILE.spheres).filter(([k]) => k !== sphere)) });
    for (const bad of [null, 'text', {}, { spheres: 5 }, without('world'), { spheres: { ...FILE.spheres, world: 7 } }, { spheres: { ...FILE.spheres, world: { neighbours: 'x' } } }, { spheres: { ...FILE.spheres, world: { neighbours: ['bogus'] } } }, { spheres: { ...FILE.spheres, world: { neighbours: ['world'] } } }]) {
      expect(parseSpheres(bad)).toBeUndefined();
    }
  });
});

describe('readSpheres', () => {
  it('reads the file, and falls back to the built-in table when it is absent, unreadable, not JSON or invalid', async () => {
    expect((await readSpheres('/x/spheres.json', async () => JSON.stringify(FILE))).neighbours('world')).toEqual(['fighting']);
    expect(await readSpheres(undefined)).toBe(BUILT_IN_SPHERES);
    expect(await readSpheres('/x', async () => '{broken')).toBe(BUILT_IN_SPHERES);
    expect(await readSpheres('/x', async () => '{"spheres":{}}')).toBe(BUILT_IN_SPHERES);
    expect(
      await readSpheres('/x', async () => {
        throw new Error('ENOENT');
      }),
    ).toBe(BUILT_IN_SPHERES);
  });

  it('reads a real file from disk by default', async () => {
    const os = await import('node:os');
    const fs = await import('node:fs');
    const path = await import('node:path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-spheres-'));
    try {
      fs.writeFileSync(path.join(dir, 's.json'), JSON.stringify(FILE));
      expect((await readSpheres(path.join(dir, 's.json'))).neighbours('world')).toEqual(['fighting']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
