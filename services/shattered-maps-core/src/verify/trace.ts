import type { Direction, LinkState, MapFile } from '../schema.js';
import { AzahIndex, sameSet, type MatchQuality } from './azahIndex.js';
import type { AreaCounts, Disagreement, DisagreementClass, LinkVerdict, RoomDifference, RoomVerdict, RoomVerdictRecord } from './verify.js';

/**
 * Checks Azah's map against a WALK, not against a layer built from walks. The tracer follows the player on Azah's graph: after each room
 * view it knows the set of Azah rooms the player could be in, and each move must lead to a room that fits the next view. That localizes
 * the player even among rooms that print the same text (a desert, a maze), which a layer of walked rooms cannot do without minting
 * duplicates.
 *
 * Feed it room views in order (the same call shape as the world memory, so the log replay drives both). A step is followed only inside
 * one session and only when exactly one movement command led to the view (the caller says so with `arrivalDir`).
 *
 *  - a step that lands on a room fitting the view agrees with the link it took, when the room it left is known exactly;
 *  - a step whose exit leads somewhere else disagrees (`target-differs`), when the room it left is known exactly;
 *  - a step through an exit Azah's room does not have is `azah-lacks-exit`;
 *  - a view no Azah room fits is a room Azah does not have (`unmatched`, counted by title).
 * After a step that cannot be followed the player is placed again from the view alone.
 */

export interface TraceView {
  title: string;
  description?: string;
  exits: readonly Direction[];
  /** How the game's text of the room was read. A `dark` view is a room the player cannot see: where they are is unknown. */
  text?: 'ok' | 'absent' | 'dark' | 'disagrees';
}

export interface TraceContext {
  day: string;
  session: string;
  /** The exit taken to get here, when exactly one movement command led to this view. */
  arrivalDir?: Direction;
}

export interface TraceOptions {
  prefixChars?: number;
  /** Examples kept per disagreement class (default 25). */
  samplesPerClass?: number;
  /** Most distinct unmatched titles remembered (default 20,000). */
  maxUnmatchedTitles?: number;
}

/** A set of possible rooms bigger than this is not tracked step by step (a view that fits thousands of rooms says nothing). */
const MAX_TRACKED = 20_000;
/** A view that fits this many rooms or fewer counts as an ambiguous visit of each of them. */
const MAX_AMBIGUOUS_CREDIT = 64;
/** The rooms a disagreeing link is said to lead to instead (the schema allows eight). */
const MAX_SEEN_TO = 8;

interface RoomEvidence {
  visits: number;
  cleanVisits: number;
  ambiguousVisits: number;
  differs: Set<RoomDifference>;
  quality: MatchQuality;
  firstDay: string;
  lastDay: string;
}

/** What the walk showed about one Azah link. */
export interface LinkEvidence {
  /** Steps through the link, from a room known exactly, that landed where Azah says. */
  agree: number;
  /** Steps through it that landed somewhere else. */
  disagree: number;
  /** The play day of the latest step counted. */
  lastDay: string;
  /** Azah rooms the walk reached through it instead (at most 8, only when it disagreed): the rooms the exit really led to. */
  seenTo: string[];
}

interface TraceCounters {
  views: number;
  /** Views of a room the player could not see: the position is lost. */
  dark: number;
  unmatched: number;
  localized: number;
  ambiguous: number;
  refused: number;
  steps: number;
  stepsAgree: number;
  stepsAmbiguous: number;
  stepsDisagree: number;
  stepsNoExit: number;
  relocalized: number;
}

