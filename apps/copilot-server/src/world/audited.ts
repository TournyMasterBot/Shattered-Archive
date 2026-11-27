import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { AzahTracer, mergeSlices, normalizeTitle, validateMapFile, type MapFile } from '@shatteredarchive/shattered-maps-core';
import { commandDirection } from './direction.js';

/**
 * The audited map of the DSL (Azah's map checked against play, built by `build-audited.mjs` and published into a private folder) as live
 * evidence for a movement command: Copilot follows the walk on that map (`AzahTracer`) and, when it knows the room exactly, takes the map's
 * confidence for the exit the command uses (0.95 walked both ways, 0.6 walked once, 0.4 in the community map and not walked, 0 contradicted).
 *
 * Only the DSL has such a map. The tracer is given only DSL views (`WorldRouter`): a Simulacrum room must never be placed on it.
 */

/** The audited layer in `folder` as one map, or undefined when there is none (no folder, no manifest, a manifest that is not an audited one). */
export async function loadAuditedLayer(folder: string): Promise<MapFile | undefined> {
  let manifest: { status?: unknown };
  try {
    manifest = JSON.parse(await readFile(path.join(folder, 'manifest.json'), 'utf8')) as typeof manifest;
  } catch {
    return undefined;
  }
  if (manifest.status !== 'audited') return undefined;
  const slices: MapFile[] = [];
  for (const name of (await readdir(folder)).filter((n) => n.endsWith('.json.gz')).sort()) {
    const checked = validateMapFile(JSON.parse(gunzipSync(await readFile(path.join(folder, name))).toString('utf8')));
    if (!checked.ok) throw new Error(`${name} is not a valid map: ${checked.errors.slice(0, 2).join('; ')}`);
    slices.push(checked.map);
  }
  return slices.length === 0 ? undefined : mergeSlices(slices);
}

export interface AuditedEvidence {
  /** Receives the DSL's room views. */
  tracer: AzahTracer;
  /** The map's confidence for taking `command` out of the room called `roomTitle`, or null when it cannot say. Same contract as `WorldMemory.edgeEvidence`. */
  edgeEvidence(roomTitle: string | undefined, command: string): number | null;
}

export function createAuditedEvidence(map: MapFile): AuditedEvidence {
  const tracer = new AzahTracer(map);
  return {
    tracer,
    edgeEvidence(roomTitle, command) {
      const dir = commandDirection(command);
      const here = tracer.current();
      if (dir === undefined || roomTitle === undefined || here === undefined || normalizeTitle(here.title) !== normalizeTitle(roomTitle)) return null;
      return tracer.exitEvidence(dir)?.confidence ?? null;
    },
  };
}

/**
 * Two sources of evidence for one exit: the walked memory and the audited map. A contradiction (0) from either wins, because a suggestion
 * must not walk into an exit someone has seen lead elsewhere; otherwise the surer one counts; null only when neither can say.
 */
export function mergeEvidence(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return a === 0 || b === 0 ? 0 : Math.max(a, b);
}

/** The shape of every source of evidence for an exit: the room's title and the command, a confidence or null. */
export type EdgeEvidence = (roomTitle: string | undefined, command: string) => number | null;

/** The source that never knows anything (a world with no audited map). */
export const noEvidence: EdgeEvidence = () => null;

/** Asks every source and merges their answers (`mergeEvidence`): a contradiction wins, otherwise the surest; null only when none can say. */
export function combineEvidence(sources: readonly EdgeEvidence[]): EdgeEvidence {
  return (roomTitle, command) => sources.reduce<number | null>((answer, source) => mergeEvidence(answer, source(roomTitle, command)), null);
}
