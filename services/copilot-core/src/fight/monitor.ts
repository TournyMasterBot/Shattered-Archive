/**
 * Follows a fight as it happens and says where it is going, without a model.
 *
 * A model takes seconds to answer and the game moves every three seconds (`merc.h`: `PULSE_VIOLENCE` is 3 * `PULSE_PER_SECOND`, four pulses a
 * second, so a round is 3 s), so by the time a model has read a fight the fight has moved on. This monitor reads the same game text a player
 * reads (blows, the opponent's condition, the character's own hit points) and keeps the numbers a player would keep in their head: how fast each
 * side is losing hit points, how many rounds until one side is dead, and whether to keep fighting, finish it, or flee. `snapshot(now)` also
 * PROJECTS the fight forward to the time of the question, so a consumer that is a few rounds behind is told where the fight probably is now.
 *
 * What it cannot know it does not invent: the game shows no damage numbers, only a verb per blow (a range of damage, `damage.ts`) and a
 * sentence for the opponent's condition (a range of percent, `condition.ts`), so rates are estimates from the middle of those ranges and the
 * snapshot says when it has too little to trust them (`reliable`). The character's own hit points are exact when a `vitals` event gives them.
 *
 * Pure: events in, snapshots out; the clock is the events' own time and the `now` it is asked about.
 */

import { stripAnsi } from '../color/ansi.js';
import type { FeedEvent } from '../log/reducer.js';
import { midPct, parseConditionLine, type Condition } from './condition.js';
import { midDamage, parseBlowLine } from './damage.js';

/** One round of a fight in milliseconds (`PULSE_VIOLENCE`: 3 * 4 pulses at four a second). */
export const ROUND_MS = 3000;
/** Below this share of its own hit points the character should leave (the game's own wimpy is the player's setting; this is the floor). */
export const FLEE_BELOW_PCT = 25;
/** At this many rounds from death or fewer, flee unless the opponent is about to die first. */
export const CRITICAL_ROUNDS = 2;
/** A fight with no blow and no word for this long is over (the game stops sending blows when a fight ends). */
export const IDLE_END_MS = 4 * ROUND_MS;
/** A fight that is being lost and is this many rounds from the character's death or fewer is left (a flee can fail and takes a round). */
export const LOSING_FLEE_ROUNDS = 6;
/** Rounds of data before the rates are trusted. */
export const RELIABLE_ROUNDS = 2;

export type FightEnd = 'won' | 'lost' | 'fled' | 'left' | 'idle';
export type FightAdvice = 'none' | 'continue' | 'finish' | 'flee';
export type FightOutcome = 'unknown' | 'winning' | 'even' | 'losing';

interface Tally {
  blows: number;
  misses: number;
  /** The sum of the middles of each blow's damage range. */
  damage: number;
}

interface LiveFight {
  startedAt: number;
  lastAt: number;
  opponent?: string;
  dealt: Tally;
  taken: Tally;
  /** The opponent's last condition, and what the character had dealt when it was read. */
  condition?: { value: Condition; dealtThen: number };
  firstHp?: number;
  hp?: number;
  maxHp?: number;
  fleeFailures: number;
  fleeAsked: boolean;
}

export interface FightSnapshot {
  /** A fight is going on (or is projected to be). */
  active: boolean;
  opponent?: string;
  /** Rounds since the first blow, counting the one in progress. */
  rounds: number;
  /** The round the fight is in at `now` (starts at 1): a suggestion made in an earlier round may be out of date. */
  roundNow: number;
  /** Estimated damage per round: what the character deals and what it takes. */
  dealtPerRound: number;
  takenPerRound: number;
  hits: number;
  misses: number;
  /** The character's hit points, projected to `now` when the fight is still going. */
  hp?: number;
  maxHp?: number;
  hpPct?: number;
  /** The opponent's last condition and, projected to `now`, its estimated percent of hit points. */
  opponentCondition?: Condition;
  opponentPct?: number;
  /** Estimated rounds until the opponent dies, and until the character does; null when it cannot be told or is not threatened. */
  roundsToKill: number | null;
  roundsToDie: number | null;
  /** True when there are enough rounds and a condition to trust the estimates. */
  reliable: boolean;
  outcome: FightOutcome;
  advice: FightAdvice;
  /** How long ago the last event of the fight was, in rounds. */
  behindRounds: number;
  /** The projection was extended past the last event. */
  projected: boolean;
  /** A flee was asked and the game said it did not work. */
  fleeFailures: number;
}

export interface FightResult {
  end: FightEnd;
  opponent?: string;
  rounds: number;
  endedAt: number;
  hpLost?: number;
  experience?: number;
}

