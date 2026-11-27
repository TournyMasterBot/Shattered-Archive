import { normalizeTitle } from '../identity.js';
import { DIRECTIONS, type Direction, type MapFile, type Room } from '../schema.js';
import { AzahIndex, dirsOf, normText, roomsOf, sameSet, type AzahRoomInfo, type MatchQuality } from './azahIndex.js';

export type { MatchQuality } from './azahIndex.js';

/**
 * Checks a community map (Azah's, imported as candidates) against walked evidence (the owner's own play, replayed into the walked layer).
 * Pure: two `MapFile`s in, a report out.
 *
 * Rooms are never identified by title alone (titles repeat across the world). A walked room is tied to Azah rooms by title AND description
 * (exact, then the first characters, then title only when the walked room has no description), narrowed by the exit set, then by what its
 * neighbours say (a room whose exit to `x` leads where Azah says it leads), repeated until nothing changes. A walked room that still fits
 * several Azah rooms is `ambiguous` and proves nothing; it is never guessed.
 */

export type RoomVerdict = 'verified' | 'verified-differs' | 'ambiguous' | 'unverified';
export type LinkVerdict = 'agree' | 'disagree' | 'unverified';

/** Why a walked room and its Azah room are not the same on every point. */
export type RoomDifference = 'description' | 'exits';

export type DisagreementClass =
  /** Both rooms are tied uniquely, and the same exit leads to different rooms in the two maps. */
  | 'target-differs'
  /** The walk found an exit that Azah's room does not have. */
  | 'azah-lacks-exit'
  /** The walk saw the same exit lead to different places (a maze, a teleport or a changing room). */
  | 'walked-conflict';

export interface RoomVerdictRecord {
  verdict: RoomVerdict;
  /** How the (unique) walked room was tied to this room. */
  quality?: MatchQuality;
  /** What differs between the walked room and this one. Empty for `verified`. */
  differs?: RoomDifference[];
  /** The walked room's visits, summed over the walked rooms tied to this one. */
  visits?: number;
}

export interface Disagreement {
  class: DisagreementClass;
  /** Azah's room (`undefined` for a walked conflict that is not tied to one). */
  azahRoom?: string;
  dir: Direction;
  /** Titles are game text, never player data. */
  from: string;
  azahTo?: string;
  walkedTo?: string;
}

export interface AreaCounts {
  rooms: number;
  verified: number;
  verifiedDiffers: number;
  ambiguous: number;
  unverified: number;
}

export interface VerifyReport {
  /** By Azah room id. */
  rooms: Record<string, RoomVerdictRecord>;
  /** By Azah link id. */
  links: Record<string, LinkVerdict>;
  /** Walked room id -> the one Azah room it is tied to. */
  walkedToAzah: Record<string, string>;
  counts: {
    azahRooms: number;
    azahLinks: number;
    walkedRooms: number;
    walkedLinks: number;
    rooms: Record<RoomVerdict, number>;
    links: Record<LinkVerdict, number>;
    /** Walked rooms tied to no Azah room, to exactly one, and to several. */
    walkedUnmatched: number;
    walkedUnique: number;
    walkedAmbiguous: number;
    /** Walked rooms with no description (they can only be tied by title, so they mostly stay ambiguous). */
    walkedWithoutDescription: number;
    /** Walked rooms by how they were tied (unique ones only). */
    quality: Record<MatchQuality, number>;
    disagreements: Record<DisagreementClass, number>;
  };
  byArea: Record<string, AreaCounts>;
  /** The first examples of each class (capped), for the report and the lessons. */
  samples: Disagreement[];
}

export interface VerifyOptions {
  /** How many normalized characters of the description make the "prefix" key (default 100). */
  prefixChars?: number;
  /** Rounds of neighbour narrowing (default 6). */
  maxPasses?: number;
  /** Examples kept per disagreement class (default 25). */
  samplesPerClass?: number;
}

interface WalkedRoom {
  room: Room;
  title: string;
  desc: string;
  dirs: Set<Direction>;
  visits: number;
}

