// apps/game-client/src/features/autoleveling/autoleveling-lag.ts

/**
 * Ability lag as the engine reasons about it. Every cast, kick or quaff puts the character in lag for a moment, and the game queues the
 * next command behind it: a movement sent right after a few buffs is answered late. On 2026-11-18 the command after a kick was answered a
 * median 898 ms after it was sent, and after a kill command 1,013 ms, against about 150 ms after a plain move (probe of the game-server log).
 */

/** A command sent to the game that is not a move or a look, with how long the game is expected to be busy with it. */
export interface SentCommand {
  at: number;
  lagMs: number;
}

/** What the engine assumes for a command whose lag nobody has measured or learned: about what a kick or a kill command costs. */
export const DEFAULT_LAG_MS = 1000;

/** The most the engine will add to a wait for lag it queued itself: more than this is a stall, not lag. */
export const MAX_LAG_ALLOWANCE_MS = 20_000;

/** Only commands this recent can still be in the game's queue. */
const HORIZON_MS = 30_000;

/**
 * The lag of one command: the largest of what it was configured with, what the engine learned from queue build-up and what the
 * server's ability data says (any of them may be unknown). Lag is a floor: learned and measured values only ever raise it (L40).
 * All unknown gives 0, so the caller decides what to assume.
 */
export function effectiveLagMs(configuredSec: number | null | undefined, learnedSec: number | null | undefined, serverLagMs: number | null | undefined): number {
  const ms = [(configuredSec ?? 0) * 1000, (learnedSec ?? 0) * 1000, serverLagMs ?? 0].filter((n) => Number.isFinite(n) && n > 0);
  return ms.length ? Math.round(Math.max(...ms)) : 0;
}

/**
 * How long the game will still be busy with what the engine has already sent, as of `now`: the commands run one after another, each
 * starting when it was sent or when the one before it finishes, whichever is later. Capped at MAX_LAG_ALLOWANCE_MS. A movement reply
 * is expected no sooner than this after it was sent, so a wait for it adds the allowance before it can call the reply missing.
 */
export function lagAllowanceMs(sends: readonly SentCommand[], now: number): number {
  const recent = sends.filter((s) => now - s.at <= HORIZON_MS && s.at <= now).sort((a, b) => a.at - b.at);
  let busyUntil = 0;
  for (const s of recent) busyUntil = Math.max(busyUntil, s.at) + Math.max(0, s.lagMs);
  return Math.min(MAX_LAG_ALLOWANCE_MS, Math.max(0, busyUntil - now));
}

/* --------------------- what the server knows about each ability (class feed) --------------------- */

/** The two timing facts of the class feed for one ability; either may be absent (unknown). */
export interface AbilityTiming {
  durationTicks?: number;
  lagMs?: number;
}

/** Ability timing by lowercase ability name, built from the class catalog (an ability has one timing whichever class learns it). */
export type TimingIndex = ReadonlyMap<string, AbilityTiming>;

/** Builds the index from a catalog's abilities. When the same name carries different numbers (it should not), the larger lag and duration win. */
export function buildTimingIndex(classes: readonly { abilities: readonly { name: string; durationTicks?: number; lagMs?: number }[] }[]): TimingIndex {
  const index = new Map<string, AbilityTiming>();
  for (const cls of classes) {
    for (const a of cls.abilities) {
      if (a.durationTicks === undefined && a.lagMs === undefined) continue;
      const key = a.name.trim().toLowerCase();
      const have = index.get(key) ?? {};
      const next: AbilityTiming = { ...have };
      if (a.durationTicks !== undefined) next.durationTicks = Math.max(a.durationTicks, have.durationTicks ?? 0);
      if (a.lagMs !== undefined) next.lagMs = Math.max(a.lagMs, have.lagMs ?? 0);
      index.set(key, next);
    }
  }
  return index;
}

/**
 * The ability a command uses, by name as the class feed spells it: `cast 'frenzy' elf`, `c 'frenzy'` and `cast frenzy` are frenzy, a bare `kick orc` is kick. No
 * guessing from an abbreviation here (the player's own spelling is in the row): an unknown spelling is simply an unknown ability.
 */
export function abilityNameFromCommand(cmd: string): string | null {
  const text = String(cmd ?? '').trim();
  if (!text) return null;
  const cast = /^(?:cast|c)\s+(?:'([^']+)'|(\S+))/i.exec(text);
  const word = cast ? (cast[1] ?? cast[2]) : text.split(/\s+/, 1)[0];
  return word ? word.trim().toLowerCase() : null;
}

/** The server's measured lag for the ability a command uses, in milliseconds, or null when unknown (no index, no such ability, no measurement). */
export function serverLagMsFor(index: TimingIndex | null | undefined, cmd: string): number | null {
  const name = abilityNameFromCommand(cmd);
  if (!index || !name) return null;
  return index.get(name)?.lagMs ?? null;
}

/**
 * How often a tick-gated buff is recast by default: one tick before its affect would run out, so it never lapses, and never less than every tick. The
 * duration is the highest ever seen in play. Unknown gives the fallback (today's default).
 */
export function refreshTicksFromDuration(durationTicks: number | undefined, fallback: number): number {
  return durationTicks === undefined ? fallback : Math.max(1, Math.floor(durationTicks) - 1);
}

/** The reuse time a new fight row starts with, in seconds: the ability's measured lag, rounded to a tenth. Unknown is 0 (as before). */
export function cooldownSecFromLag(lagMs: number | undefined): number {
  return lagMs === undefined ? 0 : Math.round(lagMs / 100) / 10;
}
