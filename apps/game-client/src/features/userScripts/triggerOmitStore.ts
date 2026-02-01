import { expandMatchTextWithGlobals } from './expand-global-vars';
import { getGlobalVar } from './globalScriptsStore';
import { safeTrim } from './safeTrim';

// apps/game-client/src/features/userScripts/triggerOmitStore.ts
export type OmitRule = {
  id: string;
  eventName: string;
  matchText: string;
  caseInsensitive?: boolean;
};

type Compiled = {
  id: string;
  eventName: string;
  needle: string;
  caseInsensitive: boolean;
};

let compiled: Compiled[] = [];

export function setOmitRules(rules: OmitRule[], connectionId: string) {
  const next: Compiled[] = [];

  for (const r of rules) {
    const raw = safeTrim(r.matchText);
    if (!raw) continue;

    // Expand globals. If expansion yields empty, SKIP the rule.
    const expanded = expandMatchTextWithGlobals(raw, (key) => getGlobalVar(connectionId, key)) ?? '';

    const needle = safeTrim(expanded);
    if (!needle) continue; // <- critical fix (prevents includes('') => true)

    next.push({
      id: r.id,
      eventName: safeTrim(r.eventName),
      needle,
      caseInsensitive: r.caseInsensitive === true,
    });
  }

  compiled = next;
}

export function shouldOmitLine(line: string): boolean {
  if (compiled.length === 0) return false;

  let lower: string | null = null;

  for (const r of compiled) {
    // Also guard here, in case something slips through.
    if (!r.needle) continue;

    // You currently ignore caseInsensitive; leaving behavior as-is per your request.
    if (r.caseInsensitive) {
      if (lower === null) lower = line.toLowerCase();
      if (lower.includes(r.needle.toLowerCase())) return true;
    } else {
      if (line.includes(r.needle)) return true;
    }
  }

  return false;
}