export function verifyAgainstWalked(azah: MapFile, walked: MapFile, options: VerifyOptions = {}): VerifyReport {
  const prefixChars = options.prefixChars ?? 100;
  const maxPasses = options.maxPasses ?? 6;
  const samplesPerClass = options.samplesPerClass ?? 25;

  // ---- Azah ----------------------------------------------------------------------------------------------------------------------
  const index = new AzahIndex(azah, prefixChars);
  const azahRooms = index.rooms;
  const azahLinks = index.links;
  const azahTarget = (id: string, dir: Direction): string | undefined => index.target(id, dir);

  // ---- walked --------------------------------------------------------------------------------------------------------------------
  const walkedRooms = new Map<string, WalkedRoom>();
  const aliases = new Map<string, string>();
  for (const { room } of roomsOf(walked)) {
    if (room.aliasOf !== undefined) {
      aliases.set(room.id, room.aliasOf);
      continue;
    }
    walkedRooms.set(room.id, {
      room,
      title: normalizeTitle(room.title),
      desc: normText(room.description),
      dirs: dirsOf(room),
      visits: room.baseline?.visits ?? 0,
    });
  }
  const resolve = (id: string): string => {
    let at = id;
    for (let i = 0; i < 16 && aliases.has(at); i += 1) at = aliases.get(at) as string;
    return at;
  };
  const walkedLinks = new Map(walked.links.map((l) => [l.id, l]));
  /** A walked room's exits whose far end is known: dir -> the walked room (alias resolved). */
  const walkedOut = new Map<string, { dir: Direction; to: string; state: string }[]>();
  let walkedLinkCount = 0;
  for (const [id, w] of walkedRooms) {
    const out: { dir: Direction; to: string; state: string }[] = [];
    for (const dir of DIRECTIONS) {
      const linkId = w.room.exits[dir];
      const link = linkId === undefined ? undefined : walkedLinks.get(linkId);
      if (link === undefined) continue;
      walkedLinkCount += 1;
      if (link.to !== null) {
        const to = resolve(link.to);
        if (walkedRooms.has(to)) out.push({ dir, to, state: link.state });
      }
    }
    walkedOut.set(id, out);
  }

  // ---- 1. candidates by text, 2. narrowed by the exit set -------------------------------------------------------------------------
  const cands = new Map<string, string[]>();
  const quality = new Map<string, MatchQuality>();
  let withoutDescription = 0;
  for (const [id, w] of walkedRooms) {
    if (w.desc === '') withoutDescription += 1;
    const found = index.textMatches(w.room.title, w.room.description);
    if (found === undefined) continue;
    cands.set(id, index.bestByExits(found.ids, w.dirs));
    quality.set(id, found.quality);
  }

  // ---- 3. neighbours narrow what is still ambiguous ------------------------------------------------------------------------------
  for (let pass = 0; pass < maxPasses; pass += 1) {
    let changed = false;
    for (const [id, own] of cands) {
      if (own.length < 2) continue;
      const out = walkedOut.get(id) as { dir: Direction; to: string; state: string }[];
      const score = (aid: string): number => {
        let s = 0;
        for (const { dir, to } of out) {
          const far = cands.get(to);
          const target = azahTarget(aid, dir);
          if (far === undefined || target === undefined) continue;
          s += far.includes(target) ? 1 : -1;
        }
        return s;
      };
      const scores = own.map(score);
      const top = Math.max(...scores);
      const kept = own.filter((_, i) => scores[i] === top);
      if (kept.length < own.length) {
        cands.set(id, kept);
        changed = true;
      }
    }
    if (!changed) break;
  }

  // ---- 4. verdicts ---------------------------------------------------------------------------------------------------------------
  const walkedToAzah: Record<string, string> = {};
  const rooms: Record<string, RoomVerdictRecord> = {};
  const maybe = new Set<string>();
  let unmatched = 0;
  let unique = 0;
  let ambiguousWalked = 0;
  const qualityCounts: Record<MatchQuality, number> = { exact: 0, prefix: 0, title: 0 };
  for (const [id, w] of walkedRooms) {
    const own = cands.get(id);
    if (own === undefined) {
      unmatched += 1;
      continue;
    }
    if (own.length > 1) {
      ambiguousWalked += 1;
      for (const aid of own) maybe.add(aid);
      continue;
    }
    unique += 1;
    const aid = own[0];
    const q = quality.get(id) as MatchQuality;
    qualityCounts[q] += 1;
    walkedToAzah[id] = aid;
    const a = azahRooms.get(aid) as AzahRoomInfo;
    const differs: RoomDifference[] = [];
    if (q !== 'exact' && w.desc !== '') differs.push('description');
    if (!sameSet(a.dirs, w.dirs)) differs.push('exits');
    // a title-only tie says little about the description (the walked room has none): the room is verified only on its position and exits
    const previous = rooms[aid];
    const merged: RoomVerdictRecord = {
      verdict: differs.length === 0 ? 'verified' : 'verified-differs',
      quality: previous?.quality === 'exact' || q === 'exact' ? 'exact' : q,
      visits: (previous?.visits ?? 0) + w.visits,
    };
    if (differs.length > 0) merged.differs = differs;
    // two walked rooms can tie to one Azah room: the better one counts (a clean one beats a differing one)
    if (previous === undefined || (previous.verdict === 'verified-differs' && merged.verdict === 'verified')) rooms[aid] = merged;
    else previous.visits = merged.visits;
  }
  for (const aid of azahRooms.keys()) {
    if (rooms[aid] === undefined) rooms[aid] = { verdict: maybe.has(aid) ? 'ambiguous' : 'unverified' };
  }

  // ---- links ---------------------------------------------------------------------------------------------------------------------
  const links: Record<string, LinkVerdict> = {};
  const classes: Record<DisagreementClass, number> = { 'target-differs': 0, 'azah-lacks-exit': 0, 'walked-conflict': 0 };
  const perClass: Record<DisagreementClass, number> = { 'target-differs': 0, 'azah-lacks-exit': 0, 'walked-conflict': 0 };
  const samples: Disagreement[] = [];
  const note = (d: Disagreement): void => {
    classes[d.class] += 1;
    if (perClass[d.class] < samplesPerClass) {
      perClass[d.class] += 1;
      samples.push(d);
    }
  };
  for (const [id, out] of walkedOut) {
    const w = walkedRooms.get(id) as WalkedRoom;
    const from = walkedToAzah[id];
    for (const dir of DIRECTIONS) {
      const linkId = w.room.exits[dir];
      const link = linkId === undefined ? undefined : walkedLinks.get(linkId);
      if (link?.state === 'conflict') note({ class: 'walked-conflict', dir, from: w.room.title, ...(from === undefined ? {} : { azahRoom: from }) });
    }
    if (from === undefined) continue;
    for (const { dir, to } of out) {
      const target = walkedToAzah[to];
      if (target === undefined) continue;
      const azahLinkId = (azahRooms.get(from) as AzahRoomInfo).room.exits[dir];
      const azahLink = azahLinkId === undefined ? undefined : azahLinks.get(azahLinkId);
      if (azahLink === undefined) {
        note({ class: 'azah-lacks-exit', azahRoom: from, dir, from: w.room.title, walkedTo: (azahRooms.get(target) as AzahRoomInfo).room.title });
      } else if (azahLink.to === target) {
        links[azahLink.id] = 'agree';
      } else {
        // a link already shown to agree (the same exit walked from a second walked room) stays agreed
        if (links[azahLink.id] !== 'agree') links[azahLink.id] = 'disagree';
        const azahTo = azahLink.to === null ? undefined : azahRooms.get(azahLink.to)?.room.title;
        note({
          class: 'target-differs',
          azahRoom: from,
          dir,
          from: w.room.title,
          ...(azahTo === undefined ? {} : { azahTo }),
          walkedTo: (azahRooms.get(target) as AzahRoomInfo).room.title,
        });
      }
    }
  }
  const linkCounts: Record<LinkVerdict, number> = { agree: 0, disagree: 0, unverified: 0 };
  for (const id of azahLinks.keys()) {
    links[id] ??= 'unverified';
    linkCounts[links[id]] += 1;
  }

  const roomCounts: Record<RoomVerdict, number> = { verified: 0, 'verified-differs': 0, ambiguous: 0, unverified: 0 };
  const byArea: Record<string, AreaCounts> = {};
  for (const [aid, a] of azahRooms) {
    const verdict = (rooms[aid] as RoomVerdictRecord).verdict;
    roomCounts[verdict] += 1;
    const counts = (byArea[a.area] ??= { rooms: 0, verified: 0, verifiedDiffers: 0, ambiguous: 0, unverified: 0 });
    counts.rooms += 1;
    if (verdict === 'verified') counts.verified += 1;
    else if (verdict === 'verified-differs') counts.verifiedDiffers += 1;
    else if (verdict === 'ambiguous') counts.ambiguous += 1;
    else counts.unverified += 1;
  }

  return {
    rooms,
    links,
    walkedToAzah,
    counts: {
      azahRooms: azahRooms.size,
      azahLinks: azahLinks.size,
      walkedRooms: walkedRooms.size,
      walkedLinks: walkedLinkCount,
      rooms: roomCounts,
      links: linkCounts,
      walkedUnmatched: unmatched,
      walkedUnique: unique,
      walkedAmbiguous: ambiguousWalked,
      walkedWithoutDescription: withoutDescription,
      quality: qualityCounts,
      disagreements: classes,
    },
    byArea,
    samples,
  };
}
