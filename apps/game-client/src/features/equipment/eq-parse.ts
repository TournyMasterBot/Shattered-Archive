// apps\game-client\src\features\equipment\eq-parse.ts
import type { EqSlot, EquipmentSnapshot } from './equipment-types';

function stripAnsi(input: string): string {
  return String(input ?? '').replace(/\u001b\[[0-9;]*m/g, '');
}

function normalizeLine(input: string): string {
  return stripAnsi(input).replace(/\r?\n/g, '').trim();
}

export function isEqHeader(line: string): boolean {
  return normalizeLine(line).toLowerCase() === 'you are using:';
}

export function isEqEnd(line: string): boolean {
  // eq terminates with a blank line
  return normalizeLine(line).length === 0;
}

const TAG_MAP: Record<string, EqSlot> = {
  'used as light': 'used_as_light',
  'worn on finger': 'worn_on_finger',
  'worn around neck': 'worn_around_neck',
  'worn on torso': 'worn_on_torso',
  'worn on head': 'worn_on_head',
  'worn on legs': 'worn_on_legs',
  'worn on feet': 'worn_on_feet',
  'worn on hands': 'worn_on_hands',
  'worn on arms': 'worn_on_arms',
  'worn as shield': 'worn_as_shield',
  'worn about body': 'worn_about_body',
  'worn about waist': 'worn_about_waist',
  'worn around wrist': 'worn_around_wrist',
  wielded: 'wielded',
  held: 'held',
  'floating nearby': 'floating_nearby',
  'secondary weapon': 'secondary_weapon',
  sheathed: 'sheathed',
  'worn as quiver': 'worn_as_quiver',
};

export function buildEqSnapshot(lines: string[]): EquipmentSnapshot {
  const ts = Date.now();

  const slots = {} as Record<EqSlot, { slot: EqSlot; rawLine: string; updatedAt: number }>;
  const allLines: string[] = [];

  for (const raw of lines) {
    const s = normalizeLine(raw);
    if (!s) continue;
    allLines.push(s);

    const m = s.match(/^<([^>]+)>\s*(.+)$/);
    if (!m) continue;

    const tag = m[1].toLowerCase().trim();
    const slot = TAG_MAP[tag];
    if (!slot) continue;

    const value = (m[2] ?? '').trim();
    slots[slot] = {
      slot,
      rawLine: value.length ? value : '(nothing)',
      updatedAt: ts,
    };
  }

  return {
    updatedAt: ts,
    slots,
    allLines,
  };
}
