/**
 * Where two layers say different things about the same room or exit (walked evidence from Copilot, the community import), the LATER
 * dated record wins (edge case E9). A record with no date loses to any dated record. When both are undated, or both carry the same day,
 * the base record (the one already in the map) stays: a tie never changes anything.
 *
 * Dates are compared by calendar day (`YYYY-MM-DD`); a timestamp counts as its day. A room's date is the latest of its sources' dates and
 * its last visit; a link's is the latest of its last walk and its sources' dates.
 *
 * Which room of one layer is the same as which room of another is NOT decided here (that is a matter for a person, or a later phase): these
 * functions take two records that are already known to be the same thing.
 */

import { LIMITS, type Link, type MapSource, type Room } from '../schema.js';

export type Winner = 'base' | 'other';

function dayOf(date: string | undefined): string | undefined {
  return date === undefined || date === '' ? undefined : date.slice(0, 10);
}

/** The latest of the dates given, as a day; undefined when there is none. */
export function latestDate(...dates: (string | undefined)[]): string | undefined {
  let best: string | undefined;
  for (const date of dates) {
    const day = dayOf(date);
    if (day !== undefined && (best === undefined || day > best)) best = day;
  }
  return best;
}

export function roomDate(room: Room): string | undefined {
  const days = room.baseline?.days ?? [];
  return latestDate(...room.sources.map((s) => s.date), days[days.length - 1]);
}

export function linkDate(link: Link): string | undefined {
  return latestDate(link.lastWalked, ...(link.sources ?? []).map((s) => s.date));
}

/** E9: which record wins. The later day; any date over none; the base when it is a tie or neither has a date. */
export function newerWins(baseDate: string | undefined, otherDate: string | undefined): Winner {
  const base = dayOf(baseDate);
  const other = dayOf(otherDate);
  if (other === undefined) return 'base';
  if (base === undefined) return 'other';
  return other > base ? 'other' : 'base';
}

function unionSources(a: readonly MapSource[], b: readonly MapSource[]): MapSource[] {
  const seen = new Set<string>();
  const out: MapSource[] = [];
  for (const source of [...a, ...b]) {
    const key = JSON.stringify(source);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(source);
  }
  return out.slice(0, LIMITS.maxSources);
}

/**
 * The base room with the newer record's facts: title, sector, description and coordinates come from the winner, and a fact the winner
 * does not have is taken from the other (a newer record with no description does not erase an older one's). Identity, exits, baseline,
 * vnum and history stay the base's; the sources of both are kept.
 */
export function reconcileRoom(base: Room, other: Room): Room {
  const winner = newerWins(roomDate(base), roomDate(other)) === 'other' ? other : base;
  const loser = winner === base ? other : base;
  const merged: Room = { ...base, sources: unionSources(base.sources, other.sources) };
  merged.title = winner.title !== '' ? winner.title : loser.title;
  const sector = winner.sector ?? loser.sector;
  const description = winner.description ?? loser.description;
  const coords = winner.coords ?? loser.coords;
  if (sector !== undefined) merged.sector = sector;
  if (description !== undefined) merged.description = description;
  if (coords !== undefined) merged.coords = coords;
  return merged;
}

/**
 * Two records of the same exit (same room and direction; anything else returns the base). An exit with no known target never beats one
 * that has a target, whatever its date. The same target: the more confident record's state, the latest walk, the larger count. Different
 * targets: the newer record wins as it stands. The base's id and slot are kept so nothing that points at the link breaks.
 */
export function reconcileLink(base: Link, other: Link): Link {
  if (base.from !== other.from || base.dir !== other.dir) return base;
  const sources = unionSources(base.sources ?? [], other.sources ?? []);
  const keep = (link: Link): Link => {
    const merged: Link = { ...link, id: base.id, from: base.from, dir: base.dir };
    if (sources.length > 0) merged.sources = sources;
    return merged;
  };
  if (other.to === null) return keep(base);
  if (base.to === null) return keep(other);
  if (base.to !== other.to) return keep(newerWins(linkDate(base), linkDate(other)) === 'other' ? other : base);

  const strong = other.confidence > base.confidence ? other : base;
  const merged = keep(strong);
  merged.reverse = base.reverse || other.reverse;
  merged.traversals = Math.max(base.traversals, other.traversals);
  const walked = latestDate(base.lastWalked, other.lastWalked);
  if (walked !== undefined) merged.lastWalked = walked;
  return merged;
}