const INACTIVE: FightSnapshot = {
  active: false,
  rounds: 0,
  roundNow: 0,
  dealtPerRound: 0,
  takenPerRound: 0,
  hits: 0,
  misses: 0,
  roundsToKill: null,
  roundsToDie: null,
  reliable: false,
  outcome: 'unknown',
  advice: 'none',
  behindRounds: 0,
  projected: false,
  fleeFailures: 0,
};

const same = (a: string | undefined, b: string): boolean => a !== undefined && a.toLowerCase() === b.toLowerCase();
const tally = (): Tally => ({ blows: 0, misses: 0, damage: 0 });

export class FightMonitor {
  private fight: LiveFight | undefined;
  private lastResult: FightResult | undefined;
  /** Experience the game reported just before the fight was closed. */
  private pendingExperience: number | undefined;

  /** The fight that ended most recently, until the next one starts. */
  result(): FightResult | undefined {
    return this.lastResult;
  }

  private start(at: number, opponent?: string): LiveFight {
    this.lastResult = undefined;
    this.pendingExperience = undefined;
    this.fight = { startedAt: at, lastAt: at, opponent, dealt: tally(), taken: tally(), fleeFailures: 0, fleeAsked: false };
    return this.fight;
  }

  private finish(end: FightEnd, at: number): void {
    const f = this.fight as LiveFight; // every caller has a fight
    const rounds = Math.max(1, Math.round((f.lastAt - f.startedAt) / ROUND_MS) + 1);
    const result: FightResult = { end, rounds, endedAt: at };
    if (f.opponent !== undefined) result.opponent = f.opponent;
    if (f.firstHp !== undefined && f.hp !== undefined) result.hpLost = Math.max(0, f.firstHp - f.hp);
    if (this.pendingExperience !== undefined) result.experience = this.pendingExperience;
    this.lastResult = result;
    this.fight = undefined;
  }

  /** Feed one event of the compact feed, in order. Anything that is not about a fight is ignored. */
  feed(event: FeedEvent): void {
    switch (event.type) {
      case 'lines':
        for (const raw of event.lines) this.line(stripAnsi(raw).trim(), event.at);
        break;
      case 'vitals': {
        let f = this.fight;
        if (f === undefined && event.inFight) f = this.start(event.at);
        if (f === undefined) break;
        f.hp = event.vitals.hp;
        f.maxHp = event.vitals.maxHp;
        f.firstHp ??= event.vitals.hp;
        if (event.inFight) f.lastAt = Math.max(f.lastAt, event.at);
        // the flag can lag a blow by a moment, so a fight is closed only after a whole quiet round
        else if (event.at - f.lastAt >= ROUND_MS) this.finish(f.fleeAsked ? 'fled' : 'idle', event.at);
        break;
      }
      case 'command':
        if (this.fight !== undefined && /^(flee|fle|fl)$/i.test(event.command.trim())) this.fight.fleeAsked = true;
        break;
      case 'room':
        // leaving the room ends the fight (a flee, or the monster followed: it starts again with the next blow)
        if (this.fight !== undefined) this.finish('left', event.at);
        break;
      case 'session':
        if (this.fight !== undefined) this.finish('left', event.at);
        break;
      default:
        break;
    }
  }

  private line(text: string, at: number): void {
    if (text === '') return;
    let f = this.fight;

    const blow = parseBlowLine(text);
    if (blow !== undefined) {
      if (f === undefined) f = this.start(at, blow.other);
      f.lastAt = Math.max(f.lastAt, at);
      f.opponent ??= blow.other;
      const side = blow.direction === 'dealt' ? f.dealt : f.taken;
      side.blows += 1;
      if (blow.max === 0) side.misses += 1;
      side.damage += midDamage(blow);
      return;
    }

    // the experience of a kill is reported just after the death line, when the fight is already closed
    const exp = /^You receive (\d+) experience points\.$/.exec(text);
    if (exp) {
      this.pendingExperience = Number(exp[1]);
      if (this.lastResult !== undefined) this.lastResult.experience = this.pendingExperience;
      return;
    }

    if (f === undefined) return;

    const condition = parseConditionLine(text);
    if (condition !== undefined) {
      if (f.opponent === undefined || same(f.opponent, condition.name)) {
        f.opponent ??= condition.name;
        f.condition = { value: condition, dealtThen: f.dealt.damage };
        f.lastAt = Math.max(f.lastAt, at);
      }
      return;
    }

    if (/is DEAD!!$/.test(text)) {
      f.lastAt = Math.max(f.lastAt, at);
      const name = text.slice(0, -' is DEAD!!'.length);
      if (f.opponent === undefined || same(f.opponent, name)) this.finish('won', at);
      return;
    }
    if (text.startsWith('You have been KILLED')) {
      this.finish('lost', at);
      return;
    }
    if (text === 'You flee from combat!') {
      this.finish('fled', at);
      return;
    }
    if (text === "PANIC! You couldn't escape!") {
      f.fleeFailures += 1;
      f.lastAt = Math.max(f.lastAt, at);
      return;
    }
  }

