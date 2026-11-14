import type { WorldArea, WorldRoom } from './worldApi';

const RANGE = /^(\d+)\s*-\s*(\d+)$/;
const NUMBER = /^\d+$/;

/**
 * Areas whose name or file contains the query, or whose vnum range holds it: a number is an exact vnum, `a-b` is a range (any overlap).
 * An empty query keeps every area. The order is the input's.
 */
export function filterAreas(areas: readonly WorldArea[], query: string): WorldArea[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [...areas];
  const range = RANGE.exec(q);
  const [lo, hi] = range ? [Math.min(Number(range[1]), Number(range[2])), Math.max(Number(range[1]), Number(range[2]))] : NUMBER.test(q) ? [Number(q), Number(q)] : [];
  return areas.filter((a) => {
    if (lo !== undefined && hi !== undefined && a.minVnum !== undefined && a.maxVnum !== undefined && a.minVnum <= hi && a.maxVnum >= lo) return true;
    return (a.name ?? '').toLowerCase().includes(q) || a.file.toLowerCase().includes(q);
  });
}

/**
 * Rooms by vnum or name: a number matches the vnums that start with it (so an exact vnum is included), `a-b` is an inclusive range, and
 * anything else is a case-insensitive part of the name. A number also matches names that contain it. The order is the input's.
 */
export function filterRooms(rooms: readonly WorldRoom[], query: string): WorldRoom[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [...rooms];
  const range = RANGE.exec(q);
  if (range) {
    const lo = Math.min(Number(range[1]), Number(range[2]));
    const hi = Math.max(Number(range[1]), Number(range[2]));
    return rooms.filter((r) => r.vnum >= lo && r.vnum <= hi);
  }
  const numeric = NUMBER.test(q);
  return rooms.filter((r) => (numeric && String(r.vnum).startsWith(q)) || r.name.toLowerCase().includes(q));
}

/** "Loaded 14:03:07" for the refresh line of the picker. */
export function describeFetch(at: number): string {
  return `Loaded ${new Date(at).toLocaleTimeString([], { hour12: false })}`;
}
