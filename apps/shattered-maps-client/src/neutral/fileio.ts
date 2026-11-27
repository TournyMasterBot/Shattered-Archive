import { validateMapFile, type MapFile } from '@shatteredarchive/shattered-maps-core';
import type { MapDocV1 } from '../types';

/**
 * Reading and writing the files the neutral viewer works with. Three kinds can be opened: a neutral map file (`MapFile` v1, plain or
 * gzipped, which is how the Azah candidates are stored), a DslMapper document (read through the adapter), and the review log.
 * Nothing here touches the page: the caller passes the text or the file and gets a typed result or the reasons it was refused.
 */

export type Opened =
  | { kind: 'map'; map: MapFile }
  | { kind: 'legacy'; doc: MapDocV1 }
  | { kind: 'refused'; errors: string[] };

/** Decides what a parsed JSON document is. A map file is validated strictly; a legacy document needs only its two parts. */
export function classify(parsed: unknown): Opened {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return { kind: 'refused', errors: ['The file is not a map: it is not a JSON object.'] };
  const o = parsed as Record<string, unknown>;
  if (o.version !== undefined || o.continents !== undefined || o.links !== undefined) {
    const verdict = validateMapFile(parsed);
    return verdict.ok ? { kind: 'map', map: verdict.map } : { kind: 'refused', errors: verdict.errors.map((e) => `Not a valid map file: ${e}`) };
  }
  if (typeof o.meta === 'object' && o.meta !== null && typeof o.rooms === 'object' && o.rooms !== null && !Array.isArray(o.rooms)) {
    return { kind: 'legacy', doc: parsed as MapDocV1 };
  }
  return { kind: 'refused', errors: ['The file is neither a map file (version, continents, links) nor a DslMapper document (meta, rooms).'] };
}

export function openText(text: string): Opened {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { kind: 'refused', errors: ['The file is not valid JSON.'] };
  }
  return classify(parsed);
}

/** What a browser file offers that this needs (a `File` has it; tests pass a small stand-in). */
export interface FileLike {
  name: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface Gunzip {
  (bytes: Uint8Array): Promise<Uint8Array>;
}

/** Gunzip with the browser's own `DecompressionStream`; `null` where the browser has none. */
export const browserGunzip: Gunzip | null =
  typeof DecompressionStream === 'undefined'
    ? null
    : async (bytes) => {
        const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
        return new Uint8Array(await new Response(stream).arrayBuffer());
      };

const GZIP_MAGIC = [0x1f, 0x8b];

/** The file's text. A gzip file is recognised by its first two bytes, not by its name. */
export async function readFileText(file: FileLike, gunzip: Gunzip | null = browserGunzip): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const zipped = bytes.length >= 2 && bytes[0] === GZIP_MAGIC[0] && bytes[1] === GZIP_MAGIC[1];
  if (!zipped) return new TextDecoder().decode(bytes);
  if (!gunzip) throw new Error('This browser cannot read gzip files (no DecompressionStream). Unpack the file and open the .json.');
  return new TextDecoder().decode(await gunzip(bytes));
}

export async function openFile(file: FileLike, gunzip: Gunzip | null = browserGunzip): Promise<Opened> {
  try {
    return openText(await readFileText(file, gunzip));
  } catch (error) {
    return { kind: 'refused', errors: [error instanceof Error ? error.message : 'The file could not be read.'] };
  }
}

/** Offers `text` as a download. The only function here that touches the page. */
export function downloadText(name: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
