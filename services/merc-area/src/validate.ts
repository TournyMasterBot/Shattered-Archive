/**
 * Semantic validation shared by the server (preview/save 400s) and the client
 * (live feedback): #SCRIPTS checks mirroring the C side (mob_prog.c trigger
 * vocabulary + area_reload.c stage_validate), and vnum reference integrity
 * (validateRefs/referencesTo) over resets, exits, shops, specials, and scripts.
 */

import type { AreaFile, MobScript } from './types.js';
import { ROOM_SCRIPT_TRIGGERS, SCRIPT_TRIGGERS, SPEC_FUNS } from './types.js';

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
  const roomVnums = new Set<number>();
  let scriptsSectionIndex = -1;
  let roomsSectionIndex = -1;

  area.sections.forEach((section, i) => {
    if (section.kind === 'scripts') {
      if (scriptsSectionIndex === -1) scriptsSectionIndex = i;
      scripts.push(...section.scripts);
    }
    if (section.kind === 'mobiles') for (const m of section.mobiles) mobVnums.add(m.vnum);
    if (section.kind === 'rooms') {
      if (roomsSectionIndex === -1) roomsSectionIndex = i;
      for (const r of section.rooms) roomVnums.add(r.vnum);
    }
  });

  const errors: string[] = [];
  const perMobCounts = new Map<number, number>();
  const triggers = new Set<string>(SCRIPT_TRIGGERS);
  const roomTriggers = new Set<string>(ROOM_SCRIPT_TRIGGERS);

  for (const s of scripts) {
    perMobCounts.set(s.mobVnum, (perMobCounts.get(s.mobVnum) ?? 0) + 1);
    if (s.attach === 'room') {
      if (!roomTriggers.has(s.trigger)) {
        errors.push(`room ${s.mobVnum}: unknown room trigger '${s.trigger}' (known: ${ROOM_SCRIPT_TRIGGERS.join(', ')})`);
      }
      if (!roomVnums.has(s.mobVnum)) {
        errors.push(`room script references room ${s.mobVnum}, which is not defined in this file's #ROOMS`);
      } else if (roomsSectionIndex > scriptsSectionIndex) {
        // db.c loads sections in file order; an R entry before its #ROOMS
        // would hit get_room_index == NULL at boot — exit(1).
        errors.push(
          `room script for room ${s.mobVnum}: the #SCRIPTS section must come AFTER #ROOMS (the game loads in file order and exits at boot otherwise)`,
        );
      }
    } else {
      if (!triggers.has(s.trigger)) {
        errors.push(`mob ${s.mobVnum}: unknown trigger '${s.trigger}' (known: ${SCRIPT_TRIGGERS.join(', ')})`);
      }
      if (!mobVnums.has(s.mobVnum)) {
        errors.push(`script references mob ${s.mobVnum}, which is not defined in this file's #MOBILES`);
      }
    }
    const lines = scriptBodyLines(s.body);
    if (lines > MAX_SCRIPT_LINES) {
      errors.push(`${s.attach === 'room' ? 'room' : 'mob'} ${s.mobVnum}: script body has ${lines} lines (max ${MAX_SCRIPT_LINES})`);
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

// ── Vnum reference integrity ─────────────────────────────────────────────────

export type RefKind = 'mob' | 'object' | 'room';

/** One place in the file that names an entity by vnum. */
export interface VnumRef {
  kind: RefKind;
  vnum: number;
  /** Human-readable source, e.g. "reset #3 (M): mob 3700 into room 3701". */
  where: string;
  /**
   * Soft references never block a save even when dangling in-range: exit KEY
   * vnums (stock draconia/hitower ship dangling keys; the game just leaves the
   * door unpickable). They still count for delete-blocking.
   */
  soft?: boolean;
}

export interface RefsSummary {
  /** Every vnum reference found in the file. */
  refs: VnumRef[];
  /**
   * References to vnums inside this area's declared min/max range that are NOT
   * defined in this file — a broken link the game would log at reset time.
   * Save-blocking, like ScriptsSummary.errors.
   */
  errors: string[];
  /**
   * References to vnums outside the declared range with no local definition.
   * Without a resolver these are assumed links into another area (school.are
   * links outward), never blocking. WITH a resolver (validateRefs opts), only
   * vnums no listed area defines land here — real issues, not assumptions.
   */
  warnings: string[];
  /**
   * Cross-area references PROVEN to exist (resolver provided and it found the
   * vnum): where the ref sits, plus the defining file and entity name — enough
   * for a UI to link straight to the target. Empty without a resolver.
   */
  external: ExternalVnumRef[];
}

/** A locally-missing vnum reference resolved to its defining area. */
export interface ExternalVnumRef {
  kind: RefKind;
  vnum: number;
  where: string;
  /** Area file that defines the vnum. */
  file: string;
  /** Display name of the defining entity (room name / short description). */
  name: string;
}

export interface ValidateRefsOptions {
  /**
   * World lookup for vnums not defined in this file: return the defining
   * file + entity name, or null when nothing defines it. Supplying this turns
   * "(assumed to live in another area)" warnings into resolved external refs
   * or hard "no listed area defines it" warnings.
   */
  resolveExternal?: (kind: RefKind, vnum: number) => { file: string; name: string } | null;
}

/** Entity definition surface of one file — what a world index is built from. */
export function collectDefinedEntities(area: AreaFile): { kind: RefKind; vnum: number; name: string }[] {
  const out: { kind: RefKind; vnum: number; name: string }[] = [];
  for (const section of area.sections) {
    if (section.kind === 'mobiles') for (const m of section.mobiles) out.push({ kind: 'mob', vnum: m.vnum, name: m.shortDescr });
    if (section.kind === 'objects') for (const o of section.objects) out.push({ kind: 'object', vnum: o.vnum, name: o.shortDescr });
    if (section.kind === 'rooms') for (const r of section.rooms) out.push({ kind: 'room', vnum: r.vnum, name: r.name });
  }
  return out;
}

/**
 * Collect every vnum reference, mirroring how db.c consumes each record:
 * resets (load_resets/reset_area arg meanings per command letter), room exit
 * destinations and keys, shop keepers, specials, and script attachments.
 * Unknown reset commands contribute nothing (they are preserved verbatim).
 */
export function collectRefs(area: AreaFile): VnumRef[] {
  const refs: VnumRef[] = [];
  const add = (kind: RefKind, vnum: number, where: string, soft?: boolean) => {
    if (vnum > 0) refs.push(soft ? { kind, vnum, where, soft } : { kind, vnum, where });
  };

  for (const section of area.sections) {
    switch (section.kind) {
      case 'resets': {
        let i = 0;
        for (const r of section.resets) {
          i++;
          if (r.command === '*') continue;
          const at = `reset #${i} (${r.command})`;
          switch (r.command) {
            case 'M':
              add('mob', r.arg1, `${at}: mob ${r.arg1} into room ${r.arg3}`);
              add('room', r.arg3, `${at}: mob ${r.arg1} into room ${r.arg3}`);
              break;
            case 'O':
              add('object', r.arg1, `${at}: object ${r.arg1} into room ${r.arg3}`);
              add('room', r.arg3, `${at}: object ${r.arg1} into room ${r.arg3}`);
              break;
            case 'P':
              add('object', r.arg1, `${at}: object ${r.arg1} inside object ${r.arg3}`);
              add('object', r.arg3, `${at}: object ${r.arg1} inside object ${r.arg3}`);
              break;
            case 'G':
              add('object', r.arg1, `${at}: object ${r.arg1} to the previous mob's inventory`);
              break;
            case 'E':
              add('object', r.arg1, `${at}: object ${r.arg1} equipped on the previous mob`);
              break;
            case 'D':
              add('room', r.arg1, `${at}: door state in room ${r.arg1}`);
              break;
            case 'R':
              add('room', r.arg1, `${at}: randomize exits of room ${r.arg1}`);
              break;
          }
        }
        break;
      }
      case 'rooms':
        for (const room of section.rooms) {
          for (const ex of room.exits) {
            add('room', ex.toVnum, `room ${room.vnum} exit ${ex.door}: leads to room ${ex.toVnum}`);
            add('object', ex.key, `room ${room.vnum} exit ${ex.door}: key object ${ex.key}`, true);
          }
        }
        break;
      case 'shops':
        for (const shop of section.shops) {
          add('mob', shop.keeper, `shop: keeper mob ${shop.keeper}`);
        }
        break;
      case 'specials':
        for (const sp of section.specials) {
          if (sp.command === 'M') add('mob', sp.mobVnum, `special: ${sp.specFun} on mob ${sp.mobVnum}`);
        }
        break;
      case 'scripts':
        for (const sc of section.scripts) {
          if (sc.attach === 'room') {
            add('room', sc.mobVnum, `room script (${sc.trigger}) attached to room ${sc.mobVnum}`);
          } else {
            add('mob', sc.mobVnum, `script (${sc.trigger}) attached to mob ${sc.mobVnum}`);
          }
          // `warp <vnum>` teleport targets are room refs like exit
          // destinations — resolvable cross-area, error when in-range dangling.
          for (const line of sc.body.split('\n')) {
            const m = /^\s*warp\s+(-?\d+)/.exec(line);
            if (m) {
              add(
                'room',
                Number(m[1]),
                `script on ${sc.attach === 'room' ? 'room' : 'mob'} ${sc.mobVnum}: warp to room ${m[1]}`,
              );
            }
          }
        }
        break;
    }
  }
  return refs;
}

function definedVnums(area: AreaFile): Record<RefKind, Set<number>> {
  const defined: Record<RefKind, Set<number>> = { mob: new Set(), object: new Set(), room: new Set() };
  for (const section of area.sections) {
    if (section.kind === 'mobiles') for (const m of section.mobiles) defined.mob.add(m.vnum);
    if (section.kind === 'objects') for (const o of section.objects) defined.object.add(o.vnum);
    if (section.kind === 'rooms') for (const r of section.rooms) defined.room.add(r.vnum);
  }
  return defined;
}

/**
 * Entity vnums (mobs/objects/rooms) defined in the file that fall outside the
 * given range, sorted ascending. Used to guard #AREA header range shrinks: a
 * range that no longer covers a defined vnum breaks reset/area bookkeeping.
 */
export function vnumsOutsideRange(area: AreaFile, minVnum: number, maxVnum: number): number[] {
  const defined = definedVnums(area);
  const outside = new Set<number>();
  for (const kind of ['mob', 'object', 'room'] as RefKind[]) {
    for (const v of defined[kind]) {
      if (v < minVnum || v > maxVnum) outside.add(v);
    }
  }
  return [...outside].sort((a, b) => a - b);
}

/**
 * Mirror of special.c spec_lookup: a name the game accepts is a non-empty
 * case-insensitive PREFIX of one of the spec_table entries. An unmatched name
 * makes boot exit(1), so the caller treats it as a save-blocking error.
 */
export function isKnownSpecFun(name: string): boolean {
  if (name === '') return false;
  const lower = name.toLowerCase();
  return SPEC_FUNS.some((known) => known.startsWith(lower));
}

export function validateRefs(area: AreaFile, opts: ValidateRefsOptions = {}): RefsSummary {
  const refs = collectRefs(area);
  const defined = definedVnums(area);
  const header = area.sections.find((s) => s.kind === 'area');

  const errors: string[] = [];
  const warnings: string[] = [];
  const external: ExternalVnumRef[] = [];
  for (const ref of refs) {
    if (defined[ref.kind].has(ref.vnum)) continue;
    const inRange = header !== undefined && ref.vnum >= header.minVnum && ref.vnum <= header.maxVnum;
    const msg = `${ref.where} — ${ref.kind} ${ref.vnum} is not defined in this file`;
    // In-range hard refs stay ERRORS even with a resolver: a vnum inside this
    // area's own declared range defined by some OTHER file is a range overlap
    // smell, not a healthy cross-area link.
    if (inRange && !ref.soft) {
      errors.push(msg);
      continue;
    }
    const hit = opts.resolveExternal?.(ref.kind, ref.vnum) ?? null;
    if (hit) {
      external.push({ kind: ref.kind, vnum: ref.vnum, where: ref.where, file: hit.file, name: hit.name });
      continue;
    }
    if (opts.resolveExternal) warnings.push(inRange ? msg : `${msg} or any listed area`);
    else warnings.push(inRange ? msg : `${msg} (assumed to live in another area)`);
  }

  // D/R reset argument bounds mirror db.c load_resets, where a violation is
  // exit(1) at BOOT — save-blocking here so the builder can never write one.
  // Doors run 0-9 since the Phase 12b diagonal engine extension.
  let resetIndex = 0;
  for (const section of area.sections) {
    if (section.kind !== 'resets') continue;
    for (const r of section.resets) {
      resetIndex++;
      if (r.command === 'D') {
        if (r.arg2 < 0 || r.arg2 > 9)
          errors.push(`reset #${resetIndex} (D): bad exit ${r.arg2} — the game exits at boot (db.c load_resets)`);
        if (r.arg3 < 0 || r.arg3 > 2)
          errors.push(`reset #${resetIndex} (D): bad locks ${r.arg3} — the game exits at boot (db.c load_resets)`);
      }
      if (r.command === 'R' && (r.arg2 < 0 || r.arg2 > 10))
        errors.push(`reset #${resetIndex} (R): bad exit count ${r.arg2} — the game exits at boot (db.c load_resets)`);
    }
  }

  // Shop/special semantics beyond vnum existence (db.c load_shops/load_specials):
  // a second shop for the same keeper silently replaces the first on the mob
  // (both stay allocated) — error; an unknown spec_fun is fatal at boot — error;
  // a second special on the same mob overwrites the first (last wins) — warning.
  const shopKeepers = new Set<number>();
  const specialMobs = new Set<number>();
  for (const section of area.sections) {
    if (section.kind === 'shops') {
      for (const shop of section.shops) {
        if (shopKeepers.has(shop.keeper)) {
          errors.push(`shop: duplicate shop for keeper mob ${shop.keeper} — the game keeps only the last one`);
        }
        shopKeepers.add(shop.keeper);
      }
    }
    if (section.kind === 'specials') {
      for (const sp of section.specials) {
        if (sp.command !== 'M') continue;
        if (!isKnownSpecFun(sp.specFun)) {
          errors.push(`special: unknown spec_fun '${sp.specFun}' on mob ${sp.mobVnum} — the game would refuse to boot`);
        }
        if (specialMobs.has(sp.mobVnum)) {
          warnings.push(`special: mob ${sp.mobVnum} has more than one spec_fun — the game keeps only the last one`);
        }
        specialMobs.add(sp.mobVnum);
      }
    }
  }

  return { refs, errors, warnings, external };
}

/**
 * Reverse index for delete-blocking: everything in the file that references
 * this entity. A non-empty result means deleting the entity would leave
 * dangling lines behind.
 */
export function referencesTo(area: AreaFile, kind: RefKind, vnum: number): VnumRef[] {
  return collectRefs(area).filter((r) => r.kind === kind && r.vnum === vnum);
}
