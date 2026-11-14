import { exportMerc, type MapFile, type MercExportResult } from '@shatteredarchive/shattered-maps-core';
import type { Focus } from './zoom';

/**
 * The Builder export as the panel uses it: the form's values in, the core's result out, and the request body the Builder's import
 * takes. The Mapper never calls the Builder: the file is downloaded and imported in the Builder itself (its page is signed in, the
 * Mapper's is not, and the Mapper's page rules allow no other origin). The Builder's quarantine report, and the commit, stay there.
 */

export const EXPORT_KEY = 'shatteredmaps.export';

export interface ExportForm {
  fileName: string;
  /** The text of the number boxes: whatever was typed, checked when the export is made. */
  first: string;
  last: string;
}

export const DEFAULT_FIRST = 30000;

/** `gate_road.are` from an id such as `area:gate road`: letters, digits, `_` and `-` only. */
export function defaultFileName(id: string): string {
  const stem = id.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  return `${stem === '' ? 'area' : stem.slice(0, 40)}.are`;
}

export function defaultForm(id: string, rooms: number): ExportForm {
  return { fileName: defaultFileName(id), first: String(DEFAULT_FIRST), last: String(DEFAULT_FIRST + Math.max(99, rooms * 2)) };
}

/** What a number box holds: a whole number, or `NaN` (which the export refuses with a reason). */
function whole(text: string): number {
  return /^\s*\d+\s*$/.test(text) ? Number(text) : Number.NaN;
}

/** The export of the focused area or subzone, or `null` when the focus is not one of those. */
export function makeExport(map: MapFile, focus: Focus | null, form: ExportForm): MercExportResult | null {
  if (!focus || (focus.level !== 'area' && focus.level !== 'subzone')) return null;
  return exportMerc(map, {
    level: focus.level,
    id: focus.id,
    fileName: form.fileName.trim(),
    vnumRange: { min: whole(form.first), max: whole(form.last) },
  });
}

/** The body the Builder's import routes take: `{ file, text }`. */
export function requestBody(fileName: string, text: string): string {
  return JSON.stringify({ file: fileName.trim(), text });
}

/** The form last used, or the default for this id when nothing valid is saved. */
export function loadForm(id: string, rooms: number, storage: Pick<Storage, 'getItem'> = localStorage): ExportForm {
  const fallback = defaultForm(id, rooms);
  try {
    const raw = storage.getItem(EXPORT_KEY);
    const saved = raw ? (JSON.parse(raw) as Partial<Record<'first' | 'last', unknown>>) : {};
    return {
      fileName: fallback.fileName,
      first: typeof saved.first === 'string' && /^\d{1,5}$/.test(saved.first) ? saved.first : fallback.first,
      last: typeof saved.last === 'string' && /^\d{1,5}$/.test(saved.last) ? saved.last : fallback.last,
    };
  } catch {
    return fallback;
  }
}

/** Remember the number range for next time (the file name follows the area, so it is not kept). A refused write is ignored. */
export function saveRange(form: ExportForm, storage: Pick<Storage, 'setItem'> = localStorage): void {
  try {
    storage.setItem(EXPORT_KEY, JSON.stringify({ first: form.first, last: form.last }));
  } catch {
    // the browser would not keep it: the range is typed again next time
  }
}
