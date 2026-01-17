import { baseDamageType } from './damage-types';
import { DamageMapInstance, getLastDamageKeyIndex } from './damage-map';

export type DamageEventPayload = {
  verb: string; // wounds / MUTILATES / etc
  amount: number; // numeric amount from DamageMap
  damageType: string; // baseDamageType value (or "unknown")
  source?: string; // "You" or mob name (if parseable)
  target?: string; // mob name / "you" (if parseable)
  raw: string; // original line
};

const ANSI_DAMAGE_PREFIXES = [
  '\x1B[0;32m', // green
  '\x1B[1;33m', // yellow
  '\x1B[1;31m', // red
  '\x1B[1;37m', // white (part of blink words)
];

// map last token on the left side -> damage type
const DAMAGE_TYPE_BY_TOKEN: Record<string, string> = {
  // single-word
  slash: baseDamageType.Slash,
  pierce: baseDamageType.Pierce,
  stab: baseDamageType.Stab,
  chop: baseDamageType.Chop,
  cleave: baseDamageType.Cleave,
  crush: baseDamageType.Crush,
  pound: baseDamageType.Pound,
  punch: baseDamageType.Punch,
  whip: baseDamageType.Whip,
  thwack: baseDamageType.Thwack,
  smash: baseDamageType.Smash,
  wrath: baseDamageType.Wrath,
  bite: baseDamageType.Bite,

  // multi-word
  'divine power': baseDamageType.Divine,
  'acidic bite': baseDamageType.AcidicBite,
  'shocking bite': baseDamageType.ShockingBite,
  'flaming bite': baseDamageType.FlamingBite,
  'freezing bite': baseDamageType.FreezingBite,
};

function stripAnsi(s: string) {
  return s.replace(/\x1B\[[0-9;]*m/g, '');
}

// removes standalone decoration tokens like "***", "===", "---"
function stripDecorators(s: string) {
  return (
    s
      // remove tokens surrounded by whitespace
      .replace(/\s(?:\*{2,}|={2,}|\+{2,}|-{2,}|~{2,})\s/g, ' ')
      // also remove them at start/end
      .replace(/^(?:\*{2,}|={2,}|\+{2,}|-{2,}|~{2,})\s*/g, '')
      .replace(/\s*(?:\*{2,}|={2,}|\+{2,}|-{2,}|~{2,})$/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

// find last meaningful word token (letters only) from a string
function lastAlphaToken(words: string[]) {
  for (let i = words.length - 1; i >= 0; i--) {
    const w = words[i];
    if (/^[A-Za-z]+$/.test(w)) return w;
  }
  return '';
}

function lastAlphaPhrase(words: string[], count: number): string {
  const picked: string[] = [];

  for (let i = words.length - 1; i >= 0; i--) {
    const w = words[i];
    if (/^[A-Za-z]+$/.test(w)) {
      picked.push(w);
      if (picked.length === count) break;
    }
  }

  if (picked.length < count) return '';
  return picked.reverse().join(' ');
}

function fastLooksLikeDamageLine(line: string) {
  for (const p of ANSI_DAMAGE_PREFIXES) {
    if (line.includes(p)) return true;
  }
  return false;
}

export function parseDamageLine(line: string): DamageEventPayload | null {
  // 1) fast abort
  if (!fastLooksLikeDamageLine(line)) return null;

  // 2) damage amount + verb (severity key)
  const last = getLastDamageKeyIndex(line);
  if (!last) return null;

  const verb = last.key;
  const amount = (DamageMapInstance as any)[verb];
  if (typeof amount !== 'number') return null;

  // normalize to plain text
  const clean = stripAnsi(line).replace(/\s+/g, ' ').trim();

  // split: "<left> <verb> <right>"
  const idx = clean.lastIndexOf(verb);
  if (idx === -1) return null;

  let left = clean.slice(0, idx).trim();
  let right = clean.slice(idx + verb.length).trim();

  // ✅ NEW: remove crit decorators before parsing type/source/target
  left = stripDecorators(left);
  right = stripDecorators(right);

  // 3) damage type (last real token on left side)
  const leftWords = left.split(/\s+/);
  const phrase3 = lastAlphaPhrase(leftWords, 3).toLowerCase();
  const phrase2 = lastAlphaPhrase(leftWords, 2).toLowerCase();
  const phrase1 = lastAlphaPhrase(leftWords, 1).toLowerCase();

  const damageType =
    DAMAGE_TYPE_BY_TOKEN[phrase3] ??
    DAMAGE_TYPE_BY_TOKEN[phrase2] ??
    DAMAGE_TYPE_BY_TOKEN[phrase1] ??
    baseDamageType.Unknown;

  // 4) source + target (best-effort)
  let source: string | undefined;

  if (left.startsWith('Your ')) {
    source = 'You';
  } else {
    const apostropheIdx = left.indexOf("'s ");
    if (apostropheIdx !== -1) {
      source = left.slice(0, apostropheIdx).trim() || undefined;
    }
  }

  // target is everything after verb, removing punctuation
  const target = right.replace(/[.!]+$/g, '').trim() || undefined;

  return {
    verb,
    amount,
    damageType,
    source,
    target,
    raw: line,
  };
}

export function emitDamageEvent(
  dispatchUserScriptEvent: (e: { name: string; payload: any }) => void,
  payload: DamageEventPayload,
) {
  // user script event
  dispatchUserScriptEvent({
    name: 'event:damage',
    payload,
  });
}
