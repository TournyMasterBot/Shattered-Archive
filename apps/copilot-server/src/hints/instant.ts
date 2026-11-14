// apps/copilot-server/src/hints/instant.ts
//
// The instant tier and the local-model tier: clients of the two room-hint routes of the DSL site's agent API (the same ones the `hint` and `hint:ai` user
// scripts call). The instant one is a word-list lookup against the room text and what the owner's logs say was tried there; the local one writes an answer with the
// owner's local model, so it is only ever called when the caller says it is allowed (a model on the GPU is never started silently).

import type { HintRoom, TierFn } from './types.js';

export interface HintClientOptions {
  /** The DSL site's base URL, for example `http://localhost:5000`. */
  baseUrl: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/** The most commands one tier hands on; the strongest first. */
export const MAX_TIER_COMMANDS = 6;
const MAX_DESCRIPTION = 3900;
const MAX_EXITS = 12;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** The instant answer's candidates and the commands known to work, as short command lines, never a struck-off one, no repeats. */
export function commandsFromHints(json: unknown): { commands: string[]; notes: string[] } {
  const hints = isRecord(json) && isRecord(json.hints) ? json.hints : undefined;
  if (hints === undefined) return { commands: [], notes: [] };
  const struck = new Set((Array.isArray(hints.struckOff) ? hints.struckOff : []).flatMap((s) => (isRecord(s) && typeof s.command === 'string' ? [s.command.toLowerCase()] : [])));
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (command: unknown): void => {
    if (typeof command !== 'string') return;
    const line = command.trim();
    const key = line.toLowerCase();
    if (line === '' || struck.has(key) || seen.has(key)) return;
    seen.add(key);
    out.push(line);
  };
  // what the logs show the game answered comes before what the nouns suggest
  for (const w of Array.isArray(hints.worked) ? hints.worked : []) if (isRecord(w)) add(w.command);
  for (const c of Array.isArray(hints.candidates) ? hints.candidates : []) if (isRecord(c) && Array.isArray(c.commands)) for (const command of c.commands) add(command);
  const notes: string[] = [];
  if (hints.unlistedObjectSeen === true) notes.push('an unlisted object is here (a blank-indent line)');
  if (struck.size > 0) notes.push(`${struck.size} command${struck.size === 1 ? '' : 's'} struck off: the logs show the game rejecting them`);
  return { commands: out.slice(0, MAX_TIER_COMMANDS), notes };
}

function exitLetters(room: HintRoom): string[] {
  return (room.exits ?? []).slice(0, MAX_EXITS);
}

/** The instant tier: `GET /api/agent/room-hints`. Any failure is "I cannot answer" (the next tier is asked), never an error. */
export function instantTier(options: HintClientOptions): TierFn {
  const doFetch = options.fetch ?? fetch;
  const base = options.baseUrl.replace(/\/+$/, '');
  return async (room, signal) => {
    if (room.title.trim() === '') return null;
    const query = new URLSearchParams({ title: room.title, description: (room.description ?? '').slice(0, MAX_DESCRIPTION), unlisted: 'false' });
    for (const e of exitLetters(room)) query.append('exits', e);
    const timeout = AbortSignal.timeout(options.timeoutMs ?? 3000);
    try {
      const res = await doFetch(`${base}/api/agent/room-hints?${query.toString()}`, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
      if (!res.ok) return null;
      const found = commandsFromHints(await res.json());
      return found.commands.length === 0 ? null : found;
    } catch {
      return null;
    }
  };
}

/** The ordinary words of a local model's answer: lines that look like commands, one per line, bullets and numbers removed. */
export function commandsFromAnswer(answer: string): string[] {
  const out: string[] = [];
  for (const raw of String(answer ?? '').split(/\r?\n/)) {
    const line = raw.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/^`+|`+$/g, '').trim();
    if (line === '' || line.length > 80 || /[.:!?]$/.test(line) || line.split(/\s+/).length > 4) continue;
    if (!out.includes(line)) out.push(line);
  }
  return out.slice(0, MAX_TIER_COMMANDS);
}

/**
 * The local-model tier: `POST /api/agent/room-hints/ai`. It is asked only while `allowed()` is true (the owner switched it on); otherwise it answers null without a
 * request, so no model is loaded. A model that is not configured, not reachable, or still writing is "I cannot answer" too.
 */
export function localTier(options: HintClientOptions & { allowed: () => boolean }): TierFn {
  const doFetch = options.fetch ?? fetch;
  const base = options.baseUrl.replace(/\/+$/, '');
  return async (room, signal) => {
    if (!options.allowed() || room.title.trim() === '') return null;
    const timeout = AbortSignal.timeout(options.timeoutMs ?? 150_000); // a cold model can take minutes
    try {
      const res = await doFetch(`${base}/api/agent/room-hints/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: room.title, description: (room.description ?? '').slice(0, MAX_DESCRIPTION), exits: exitLetters(room), objects: [], creatures: [], unlisted: false }),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      const body: unknown = await res.json();
      const result = isRecord(body) && isRecord(body.result) ? body.result : undefined;
      if (!res.ok || result === undefined || result.ok !== true || typeof result.answer !== 'string') return null;
      const commands = commandsFromAnswer(result.answer);
      return commands.length === 0 ? null : { commands, notes: ['written by the local model from the room text: check each command, it can be wrong'] };
    } catch {
      return null;
    }
  };
}
