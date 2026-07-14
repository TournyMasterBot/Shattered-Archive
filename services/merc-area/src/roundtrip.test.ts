import fs from 'fs';
import path from 'path';

import { parseAreaFile } from './parse.js';
import { emitAreaFile } from './emit.js';

// Jest runs with cwd = package root (pnpm --filter / local jest.config.cjs).
const here = path.resolve('src');

/**
 * The core guarantee of this library: for any file db.c can boot,
 *   parse(emit(parse(text))) deep-equals parse(text)   (semantic round trip)
 * and
 *   emit(parse(emit(model))) === emit(model)           (emission is stable).
 */
function assertRoundTrip(name: string, text: string): void {
  const first = parseAreaFile(text);
  const emitted = emitAreaFile(first);
  let second;
  try {
    second = parseAreaFile(emitted);
  } catch (e) {
    throw new Error(`${name}: emitted output failed to re-parse: ${(e as Error).message}`);
  }
  expect(second).toEqual(first);
  expect(emitAreaFile(second)).toBe(emitted);
}

describe('round trip on fixtures', () => {
  for (const name of ['limbo.are', 'midgaard.are']) {
    it(`round-trips ${name}`, () => {
      assertRoundTrip(name, fs.readFileSync(path.join(here, '__fixtures__', name), 'utf8'));
    });
  }
});

describe('round trip over the merc-mud corpus', () => {
  const mercPath = process.env.MERC_MUD_PATH ?? 'C:/Projects/merc-mud';
  const areaDir = path.join(mercPath, '2.4', 'area');
  const available = fs.existsSync(path.join(areaDir, 'area.lst'));

  (available ? it : it.skip)('round-trips every file listed in area.lst', () => {
    const listed = fs
      .readFileSync(path.join(areaDir, 'area.lst'), 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && l !== '$');

    const failures: string[] = [];
    for (const file of listed) {
      try {
        assertRoundTrip(file, fs.readFileSync(path.join(areaDir, file), 'utf8'));
      } catch (e) {
        failures.push(`${file}: ${(e as Error).message}`);
      }
    }
    expect(failures).toEqual([]);
  });
});
