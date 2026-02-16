event:damage
omit from output, don't require trigger match

```typescript
const p: any = api?.event?.payload ?? {};
const key = String(p.key ?? '');
const amount = p.amount;

const GREEN = new Set<string>([
  'decimates','decimate','devastates','devastate','scratches','scratch','injures','injure',
  'wounds','wound','mauls','maul','maims','maim','grazes','graze','hits','hit',
  // remove miss/misses from GREEN
]);

const YELLOW = new Set<string>([
  'DISEMBOWELS','DISEMBOWEL','DISMEMBERS','DISMEMBER','MASSACRES','MASSACRE',
  'MUTILATES','MUTILATE','MANGLES','MANGLE',
]);

const RED = new Set<string>([
  'OBLITERATES','OBLITERATE','ANNIHILATES','ANNIHILATE','ERADICATES','ERADICATE',
  'DEMOLISHES','DEMOLISH','DEVASTATES','DEVASTATE',
]);

function damageDslColor(k: string): string {
  if (k === 'UNSPEAKABLE') return '{W';
  if (k === 'miss' || k === 'misses') return '{y';
  if (GREEN.has(k)) return '{g';
  if (YELLOW.has(k)) return '{Y';
  if (RED.has(k)) return '{R';
  return '{x';
}

const amtColor = damageDslColor(key);
const rawLine = String(p.rawText ?? p.line ?? '').replace(/\r?\n$/, '');

writeTerminal(`${rawLine} {B({x ${amtColor}${amount}{x {B){x\n`);
```