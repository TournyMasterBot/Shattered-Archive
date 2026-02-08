import { expandMatchTextWithGlobals } from './expand-global-vars';
import { getGlobalVar } from './globalScriptsStore';
import { safeTrim } from './safeTrim';

// apps/game-client/src/features/userScripts/triggerOmitStore.ts
export type OmitRule = {
  id: string;
  eventName: string;
  matchText?: string; // optional now
  caseInsensitive?: boolean;
  omitAll?: boolean;
};

type Compiled = {
  id: string;
  eventName: string;
  needle: string; // may be ''
  caseInsensitive: boolean;
  omitAll: boolean;
};

let compiled: Compiled[] = [];

export function setOmitRules(rules: OmitRule[], connectionId: string) {
  const next: Compiled[] = [];

  for (const r of rules) {
    const eventName = safeTrim(r.eventName);
    if (!eventName) continue;

    const omitAll = r.omitAll === true;

    // If omitAll, we keep the rule even with no needle.
    if (omitAll) {
      next.push({
        id: r.id,
        eventName,
        needle: '',
        caseInsensitive: r.caseInsensitive === true,
        omitAll: true,
      });
      continue;
    }

    const raw = safeTrim(r.matchText ?? '');
    if (!raw) continue;

    const expanded = expandMatchTextWithGlobals(raw, (key) => getGlobalVar(connectionId, key)) ?? '';
    const needle = safeTrim(expanded);
    if (!needle) continue; // critical: prevents includes('') => true

    next.push({
      id: r.id,
      eventName,
      needle,
      caseInsensitive: r.caseInsensitive === true,
      omitAll: false,
    });
  }

  compiled = next;
}

export function shouldOmitLine(eventName: string, line: string): boolean {
  if (compiled.length === 0) return false;

  const ev = safeTrim(eventName);
  if (!ev) return false;

  let lower: string | null = null;

  for (const r of compiled) {
    if (r.eventName !== ev) continue;

    if (r.omitAll) return true;

    if (!r.needle) continue;

    if (r.caseInsensitive) {
      if (lower === null) lower = line.toLowerCase();
      if (lower.includes(r.needle.toLowerCase())) return true;
    } else {
      if (line.includes(r.needle)) return true;
    }
  }

  return false;
}
