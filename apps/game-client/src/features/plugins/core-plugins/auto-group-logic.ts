// apps/game-client/src/features/plugins/core-plugins/auto-group-logic.ts
//
// Pure text parsing and decision logic for the Auto Group plugin. The plugin file owns every side
// effect (commands, timers, the people DB). The who-list line parser is shared with the People
// plugin and lives in who-line.ts.
//
// Every line shape below was confirmed against the Docker game-server log corpus
// (C:\Projects\DSL\GameLogs\ShatteredArchive\Docker\game-server, 2026-11-21):
//   "Ezrianne now follows you."                  follow (a re-follow after a stop is the usual ungroup)
//   "Ezrianne stops following you."              they left the group with it
//   "Ezrianne joins your group."                 our `group` worked
//   "No one of that name is playing."            whois miss
//   "Melchaleve's group:"                        `gr` header (always printed, even with no one else)
//   "[51 Arm] Tiberius   100% hp  83% mana  97% mv"   a `gr` row: players, and mobs with class Mob

import { affiliationKeys } from './who-line';

export type GroupAction = 'group' | 'ignore';

export interface AutoGroupRules {
  allowedUsers: Set<string>;
  excludedUsers: Set<string>;
  allowedAffiliations: Set<string>;
  excludedAffiliations: Set<string>;
  defaultAction: GroupAction;
}

/** What a list entry (and the stored memory) calls a player with no clan or kingdom. */
export const NO_AFFILIATION = 'none';

export type Decision = { action: 'group' | 'ignore'; reason: string } | { action: 'need-affiliation'; reason: string };

// ── Lines ───────────────────────────────────────────────────────────────

// A player is one capitalised word. NPC followers print as "An earth elemental", "A raven" and,
// in two words, "Yan Luo": none of them match.
const NAME = "([A-Z][A-Za-z']+)";
const RE_FOLLOW = new RegExp(`^${NAME} now follows you\\.$`);
const RE_JOINED = new RegExp(`^${NAME} joins your group\\.$`);
const RE_STOPPED = new RegExp(`^${NAME} stops following you\\.$`);
const RE_NOT_FOUND = /^No one of that name is playing\.$/;
const RE_GROUP_HEADER = /^.{1,60}'s group:$/;
// "[51 Arm] Tiberius         100% hp  83% mana  97% mv": the name runs up to the first percentage.
const RE_GROUP_ROW = /^\[\s*\d+\s+\w+\]\s+(.+?)\s+\d+%\s+hp\s+\d+%\s+mana\s+\d+%\s+mv\s*$/;

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;

/** One raw-data chunk -> clean lines (ANSI and carriage returns removed, blanks dropped). */
export function cleanLines(chunk: string): string[] {
  return chunk
    .replace(ANSI, '')
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
}

export function parseFollowLine(line: string): string | null {
  return RE_FOLLOW.exec(line)?.[1] ?? null;
}

export function parseJoinedLine(line: string): string | null {
  return RE_JOINED.exec(line)?.[1] ?? null;
}

/** "Tiberius stops following you.": they are out of the group too. */
export function parseStopLine(line: string): string | null {
  return RE_STOPPED.exec(line)?.[1] ?? null;
}

export function isWhoisNotFound(line: string): boolean {
  return RE_NOT_FOUND.test(line);
}

/** "Melchaleve's group:", the first line of a `gr` reply. */
export function isGroupHeader(line: string): boolean {
  return RE_GROUP_HEADER.test(line);
}

/** One `gr` row -> the member's name (lowercased), or null for any other line. */
export function parseGroupRow(line: string): string | null {
  return RE_GROUP_ROW.exec(line)?.[1].toLowerCase() ?? null;
}

// ── Config lists ────────────────────────────────────────────────────────

/** Names or affiliations, one per line or comma separated; `#` starts a comment line. Lowercased. */
export function parseList(text: unknown): Set<string> {
  const out = new Set<string>();
  if (typeof text !== 'string') return out;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    for (const part of line.split(',')) {
      const v = part.trim().toLowerCase();
      if (v) out.add(v);
    }
  }
  return out;
}