export interface TraceReport {
  rooms: Record<string, RoomVerdictRecord>;
  links: Record<string, LinkVerdict>;
  /** The evidence behind the links that have any, by Azah link id. */
  evidence: Record<string, LinkEvidence>;
  /** Days the verified rooms were walked on, by Azah room id: the first and the last. */
  walkedOn: Record<string, { first: string; last: string }>;
  counts: TraceCounters & {
    azahRooms: number;
    azahLinks: number;
    rooms: Record<RoomVerdict, number>;
    links: Record<LinkVerdict, number>;
    disagreements: Record<DisagreementClass, number>;
  };
  byArea: Record<string, AreaCounts>;
  samples: Disagreement[];
  /** The room titles Azah and the walk disagree about most (a maze, a teleport, a room that changed), by the room the step started in. */
  disagreementTitles: { title: string; 'target-differs': number; 'azah-lacks-exit': number }[];
  /** Views no Azah room fits, by title, most often seen first (rooms Azah does not have, or rooms that changed). */
  unmatchedTitles: { title: string; count: number }[];
}

const RANK: Record<MatchQuality, number> = { title: 0, prefix: 1, exact: 2 };

export class AzahTracer {
  private readonly index: AzahIndex;
  private readonly samplesPerClass: number;
  private readonly maxUnmatchedTitles: number;
  private cands: string[] = [];
  private session: string | undefined;
  private readonly rooms = new Map<string, RoomEvidence>();
  private readonly links = new Map<string, LinkEvidence>();
  private readonly counters: TraceCounters = {
    views: 0,
    dark: 0,
    unmatched: 0,
    localized: 0,
    ambiguous: 0,
    refused: 0,
    steps: 0,
    stepsAgree: 0,
    stepsAmbiguous: 0,
    stepsDisagree: 0,
    stepsNoExit: 0,
    relocalized: 0,
  };
  private readonly classes: Record<DisagreementClass, number> = { 'target-differs': 0, 'azah-lacks-exit': 0, 'walked-conflict': 0 };
  private readonly perClass: Record<DisagreementClass, number> = { 'target-differs': 0, 'azah-lacks-exit': 0, 'walked-conflict': 0 };
  private readonly samples: Disagreement[] = [];
  private readonly unmatched = new Map<string, number>();
  private readonly disagreeTitles = new Map<string, { 'target-differs': number; 'azah-lacks-exit': number }>();

  constructor(
    azah: MapFile,
    options: TraceOptions = {},
  ) {
    this.index = new AzahIndex(azah, options.prefixChars ?? 100);
    this.samplesPerClass = options.samplesPerClass ?? 25;
    this.maxUnmatchedTitles = options.maxUnmatchedTitles ?? 20_000;
  }

  /** The room the player is in, when the walk has pinned it down to exactly one Azah room; otherwise undefined (not placed, or several rooms fit). */
  current(): { id: string; title: string } | undefined {
    if (this.cands.length !== 1) return undefined;
    const info = this.index.info(this.cands[0]);
    return { id: info.room.id, title: info.room.title };
  }

  /**
   * What the map says about leaving the current room by `dir`: how sure the map is (the link's confidence) and its state. Null when the player is
   * not placed on one room, the room has no such exit, or nobody knows where the exit leads. A map that was checked against play (see
   * `applyTrace`) has 0.95 on exits walked both ways, 0.6 walked once, 0.4 not walked, and 0 where the walk contradicted it.
   */
  exitEvidence(dir: Direction): { confidence: number; state: LinkState } | null {
    const here = this.current();
    if (here === undefined) return null;
    const linkId = this.index.info(here.id).room.exits[dir];
    const link = linkId === undefined ? undefined : this.index.links.get(linkId);
    return link === undefined || link.state === 'unknown-target' ? null : { confidence: link.confidence, state: link.state };
  }

  /** A login or a closed connection: where the player is, is not known any more. */
  endSession(): void {
    this.cands = [];
    this.session = undefined;
  }

  /** A view that could not be read: the position is lost. */
  noteRefused(): void {
    this.counters.refused += 1;
    this.cands = [];
  }

  async apply(view: TraceView, context: TraceContext): Promise<{ ok: true }> {
    this.view(view, context);
    return { ok: true };
  }

