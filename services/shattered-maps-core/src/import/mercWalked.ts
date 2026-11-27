/**
 * What was really walked in the Simulacrum, laid over the map the area files give.
 *
 * The files are the authority for what exists; the walked layer (Copilot's own replay of the game-server logs, world `sandbox`) is evidence
 * that the running game still behaves like its files. This module never adds a room or a link to the file map and never removes one: it
 * adds the walks (traversal counts, the date of the last walk, "walked there and back") to links the files already hold, and REPORTS every
 * place where the two disagree, because a walked room the files do not know, or an exit the game showed and the files lack, means the
 * files and the running game have drifted apart (or the replay matched wrongly).
 *
 * Matching. A walked room is matched to a file room by its title; when several file rooms share the title, by the exits the walk saw (every
 * walked door must exist on the file room). Exactly one candidate is a match; none is `unmatched`; several is `ambiguous` and is never
 * guessed. Only walked links that lead somewhere (state is not `unknown-target`) between two matched rooms are compared.
 *
 * Pure: two maps in, a changed copy and a report out.
 */

import { normalizeTitle } from '../identity.js';
import { cloneJson, DIRECTIONS, LIMITS, type Link, type MapFile, type MapSource, type Room } from '../schema.js';

export const WALKED_REPORT_CAP = 50;

export interface WalkedDisagreement {
  /** The file room's game number and the direction. */
  vnum: number;
  dir: string;
  /** What the walk found: the game number it arrived at. */
  walkedTo: number;
  /** What the files say (a game number), or `none` when the files have no such exit. */
  filesSay: number | 'none';
}

export interface WalkedReconciliation {
  walkedRooms: number;
  matched: number;
  ambiguous: number;
  unmatched: number;
  /** Titles of walked rooms that no file room has (capped; the count is complete). */
  unmatchedTitles: string[];
  walkedLinks: number;
  agree: number;
  disagree: number;
  disagreements: WalkedDisagreement[];
  /** File links that gained walked evidence. */
  confirmedLinks: number;
}

export interface WalkedResult {
  map: MapFile;
  report: WalkedReconciliation;
}

function roomsOf(map: MapFile): Room[] {
  return map.continents.flatMap((c) => c.areas.flatMap((a) => a.subzones.flatMap((s) => s.rooms)));
}

export function reconcileWalked(base: MapFile, walked: MapFile): WalkedResult {
  const out = cloneJson(base);
  const baseRooms = roomsOf(out).filter((r) => r.aliasOf === undefined);
  const byTitle = new Map<string, Room[]>();
  for (const room of baseRooms) {
    const key = normalizeTitle(room.title);
    (byTitle.get(key) ?? byTitle.set(key, []).get(key)!).push(room);
  }
  const baseLinks = new Map(out.links.map((l) => [l.id, l]));
  const report: WalkedReconciliation = {
    walkedRooms: 0,
    matched: 0,
    ambiguous: 0,
    unmatched: 0,
    unmatchedTitles: [],
    walkedLinks: 0,
    agree: 0,
    disagree: 0,
    disagreements: [],
    confirmedLinks: 0,
  };

  // 1. match rooms
  const walkedRooms = roomsOf(walked).filter((r) => r.aliasOf === undefined);
  const match = new Map<string, Room>();
  for (const room of walkedRooms) {
    report.walkedRooms += 1;
    let candidates = byTitle.get(normalizeTitle(room.title)) ?? [];
    if (candidates.length > 1) {
      const doors = DIRECTIONS.filter((d) => room.exits[d] !== undefined);
      candidates = candidates.filter((c) => doors.every((d) => c.exits[d] !== undefined));
    }
    if (candidates.length === 1) {
      match.set(room.id, candidates[0]);
      report.matched += 1;
    } else if (candidates.length === 0) {
      report.unmatched += 1;
      if (report.unmatchedTitles.length < WALKED_REPORT_CAP) report.unmatchedTitles.push(room.title);
    } else report.ambiguous += 1;
  }

  // 2. compare the links that lead somewhere
  const confirmed = new Set<string>();
  for (const link of walked.links) {
    if (link.state === 'unknown-target' || link.to === null) continue;
    const from = match.get(link.from);
    const to = match.get(link.to);
    if (from === undefined || to === undefined) continue;
    report.walkedLinks += 1;
    const ours = from.exits[link.dir] === undefined ? undefined : baseLinks.get(from.exits[link.dir] as string);
    if (ours !== undefined && ours.to === to.id) {
      report.agree += 1;
      addWalk(ours, link);
      confirmed.add(ours.id);
    } else {
      report.disagree += 1;
      if (report.disagreements.length < WALKED_REPORT_CAP)
        report.disagreements.push({
          vnum: from.vnum as number,
          dir: link.dir,
          walkedTo: to.vnum as number,
          filesSay: ours === undefined ? 'none' : Number((ours.to as string).replace(/^mr/, '')),
        });
    }
  }
  report.confirmedLinks = confirmed.size;
  return { map: out, report };
}

/** The walk's evidence on a link the files hold: counts add up, the later date wins, and "came back" sticks. */
function addWalk(ours: Link, walked: Link): void {
  ours.traversals = Math.min(LIMITS.maxTraversals, ours.traversals + walked.traversals);
  ours.reverse = ours.reverse || walked.reverse;
  if (walked.lastWalked !== undefined && (ours.lastWalked === undefined || walked.lastWalked > ours.lastWalked)) ours.lastWalked = walked.lastWalked;
  // every link of a file map carries its source, so there is room for one more
  const sources = ours.sources as MapSource[];
  if (!sources.some((s) => s.kind === 'walked')) sources.push({ kind: 'walked', ...(walked.lastWalked === undefined ? {} : { date: walked.lastWalked }) });
}
