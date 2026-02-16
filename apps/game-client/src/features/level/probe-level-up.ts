// apps/game-client/src/features/level/probe-level-up.ts

export type LevelUpEventPayload = {
  ts: number;
  hitPoints: number;
  mana: number;
  move: number;
  practices: number;
  text: string;
};

const GATE_RAISE = 'You raise a level!!';
const GATE_GAIN = 'You gain ';

function skipSpaces(s: string, i: number): number {
  while (i < s.length) {
    const c = s.charCodeAt(i);
    if (c !== 32 && c !== 9 && c !== 13 && c !== 10) break;
    i++;
  }
  return i;
}

function readUInt(s: string, i: number): { value: number; next: number } | null {
  let v = 0;
  let any = false;
  while (i < s.length) {
    const c = s.charCodeAt(i);
    if (c < 48 || c > 57) break;
    any = true;
    v = v * 10 + (c - 48);
    i++;
  }
  return any ? { value: v, next: i } : null;
}

export function ProbeLevelUpLine(lineText: string): LevelUpEventPayload | null {
  // Fast gate: avoid allocations unless it looks like the exact line.
  if (lineText.indexOf(GATE_RAISE) === -1) return null;
  if (lineText.indexOf(GATE_GAIN) === -1) return null;

  const gainIdx = lineText.indexOf(GATE_GAIN);
  if (gainIdx === -1) return null;

  let p = gainIdx + GATE_GAIN.length;
  p = skipSpaces(lineText, p);

  const hpN = readUInt(lineText, p);
  if (!hpN) return null;
  p = hpN.next;

  const hpWord = lineText.indexOf(' hit points', p);
  if (hpWord === -1) return null;
  p = hpWord + 11;

  const comma1 = lineText.indexOf(',', p);
  if (comma1 === -1) return null;
  p = skipSpaces(lineText, comma1 + 1);

  const manaN = readUInt(lineText, p);
  if (!manaN) return null;
  p = manaN.next;

  const manaWord = lineText.indexOf(' mana', p);
  if (manaWord === -1) return null;
  p = manaWord + 5;

  const comma2 = lineText.indexOf(',', p);
  if (comma2 === -1) return null;
  p = skipSpaces(lineText, comma2 + 1);

  const moveN = readUInt(lineText, p);
  if (!moveN) return null;
  p = moveN.next;

  const moveWord = lineText.indexOf(' move', p);
  if (moveWord === -1) return null;
  p = moveWord + 5;

  const comma3 = lineText.indexOf(',', p);
  if (comma3 === -1) return null;
  p = skipSpaces(lineText, comma3 + 1);

  if (lineText.startsWith('and ', p)) p += 4;
  p = skipSpaces(lineText, p);

  const pracN = readUInt(lineText, p);
  if (!pracN) return null;
  p = pracN.next;

  const pracWord = lineText.indexOf(' practices.', p);
  if (pracWord === -1) return null;

  return {
    ts: Date.now(),
    hitPoints: hpN.value,
    mana: manaN.value,
    move: moveN.value,
    practices: pracN.value,
    text: lineText,
  };
}