  /** A step that disagreed. (A walked conflict needs a layer of walked rooms: only `verifyAgainstWalked` can see one.) */
  private note(d: Disagreement & { class: 'target-differs' | 'azah-lacks-exit' }): void {
    this.classes[d.class] += 1;
    const entry = this.disagreeTitles.get(d.from) ?? { 'target-differs': 0, 'azah-lacks-exit': 0 };
    entry[d.class] += 1;
    this.disagreeTitles.set(d.from, entry);
    if (this.perClass[d.class] < this.samplesPerClass) {
      this.perClass[d.class] += 1;
      this.samples.push(d);
    }
  }

  private linkEvidence(id: string, day: string): LinkEvidence {
    let e = this.links.get(id);
    if (e === undefined) {
      e = { agree: 0, disagree: 0, lastDay: day, seenTo: [] };
      this.links.set(id, e);
    }
    e.lastDay = day;
    return e;
  }

  private view(view: TraceView, context: TraceContext): void {
    const index = this.index;
    const c = this.counters;
    c.views += 1;
    if (view.text === 'dark') {
      c.dark += 1;
      this.cands = [];
      this.session = context.session;
      return;
    }
    const sameSession = this.session === context.session;
    const previous = sameSession ? this.cands : [];
    this.session = context.session;

    const found = index.textMatches(view.title, view.description);
    if (found === undefined) {
      c.unmatched += 1;
      const title = view.title.trim();
      if (this.unmatched.has(title) || this.unmatched.size < this.maxUnmatchedTitles) this.unmatched.set(title, (this.unmatched.get(title) ?? 0) + 1);
      this.cands = [];
      return;
    }
    const dirs = new Set(view.exits);
    let next: string[] | undefined;
    const dir = context.arrivalDir;
    if (dir !== undefined && previous.length > 0 && previous.length <= MAX_TRACKED) {
      c.steps += 1;
      const fits = new Set(found.ids);
      const origins: string[] = [];
      const targets = new Set<string>();
      let anyExit = false;
      let wrong: string | undefined;
      for (const from of previous) {
        const to = index.target(from, dir);
        if (to === undefined) continue;
        anyExit = true;
        if (fits.has(to)) {
          origins.push(from);
          targets.add(to);
        } else wrong = to;
      }
      const known = previous.length === 1 ? previous[0] : undefined;
      if (origins.length > 0) {
        c.stepsAgree += 1;
        next = [...targets];
        if (origins.length === 1) this.linkEvidence(index.info(origins[0]).room.exits[dir] as string, context.day).agree += 1;
        else c.stepsAmbiguous += 1;
      } else if (anyExit) {
        c.relocalized += 1;
        c.stepsDisagree += 1;
        if (known !== undefined) {
          const evidence = this.linkEvidence(index.info(known).room.exits[dir] as string, context.day);
          evidence.disagree += 1;
          for (const id of index.bestByExits(found.ids, dirs))
            if (evidence.seenTo.length < MAX_SEEN_TO && !evidence.seenTo.includes(id)) evidence.seenTo.push(id);
          this.note({
            class: 'target-differs',
            azahRoom: known,
            dir,
            from: index.info(known).room.title,
            azahTo: index.info(wrong as string).room.title,
            walkedTo: view.title,
          });
        }
      } else {
        c.relocalized += 1;
        c.stepsNoExit += 1;
        if (known !== undefined) this.note({ class: 'azah-lacks-exit', azahRoom: known, dir, from: index.info(known).room.title, walkedTo: view.title });
      }
    }
    this.cands = index.bestByExits(next ?? found.ids, dirs);

    if (this.cands.length === 1) {
      c.localized += 1;
      this.visit(this.cands[0], found.quality, dirs, view, context.day);
    } else {
      c.ambiguous += 1;
      if (this.cands.length <= MAX_AMBIGUOUS_CREDIT) for (const id of this.cands) this.evidence(id, context.day).ambiguousVisits += 1;
    }
  }

