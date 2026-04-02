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

// ── Plugin omit rules (keyed by pluginId, bypasses global-var expansion) ──

const pluginCompiled: Map<string, Compiled[]> = new Map();

export function setPluginOmitRules(
  pluginId: string,
  rules: Array<{ matchText: string; eventName?: string; caseInsensitive?: boolean }>,
): void {
  if (rules.length === 0) {
    pluginCompiled.delete(pluginId);
    return;
  }

  const next: Compiled[] = [];
  for (const r of rules) {
    const eventName = safeTrim(r.eventName ?? 'shatteredarchive:raw-data');
    if (!eventName) continue;

    const needle = safeTrim(r.matchText ?? '');
    if (!needle) continue;

    next.push({
      id: `plugin::${pluginId}::${needle}`,
      eventName,
      needle,
      caseInsensitive: r.caseInsensitive !== false, // default true
      omitAll: false,
    });
  }

  if (next.length > 0) {
    pluginCompiled.set(pluginId, next);
  } else {
    pluginCompiled.delete(pluginId);
  }
}

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

function checkRules(rules: Compiled[], ev: string, line: string, lower: () => string): boolean {
  for (const r of rules) {
    if (r.eventName !== ev) continue;
    if (r.omitAll) return true;
    if (!r.needle) continue;
    if (r.caseInsensitive) {
      if (lower().includes(r.needle.toLowerCase())) return true;
    } else {
      if (line.includes(r.needle)) return true;
    }
  }
  return false;
}

export function shouldOmitLine(eventName: string, line: string): boolean {
  if (compiled.length === 0 && pluginCompiled.size === 0) return false;

  const ev = safeTrim(eventName);
  if (!ev) return false;

  let _lower: string | null = null;
  const lower = () => {
    if (_lower === null) _lower = line.toLowerCase();
    return _lower;
  };

  if (checkRules(compiled, ev, line, lower)) return true;

  for (const rules of pluginCompiled.values()) {
    if (checkRules(rules, ev, line, lower)) return true;
  }

  return false;
}