/** parseList, with each entry also adding its long/short alias ("NT" and "New Thalos"). */
export function parseAffiliationList(text: unknown): Set<string> {
  const out = new Set<string>();
  for (const entry of parseList(text)) for (const key of affiliationKeys(entry)) out.add(key);
  return out;
}

export function readRules(cfg: Record<string, unknown>): AutoGroupRules {
  return {
    allowedUsers: parseList(cfg.allowedUsers),
    excludedUsers: parseList(cfg.excludedUsers),
    allowedAffiliations: parseAffiliationList(cfg.allowedAffiliations),
    excludedAffiliations: parseAffiliationList(cfg.excludedAffiliations),
    defaultAction: cfg.defaultAction === 'group' ? 'group' : 'ignore',
  };
}

/** A whois is only worth sending when an affiliation list could change the outcome. */
export function needsAffiliation(rules: AutoGroupRules): boolean {
  return rules.allowedAffiliations.size > 0 || rules.excludedAffiliations.size > 0;
}

// ── Memory ──────────────────────────────────────────────────────────────

export interface RememberedAffiliation {
  org?: string;
  affiliationCheckedAt?: number;
  lastSeen?: number;
}

export interface AffiliationLookup {
  /** The remembered affiliation ('' = checked, none), or undefined when nothing is remembered. */
  known: string | undefined;
  /** Whether `known` is recent enough to trust without another whois. */
  fresh: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Read the affiliation the people DB remembers. A whois stamps `affiliationCheckedAt`, so an empty
 * org with a stamp means "checked, none". A who-list entry has no stamp: its org counts, aged by
 * lastSeen. An entry with neither (e.g. craft-only) tells us nothing.
 */
export function lookupAffiliation(
  person: RememberedAffiliation | null | undefined,
  now: number,
  maxAgeDays: number,
): AffiliationLookup {
  if (!person) return { known: undefined, fresh: false };

  let known: string;
  let stampedAt: number;
  if (typeof person.affiliationCheckedAt === 'number') {
    known = person.org ?? '';
    stampedAt = person.affiliationCheckedAt;
  } else if (person.org) {
    known = person.org;
    stampedAt = person.lastSeen ?? 0;
  } else {
    return { known: undefined, fresh: false };
  }

  const fresh = maxAgeDays <= 0 || now - stampedAt <= maxAgeDays * DAY_MS;
  return { known, fresh };
}

// ── Decision ────────────────────────────────────────────────────────────

/**
 * Decide what to do about one follower.
 *   Order: excluded user, allowed user, excluded affiliation, allowed affiliation, default.
 * `affiliation`: a string ('' = none) when known; `undefined` when not known yet (the result is
 * 'need-affiliation' if an affiliation list could matter); `null` when it could not be found out.
 */
export function decide(name: string, rules: AutoGroupRules, affiliation: string | null | undefined): Decision {
  const key = name.toLowerCase();
  if (rules.excludedUsers.has(key)) return { action: 'ignore', reason: 'excluded user' };
  if (rules.allowedUsers.has(key)) return { action: 'group', reason: 'allowed user' };

  const fallback: Decision = {
    action: rules.defaultAction,
    reason: rules.defaultAction === 'group' ? 'no rule matched, default is group' : 'no rule matched',
  };

  if (!needsAffiliation(rules)) return fallback;
  if (affiliation === undefined) return { action: 'need-affiliation', reason: 'affiliation not known' };
  if (affiliation === null) return { ...fallback, reason: `${fallback.reason}; affiliation unavailable` };

  const aff = affiliation.trim().toLowerCase() || NO_AFFILIATION;
  const keys = affiliationKeys(aff);
  if (keys.some((k) => rules.excludedAffiliations.has(k)))
    return { action: 'ignore', reason: `excluded affiliation ${aff}` };
  if (keys.some((k) => rules.allowedAffiliations.has(k)))
    return { action: 'group', reason: `allowed affiliation ${aff}` };
  return fallback;
}