  /** Where the fight is at `now`, projected from the last event. Inactive (and `advice: none`) when there is no fight. */
  snapshot(now: number): FightSnapshot {
    // a fight with no word for a few rounds is over: the game sends nothing more when it ends
    if (this.fight !== undefined && now - this.fight.lastAt >= IDLE_END_MS) this.finish('idle', now);
    const f = this.fight;
    if (f === undefined) return { ...INACTIVE };

    const rounds = Math.max(1, Math.round((f.lastAt - f.startedAt) / ROUND_MS) + 1);
    const behind = Math.max(0, (now - f.lastAt) / ROUND_MS);
    const extra = behind; // under IDLE_END_MS / ROUND_MS rounds: a longer silence has already ended the fight
    const dealtPerRound = f.dealt.damage / rounds;

    // what the character takes: the hit points it lost when it knows them, else the damage the verbs say
    const textTaken = f.taken.damage / rounds;
    const lost = f.firstHp !== undefined && f.hp !== undefined ? f.firstHp - f.hp : 0;
    const takenPerRound = lost > 0 ? lost / rounds : textTaken;

    let hp = f.hp;
    let hpPct: number | undefined;
    if (hp !== undefined && f.maxHp !== undefined && f.maxHp > 0) {
      hp = Math.max(0, hp - takenPerRound * extra);
      hpPct = (hp / f.maxHp) * 100;
    }

    // the opponent: its hit points are not shown, but what was dealt and how hurt it looked say how many it had
    let opponentPct: number | undefined;
    let roundsToKill: number | null = null;
    const c = f.condition;
    if (c !== undefined) {
      const mid = midPct(c.value);
      const lostFraction = (100 - mid) / 100;
      const estMax = lostFraction > 0 && c.dealtThen > 0 ? c.dealtThen / lostFraction : undefined;
      if (estMax !== undefined && dealtPerRound > 0) {
        opponentPct = Math.max(0, mid - ((dealtPerRound * extra) / estMax) * 100);
        roundsToKill = ((opponentPct / 100) * estMax) / dealtPerRound;
      } else opponentPct = mid;
    }

    const roundsToDie = hp !== undefined && takenPerRound > 0 ? hp / takenPerRound : null;
    const reliable = rounds >= RELIABLE_ROUNDS && c !== undefined && roundsToKill !== null;

    let outcome: FightOutcome = 'unknown';
    if (reliable) {
      if (roundsToDie === null) outcome = 'winning';
      else if ((roundsToKill as number) * 1.25 < roundsToDie) outcome = 'winning';
      else if (roundsToDie < (roundsToKill as number)) outcome = 'losing';
      else outcome = 'even';
    } else if (roundsToDie !== null && roundsToDie <= CRITICAL_ROUNDS) outcome = 'losing';

    let advice: FightAdvice = 'continue';
    const dyingFirst = roundsToDie !== null && roundsToDie <= CRITICAL_ROUNDS && !(roundsToKill !== null && roundsToKill <= 1);
    if ((hpPct !== undefined && hpPct < FLEE_BELOW_PCT) || dyingFirst || (outcome === 'losing' && roundsToDie !== null && roundsToDie <= LOSING_FLEE_ROUNDS)) advice = 'flee';
    else if (reliable && roundsToKill !== null && roundsToKill <= 2) advice = 'finish';

    const snap: FightSnapshot = {
      active: true,
      rounds,
      roundNow: Math.max(1, Math.floor((now - f.startedAt) / ROUND_MS) + 1),
      dealtPerRound,
      takenPerRound,
      hits: f.dealt.blows - f.dealt.misses,
      misses: f.dealt.misses,
      roundsToKill,
      roundsToDie,
      reliable,
      outcome,
      advice,
      behindRounds: behind,
      projected: extra > 0,
      fleeFailures: f.fleeFailures,
    };
    if (f.opponent !== undefined) snap.opponent = f.opponent;
    if (hp !== undefined) snap.hp = hp;
    if (f.maxHp !== undefined) snap.maxHp = f.maxHp;
    if (hpPct !== undefined) snap.hpPct = hpPct;
    if (c !== undefined) snap.opponentCondition = c.value;
    if (opponentPct !== undefined) snap.opponentPct = opponentPct;
    return snap;
  }
}
