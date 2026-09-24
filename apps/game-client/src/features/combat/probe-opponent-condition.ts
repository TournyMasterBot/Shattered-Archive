// apps\game-client\src\features\combat\probe-opponent-condition.ts
import { OPPONENT_BUCKETS } from './opponent-buckets';
import { OPPONENT_GATES } from './opponent-gates';
import { OpponentStatusDetail } from './opponent-types';

export function ProbeOpponentConditionLine(lineText: string): OpponentStatusDetail | null {
  // Fast gate: avoid any allocations unless we see likely keywords.
  let gated = false;
  for (let i = 0; i < OPPONENT_GATES.length; i++) {
    if (lineText.indexOf(OPPONENT_GATES[i]) !== -1) {
      gated = true;
      break;
    }
  }
  if (!gated) return null;

  // Deliberately NOT stripping ANSI here: mob names are often colored
  // (e.g. "\x1b[0;36mmerman\x1b[0m"), and RightSidebar/CompactVitalsRow
  // render the extracted label through ansiToHtml so the color survives
  // into the UI instead of being discarded.
  const clean = lineText;
  if (!clean) return null;

  for (let i = 0; i < OPPONENT_BUCKETS.length; i++) {
    const b = OPPONENT_BUCKETS[i];
    const idx = clean.indexOf(b.phrase);
    if (idx === -1) continue;

    // Best-effort label extraction: everything before the matched phrase.
    // (This might include "The troll is"/"The troll has"; we trim that down a bit.)
    let label = clean.slice(0, idx).trim();

    // Remove trailing verb if present (common patterns: "... is", "... has")
    if (label.endsWith(' is')) label = label.slice(0, -3).trim();
    if (label.endsWith(' has')) label = label.slice(0, -4).trim();

    // Some lines might have extra punctuation before the phrase
    label = label.replace(/[,\-:]+$/g, '').trim();

    const range = b.min === b.max ? `${b.est}%` : `${b.est}% (${b.min}%–${b.max}%)`;

    return {
      ts: Date.now(),
      label: label || undefined,
      pct: b.est,
      minPct: b.min,
      maxPct: b.max,
      statusText: range,
    };
  }

  return null;
}
