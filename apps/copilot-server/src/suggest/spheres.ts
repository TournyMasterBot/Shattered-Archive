import { readFile } from 'node:fs/promises';
import { SPHERES, isSphere, type Sphere } from '@shatteredarchive/copilot-core';

/** Which spheres lie next to each other: where to look when the first sphere finds nothing, and what a misroute usually means. */
export interface SphereTable {
  neighbours(sphere: Sphere): readonly Sphere[];
  misrouteHint(from: Sphere, to: Sphere): string | undefined;
}

/**
 * The built-in table, used when the Shattered-AI `spheres.json` is absent. It is the same neighbours as that file (world next to fighting and
 * interaction, fighting next to things and interaction, things next to interaction), without its hints; the file wins when present.
 */
const NEIGHBOURS: Record<Sphere, readonly Sphere[]> = {
  world: ['fighting', 'interaction'],
  fighting: ['world', 'things', 'interaction'],
  things: ['fighting', 'interaction'],
  interaction: ['things', 'world', 'fighting'],
};

export const BUILT_IN_SPHERES: SphereTable = {
  neighbours: (sphere) => NEIGHBOURS[sphere],
  misrouteHint: () => undefined,
};

/**
 * Read the table from the Shattered-AI `spheres.json`: `{ "spheres": { "<sphere>": { "neighbours": ["<sphere>", ...],
 * "misrouteHint": { "<sphere>": "text" } } } }`. All four spheres must be present and every neighbour must be a sphere other than
 * itself; anything else gives undefined and the caller keeps the built-in table.
 */
export function parseSpheres(json: unknown): SphereTable | undefined {
  if (typeof json !== 'object' || json === null) return undefined;
  const spheres = (json as { spheres?: unknown }).spheres;
  if (typeof spheres !== 'object' || spheres === null) return undefined;

  const neighbours = {} as Record<Sphere, Sphere[]>;
  const hints = new Map<string, string>();
  for (const sphere of SPHERES) {
    const entry = (spheres as Record<string, unknown>)[sphere];
    if (typeof entry !== 'object' || entry === null) return undefined;
    const list = (entry as { neighbours?: unknown }).neighbours;
    if (!Array.isArray(list) || !list.every((n) => isSphere(n) && n !== sphere)) return undefined;
    neighbours[sphere] = list as Sphere[];
    const hintMap = (entry as { misrouteHint?: unknown }).misrouteHint;
    if (typeof hintMap === 'object' && hintMap !== null) {
      for (const [to, text] of Object.entries(hintMap)) if (isSphere(to) && typeof text === 'string') hints.set(`${sphere}>${to}`, text);
    }
  }
  return { neighbours: (sphere) => neighbours[sphere], misrouteHint: (from, to) => hints.get(`${from}>${to}`) };
}

/** Read the file, or fall back to the built-in table when it is absent, unreadable or invalid. Never throws. */
export async function readSpheres(file: string | undefined, read: (path: string) => Promise<string> = (p) => readFile(p, 'utf8')): Promise<SphereTable> {
  if (file === undefined) return BUILT_IN_SPHERES;
  try {
    return parseSpheres(JSON.parse(await read(file))) ?? BUILT_IN_SPHERES;
  } catch {
    return BUILT_IN_SPHERES;
  }
}
