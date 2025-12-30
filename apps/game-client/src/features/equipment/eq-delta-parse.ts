import type { EquipmentSnapshot, EqSlot, EquipmentSlotSnapshot } from './equipment-types';

export function stripAnsi(input: string): string {
  return String(input ?? '').replace(/\u001b\[[0-9;]*m/g, '');
}

export function normalizeEqText(input: string): string {
  return stripAnsi(input).replace(/\r?\n/g, '').trim();
}

function ensureSnapshot(snap: EquipmentSnapshot | undefined): EquipmentSnapshot {
  if (snap) return snap;
  return { updatedAt: Date.now(), slots: {} as any, allLines: [] };
}

function upsertSlot(snap: EquipmentSnapshot, slot: EqSlot, rawLine: string, ts: number): EquipmentSnapshot {
  console.debug('[eq-delta] upsertSlot', { slot, rawLine });

  const nextSlots: Record<EqSlot, EquipmentSlotSnapshot> = {
    ...(snap.slots as any),
  };

  nextSlots[slot] = {
    slot,
    rawLine: rawLine && rawLine.length ? rawLine : '(nothing)',
    updatedAt: ts,
  };

  const allLines = Array.isArray(snap.allLines) ? snap.allLines.slice() : [];
  allLines.push(`<${slot}> ${nextSlots[slot].rawLine}`);

  return {
    updatedAt: ts,
    slots: nextSlots,
    allLines,
  };
}

/**
 * Parses lines like:
 * - "You wear X on your left finger."
 * - "You wear X around your neck."
 * - "You wear X as a shield."
 */
export function applyWearLineToSnapshot(
  existing: EquipmentSnapshot | undefined,
  line: string,
): EquipmentSnapshot | null {
  const ts = Date.now();
  const snap = ensureSnapshot(existing);
  const s = normalizeEqText(line);

  console.debug('[eq-delta] applyWearLine', { s });

  if (!s.startsWith('You wear ')) return null;

  const rest = s.slice('You wear '.length);

  const rules: Array<[RegExp, EqSlot]> = [
    [/on your (left|right) finger\.$/i, 'worn_on_finger'],
    [/around your neck\.$/i, 'worn_around_neck'],
    [/on your torso\.$/i, 'worn_on_torso'],
    [/on your head\.$/i, 'worn_on_head'],
    [/on your legs\.$/i, 'worn_on_legs'],
    [/on your feet\.$/i, 'worn_on_feet'],
    [/on your hands\.$/i, 'worn_on_hands'],
    [/on your arms\.$/i, 'worn_on_arms'],
    [/as a shield\.$/i, 'worn_as_shield'],
    [/about your waist\.$/i, 'worn_about_waist'],
    [/around your (left|right) wrist\.$/i, 'worn_around_wrist'],
  ];

  for (const [rx, slot] of rules) {
    if (rx.test(rest)) {
      const item = rest.replace(rx, '').trim();
      console.info('[eq-delta] wear matched', { slot, item });
      return upsertSlot(snap, slot, item, ts);
    }
  }

  console.warn('[eq-delta] wear unmatched', { line: s });
  return null;
}