  private evidence(id: string, day: string): RoomEvidence {
    let e = this.rooms.get(id);
    if (e === undefined) {
      e = { visits: 0, cleanVisits: 0, ambiguousVisits: 0, differs: new Set(), quality: 'title', firstDay: day, lastDay: day };
      this.rooms.set(id, e);
    }
    return e;
  }

  private visit(id: string, quality: MatchQuality, dirs: ReadonlySet<Direction>, view: TraceView, day: string): void {
    const e = this.evidence(id, day);
    e.visits += 1;
    e.lastDay = day;
    if (RANK[quality] > RANK[e.quality]) e.quality = quality;
    const differs: RoomDifference[] = [];
    if (quality !== 'exact' && (view.description ?? '').trim() !== '') differs.push('description');
    if (!sameSet(this.index.info(id).dirs, dirs)) differs.push('exits');
    if (differs.length === 0) e.cleanVisits += 1;
    else for (const d of differs) e.differs.add(d);
  }

  report(): TraceReport {
    const index = this.index;
    const rooms: Record<string, RoomVerdictRecord> = {};
    const walkedOn: Record<string, { first: string; last: string }> = {};
    const roomCounts: Record<RoomVerdict, number> = { verified: 0, 'verified-differs': 0, ambiguous: 0, unverified: 0 };
    const byArea: Record<string, AreaCounts> = {};
    for (const [id, info] of index.rooms) {
      const e = this.rooms.get(id);
      let record: RoomVerdictRecord;
      if (e !== undefined && e.visits > 0) {
        record = { verdict: e.cleanVisits > 0 ? 'verified' : 'verified-differs', quality: e.quality, visits: e.visits };
        if (e.cleanVisits === 0) record.differs = [...e.differs];
        walkedOn[id] = { first: e.firstDay, last: e.lastDay };
      } else record = { verdict: e !== undefined && e.ambiguousVisits > 0 ? 'ambiguous' : 'unverified' };
      rooms[id] = record;
      roomCounts[record.verdict] += 1;
      const area = (byArea[info.area] ??= { rooms: 0, verified: 0, verifiedDiffers: 0, ambiguous: 0, unverified: 0 });
      area.rooms += 1;
      if (record.verdict === 'verified') area.verified += 1;
      else if (record.verdict === 'verified-differs') area.verifiedDiffers += 1;
      else if (record.verdict === 'ambiguous') area.ambiguous += 1;
      else area.unverified += 1;
    }
    const links: Record<string, LinkVerdict> = {};
    const linkCounts: Record<LinkVerdict, number> = { agree: 0, disagree: 0, unverified: 0 };
    const evidence: Record<string, LinkEvidence> = {};
    for (const id of index.links.keys()) {
      const e = this.links.get(id);
      const verdict: LinkVerdict = e === undefined ? 'unverified' : e.agree > 0 && e.agree >= e.disagree ? 'agree' : 'disagree'; // a record exists only once one side was counted
      links[id] = verdict;
      if (e !== undefined) evidence[id] = { ...e, seenTo: [...e.seenTo] };
      linkCounts[verdict] += 1;
    }
    const unmatchedTitles = [...this.unmatched.entries()]
      .map(([title, count]) => ({ title, count }))
      .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
      .slice(0, 200);
    const disagreementTitles = [...this.disagreeTitles.entries()]
      .map(([title, n]) => ({ title, ...n }))
      .sort((a, b) => b['target-differs'] + b['azah-lacks-exit'] - (a['target-differs'] + a['azah-lacks-exit']) || a.title.localeCompare(b.title))
      .slice(0, 30);
    return {
      rooms,
      links,
      evidence,
      walkedOn,
      counts: {
        ...this.counters,
        azahRooms: index.rooms.size,
        azahLinks: index.links.size,
        rooms: roomCounts,
        links: linkCounts,
        disagreements: { ...this.classes },
      },
      byArea,
      samples: [...this.samples],
      disagreementTitles,
      unmatchedTitles,
    };
  }
}
