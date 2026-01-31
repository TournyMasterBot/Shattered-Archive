// apps\game-client\src\features\userScripts\triggerOmitStore.ts
export type OmitRule = {
  id: string;
  eventName: string;
  matchText: string;
  caseInsensitive?: boolean;
};

type Compiled = {
  eventName: string;
  needle: string;
  caseInsensitive: boolean;
};

let compiled: Compiled[] = [];

export function setOmitRules(rules: OmitRule[]) {
  compiled = rules
    .filter((r) => (r.matchText ?? '').trim().length > 0)
    .map((r) => {
      const ci = r.caseInsensitive ?? true;
      const raw = (r.matchText ?? '').trim();
      return {
        eventName: r.eventName,
        needle: ci ? raw.toLowerCase() : raw,
        caseInsensitive: ci,
      };
    });
}

export function shouldOmitLine(eventName: string, line: string): boolean {
  if (compiled.length === 0) return false;

  let lower: string | null = null;

  for (const r of compiled) {
    lower = line.toLowerCase();
    if(lower.includes(r.needle)) {
      return true;
    }
  }

  return false;
}
