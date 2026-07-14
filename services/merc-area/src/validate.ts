/**
 * Semantic validation of #SCRIPTS sections, mirroring the checks the C side
 * enforces (mob_prog.c trigger vocabulary + area_reload.c stage_validate):
 * known trigger, mob defined in the same file, body within the instruction
 * budget. Shared by the server (preview 400s) and the client (live feedback).
 */

import type { AreaFile, MobScript } from './types.js';
import { SCRIPT_TRIGGERS } from './types.js';

/** Mirror of MP_MAX_LINES in merc-mud/2.4/src/mob_prog.h. */
export const MAX_SCRIPT_LINES = 256;

export interface ScriptsSummary {
  /** Total script count across all #SCRIPTS sections. */
  count: number;
  perMob: { mobVnum: number; count: number }[];
  /** Empty when the area's scripts would pass the C-side validation. */
  errors: string[];
}

export function scriptBodyLines(body: string): number {
  if (body === '') return 0;
  return body.split('\n').length;
}

export function validateScripts(area: AreaFile): ScriptsSummary {
  const scripts: MobScript[] = [];
  const mobVnums = new Set<number>();

  for (const section of area.sections) {
    if (section.kind === 'scripts') scripts.push(...section.scripts);
    if (section.kind === 'mobiles') for (const m of section.mobiles) mobVnums.add(m.vnum);
  }

  const errors: string[] = [];
  const perMobCounts = new Map<number, number>();
  const triggers = new Set<string>(SCRIPT_TRIGGERS);

  for (const s of scripts) {
    perMobCounts.set(s.mobVnum, (perMobCounts.get(s.mobVnum) ?? 0) + 1);
    if (!triggers.has(s.trigger)) {
      errors.push(`mob ${s.mobVnum}: unknown trigger '${s.trigger}' (known: ${SCRIPT_TRIGGERS.join(', ')})`);
    }
    if (!mobVnums.has(s.mobVnum)) {
      errors.push(`script references mob ${s.mobVnum}, which is not defined in this file's #MOBILES`);
    }
    const lines = scriptBodyLines(s.body);
    if (lines > MAX_SCRIPT_LINES) {
      errors.push(`mob ${s.mobVnum}: script body has ${lines} lines (max ${MAX_SCRIPT_LINES})`);
    }
  }

  return {
    count: scripts.length,
    perMob: [...perMobCounts.entries()]
      .map(([mobVnum, count]) => ({ mobVnum, count }))
      .sort((a, b) => a.mobVnum - b.mobVnum),
    errors,
  };
}
