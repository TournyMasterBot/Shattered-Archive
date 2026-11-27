// apps/copilot-server/src/hints/rules.ts
//
// The learned tier: what a person (or Claude in a training session) taught for one room, kept in an append-only ledger beside the others. A rule names a
// room and the commands worth trying there, with who said so. It is a FACT shown to the model, never a command that runs: whatever Copilot suggests
// from it still goes through the policy gate and the owner. Copilot never writes a rule itself.

import type { JsonlStore } from '@shatteredarchive/copilot-core';
import type { HintRoom, TierFn } from './types.js';

export const RULE_SOURCES = ['owner', 'claude'] as const;
export type RuleSource = (typeof RULE_SOURCES)[number];

export interface HintRule {
  /** Stable per (room, source, day): taking the same answer again replaces nothing, it is a new line of the ledger. */
  id: string;
  /** `roomKeyOf(title)`. */
  roomKey: string;
  /** The room name as the game printed it (for the reader; the key does the matching). */
  title: string;
  commands: string[];
  source: RuleSource;
  /** Epoch milliseconds. */
  at: number;
  /** Why, in a sentence (optional). */
  note?: string;
}

export const MAX_COMMANDS = 8;
export const MAX_COMMAND_CHARS = 120;
export const MAX_NOTE_CHARS = 280;
const CONTROL = /[\u0000-\u001f\u007f]/;

/** A room name as a key: colour and spacing and case do not tell two sightings apart. */
export function roomKeyOf(title: string): string {
  return String(title ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Why a rule is not acceptable, or null when it is. */
export function ruleProblem(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return 'the rule is not an object';
  const r = value as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id === '' || r.id.length > 160) return 'id is missing or too long';
  if (typeof r.title !== 'string' || r.title.trim() === '' || r.title.length > 200) return 'title is missing or too long';
  if (r.roomKey !== roomKeyOf(r.title)) return 'roomKey does not match the title';
  if (!Array.isArray(r.commands) || r.commands.length === 0 || r.commands.length > MAX_COMMANDS) return `commands must be 1 to ${MAX_COMMANDS} lines`;
  for (const c of r.commands) {
    if (typeof c !== 'string' || c.trim() === '' || c.length > MAX_COMMAND_CHARS || CONTROL.test(c)) return 'a command is empty, too long, or has a control character';
  }
  if (!RULE_SOURCES.includes(r.source as RuleSource)) return 'source is not owner or claude';
  if (typeof r.at !== 'number' || !Number.isFinite(r.at)) return 'at is not a time';
  if (r.note !== undefined && (typeof r.note !== 'string' || r.note.length > MAX_NOTE_CHARS)) return 'note is not text of a sensible length';
  return null;
}

/** The ledger's validator: a rule as it was written, or why it is not one. */
export function validateRule(value: unknown): { ok: true; value: HintRule } | { ok: false; errors: string[] } {
  const problem = ruleProblem(value);
  return problem === null ? { ok: true, value: value as HintRule } : { ok: false, errors: [problem] };
}

export interface NewRule {
  title: string;
  commands: string[];
  source: RuleSource;
  note?: string;
}

/** Builds a rule from what was taught, or says why it cannot be one. Commands are trimmed and a repeat is dropped. */
export function makeRule(input: NewRule, at: number): { ok: true; rule: HintRule } | { ok: false; problem: string } {
  const commands = [...new Set((input.commands ?? []).map((c) => String(c).trim()))].filter((c) => c !== '');
  const key = roomKeyOf(input.title);
  const day = new Date(at).toISOString().slice(0, 10);
  const rule: HintRule = {
    id: `${key}|${input.source}|${day}`.slice(0, 160),
    roomKey: key,
    title: String(input.title ?? '').trim(),
    commands,
    source: input.source,
    at,
    ...(input.note === undefined ? {} : { note: input.note }),
  };
  const problem = ruleProblem(rule);
  return problem === null ? { ok: true, rule } : { ok: false, problem };
}

/**
 * The learned tier over the ledger: an exact lookup with no I/O. A rule the owner taught wins over one Claude taught; among rules of one source the newest wins.
 */
export function learnedTier(store: Pick<JsonlStore<HintRule>, 'query'>): TierFn {
  return async (room: HintRoom) => {
    const key = roomKeyOf(room.title);
    const found = store.query((r) => r.roomKey === key);
    if (found.length === 0) return null;
    const best = [...found].sort((a, b) => Number(b.source === 'owner') - Number(a.source === 'owner') || b.at - a.at)[0];
    return { commands: best.commands, notes: [`taught by ${best.source === 'owner' ? 'you' : 'Claude'}${best.note ? `: ${best.note}` : ''}`] };
  };
}
