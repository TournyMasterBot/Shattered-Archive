import { parseDamageLine } from '../combat/damage/damage-events';

export type OmitRule = {
  id: string;
  eventName: string; // can be "text:line" / "game:terminal-data" / OR "event:damage"
  matchText: string; // substring match (can be blank now)
  caseInsensitive?: boolean;
};

type Compiled =
  | {
      kind: 'text';
      eventName: string; // "text:line" / "game:terminal-data"
      needle: string;
      caseInsensitive: boolean;
    }
  | {
      kind: 'event';
      // IMPORTANT:
      // event omits always apply to "text:line" output filtering
      // but are scoped by detectEvent ("event:damage", etc)
      detectEvent: string;
    };

let compiled: Compiled[] = [];

function lineTriggersEvent(detectEvent: string, line: string): boolean {
  switch (detectEvent) {
    case 'event:damage':
      return !!parseDamageLine(line);

    case 'event:flee':
      return line === 'You flee from combat!';

    case 'event:creature-death':
      return line.includes('is DEAD!!');

    default:
      return false;
  }
}

export function setOmitRules(rules: OmitRule[]) {
  compiled = (rules ?? [])
    .map((r) => {
      const raw = String(r.matchText ?? '').trim();
      const evt = String(r.eventName ?? '').trim();

      // ✅ NEW: blank matchText + event:* means "omit the line that triggers this event"
      if (raw.length === 0 && evt.startsWith('event:')) {
        return {
          kind: 'event',
          detectEvent: evt,
        } as Compiled;
      }

      // ✅ Normal substring omit behavior
      if (raw.length > 0) {
        const ci = r.caseInsensitive ?? true;
        return {
          kind: 'text',
          eventName: evt,
          needle: ci ? raw.toLowerCase() : raw,
          caseInsensitive: ci,
        } as Compiled;
      }

      return null;
    })
    .filter((x): x is Compiled => !!x);
}

export function shouldOmitLine(eventName: string, line: string): boolean {
  if (compiled.length === 0) return false;

  let lower: string | null = null;

  for (const r of compiled) {
    // ✅ Event-based omit applies ONLY at line-level filtering
    if (r.kind === 'event') {
      if (eventName !== 'text:line') continue;
      if (lineTriggersEvent(r.detectEvent, line)) return true;
      continue;
    }

    // ✅ Existing behavior: event name must match
    if (r.eventName !== eventName) continue;

    if (r.caseInsensitive) {
      if (lower === null) lower = line.toLowerCase();
      if (lower.includes(r.needle)) return true;
    } else {
      if (line.includes(r.needle)) return true;
    }
  }

  return false;
}
