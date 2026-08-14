import {
  referencesTo,
  type AreaFile,
  type AreaHeaderSection,
  type AreaSection,
  type Mobile,
  type MudObject,
  type RefKind,
  type Room,
  type Shop,
  type Social,
  type Special,
} from '@shatteredarchive/merc-area';

/**
 * Pure model operations behind the create/delete UI: vnum allocation from the
 * area's declared range, template entities that emit valid db.c-bootable
 * records, section-aware insertion, and reference-checked removal.
 */

export function areaHeader(area: AreaFile): AreaHeaderSection | undefined {
  return area.sections.find((s): s is AreaHeaderSection => s.kind === 'area');
}

/**
 * All vnums in use by any entity kind. Mob/object/room vnums are separate
 * namespaces in the game, but sharing one number across kinds confuses humans
 * and resets — allocation treats the range as a single namespace.
 */
export function usedVnums(area: AreaFile): Set<number> {
  const used = new Set<number>();
  for (const s of area.sections) {
    if (s.kind === 'mobiles') for (const m of s.mobiles) used.add(m.vnum);
    if (s.kind === 'objects') for (const o of s.objects) used.add(o.vnum);
    if (s.kind === 'rooms') for (const r of s.rooms) used.add(r.vnum);
  }
  return used;
}

/** First unused vnum in the area's declared min/max range, or null when full. */
export function nextFreeVnum(area: AreaFile): number | null {
  const header = areaHeader(area);
  if (!header) return null;
  const used = usedVnums(area);
  for (let v = header.minVnum; v <= header.maxVnum; v++) {
    if (!used.has(v)) return v;
  }
  return null;
}

/**
 * Insert a brand-new section before the first section of any of the given
 * kinds, or at the end when none exist.
 */
function insertSectionBefore(area: AreaFile, section: AreaSection, beforeKinds: string[]): AreaFile {
  const before = new Set(beforeKinds);
  const idx = area.sections.findIndex((s) => before.has(s.kind));
  const sections = [...area.sections];
  sections.splice(idx === -1 ? sections.length : idx, 0, section);
  return { sections };
}

/**
 * Insert a brand-new entity section where the game expects it: before the
 * first reset/shop/special/social/script section (those reference entities),
 * or at the end when none exist.
 */
function insertSection(area: AreaFile, section: AreaSection): AreaFile {
  return insertSectionBefore(area, section, ['resets', 'shops', 'specials', 'socials', 'scripts']);
}

export function addMobile(area: AreaFile, mob: Mobile): AreaFile {
  const idx = area.sections.findIndex((s) => s.kind === 'mobiles');
  if (idx === -1) return insertSection(area, { kind: 'mobiles', mobiles: [mob] });
  return {
    sections: area.sections.map((s, i) => (i === idx && s.kind === 'mobiles' ? { ...s, mobiles: [...s.mobiles, mob] } : s)),
  };
}

export function addObject(area: AreaFile, obj: MudObject): AreaFile {
  const idx = area.sections.findIndex((s) => s.kind === 'objects');
  if (idx === -1) return insertSection(area, { kind: 'objects', objects: [obj] });
  return {
    sections: area.sections.map((s, i) => (i === idx && s.kind === 'objects' ? { ...s, objects: [...s.objects, obj] } : s)),
  };
}

export function addRoom(area: AreaFile, room: Room): AreaFile {
  const idx = area.sections.findIndex((s) => s.kind === 'rooms');
  if (idx === -1) return insertSection(area, { kind: 'rooms', rooms: [room] });
  return {
    sections: area.sections.map((s, i) => (i === idx && s.kind === 'rooms' ? { ...s, rooms: [...s.rooms, room] } : s)),
  };
}

/** The model with one entity removed (sections themselves are kept, even empty). */
export function removeEntity(area: AreaFile, kind: RefKind, vnum: number): AreaFile {
  return {
    sections: area.sections.map((s) => {
      if (kind === 'mob' && s.kind === 'mobiles') return { ...s, mobiles: s.mobiles.filter((m) => m.vnum !== vnum) };
      if (kind === 'object' && s.kind === 'objects') return { ...s, objects: s.objects.filter((o) => o.vnum !== vnum) };
      if (kind === 'room' && s.kind === 'rooms') return { ...s, rooms: s.rooms.filter((r) => r.vnum !== vnum) };
      return s;
    }),
  };
}

/**
 * What still references the entity AFTER it is removed — the lines that would
 * dangle. Computed on the post-delete model so an entity's own outgoing
 * references (a room's exits, self-links) never block its deletion.
 */
export function deleteBlockers(area: AreaFile, kind: RefKind, vnum: number): string[] {
  return referencesTo(removeEntity(area, kind, vnum), kind, vnum).map((r) => r.where);
}

// ── Shops and specials (keyed by the mob's vnum) ─────────────────────────────

export function getShop(area: AreaFile, keeper: number): Shop | undefined {
  for (const s of area.sections) {
    if (s.kind === 'shops') {
      const shop = s.shops.find((sh) => sh.keeper === keeper);
      if (shop) return shop;
    }
  }
  return undefined;
}

/** Sensible open-all-day shop with no trade restrictions. */
export function newShopTemplate(keeper: number): Shop {
  return {
    keeper,
    buyTypes: [0, 0, 0, 0, 0],
    profitBuy: 100,
    profitSell: 100,
    openHour: 0,
    closeHour: 23,
    comment: '',
  };
}

/** Replace the keeper's shop (or add one); creates the #SHOPS section on first use. */
export function upsertShop(area: AreaFile, shop: Shop): AreaFile {
  const idx = area.sections.findIndex((s) => s.kind === 'shops');
  if (idx === -1) {
    return insertSectionBefore(area, { kind: 'shops', shops: [shop] }, ['specials', 'socials', 'scripts']);
  }
  return {
    sections: area.sections.map((s, i) => {
      if (i !== idx || s.kind !== 'shops') return s;
      const existing = s.shops.findIndex((sh) => sh.keeper === shop.keeper);
      const shops = existing === -1 ? [...s.shops, shop] : s.shops.map((sh, j) => (j === existing ? shop : sh));
      return { ...s, shops };
    }),
  };
}

export function removeShop(area: AreaFile, keeper: number): AreaFile {
  return {
    sections: area.sections.map((s) =>
      s.kind === 'shops' ? { ...s, shops: s.shops.filter((sh) => sh.keeper !== keeper) } : s,
    ),
  };
}

/** The mob's spec_fun word, if any (`M <vnum> <spec_fun>` in #SPECIALS). */
export function getSpecial(area: AreaFile, mobVnum: number): string | undefined {
  for (const s of area.sections) {
    if (s.kind === 'specials') {
      for (const sp of s.specials) {
        if (sp.command === 'M' && sp.mobVnum === mobVnum) return sp.specFun;
      }
    }
  }
  return undefined;
}

/** Set or replace the mob's spec_fun; creates the #SPECIALS section on first use. */
export function setSpecial(area: AreaFile, mobVnum: number, specFun: string): AreaFile {
  const entry: Special = { command: 'M', mobVnum, specFun, comment: '' };
  const idx = area.sections.findIndex((s) => s.kind === 'specials');
  if (idx === -1) {
    return insertSectionBefore(area, { kind: 'specials', specials: [entry] }, ['socials', 'scripts']);
  }
  return {
    sections: area.sections.map((s, i) => {
      if (i !== idx || s.kind !== 'specials') return s;
      const existing = s.specials.findIndex((sp) => sp.command === 'M' && sp.mobVnum === mobVnum);
      const specials =
        existing === -1 ? [...s.specials, entry] : s.specials.map((sp, j) => (j === existing ? entry : sp));
      return { ...s, specials };
    }),
  };
}

export function removeSpecial(area: AreaFile, mobVnum: number): AreaFile {
  return {
    sections: area.sections.map((s) =>
      s.kind === 'specials'
        ? { ...s, specials: s.specials.filter((sp) => !(sp.command === 'M' && sp.mobVnum === mobVnum)) }
        : s,
    ),
  };
}

/** All socials in file order (usually only social.are has any). */
export function socialsOf(area: AreaFile): Social[] {
  return area.sections.flatMap((s) => (s.kind === 'socials' ? s.socials : []));
}

/**
 * A friendly starting social: the two no-argument messages set, the other six
 * unset (`$`). Empty-string fields are unrepresentable in the file format, so
 * the editor maps blank inputs to null.
 */
export function newSocialTemplate(name: string): Social {
  return {
    name,
    nameComment: '',
    fields: [`You ${name}.`, `$n ${name}s.`, null, null, null, null, null, null],
  };
}

/**
 * Replace the social named `matchName` (or append when absent); creates the
 * #SOCIALS section on first use — after entities/shops/specials, before
 * scripts, matching stock file order.
 */
export function upsertSocial(area: AreaFile, social: Social, matchName?: string): AreaFile {
  const key = (matchName ?? social.name).toLowerCase();
  const idx = area.sections.findIndex((s) => s.kind === 'socials');
  if (idx === -1) {
    return insertSectionBefore(area, { kind: 'socials', socials: [social] }, ['scripts']);
  }
  return {
    sections: area.sections.map((s, i) => {
      if (i !== idx || s.kind !== 'socials') return s;
      const existing = s.socials.findIndex((so) => so.name.toLowerCase() === key);
      const socials =
        existing === -1 ? [...s.socials, social] : s.socials.map((so, j) => (j === existing ? social : so));
      return { ...s, socials };
    }),
  };
}

export function removeSocial(area: AreaFile, name: string): AreaFile {
  const key = name.toLowerCase();
  return {
    sections: area.sections.map((s) =>
      s.kind === 'socials' ? { ...s, socials: s.socials.filter((so) => so.name.toLowerCase() !== key) } : s,
    ),
  };
}

/** Minimal valid mob: boots in db2.c load_mobiles, act includes IS_NPC ('A'). */
export function newMobTemplate(vnum: number): Mobile {
  return {
    vnum,
    name: 'new mob',
    shortDescr: 'a new mob',
    longDescr: 'A new mob is standing here.\n',
    description: 'It looks freshly created and slightly confused.\n',
    race: 'human',
    act: 1,
    affectedBy: 0,
    alignment: 0,
    group: 0,
    level: 1,
    hitroll: 0,
    hit: { number: 1, type: 8, bonus: 10 },
    mana: { number: 1, type: 8, bonus: 100 },
    damage: { number: 1, type: 4, bonus: 0 },
    damType: 'slash',
    ac: [0, 0, 0, 0],
    offFlags: 0,
    immFlags: 0,
    resFlags: 0,
    vulnFlags: 0,
    startPos: 'stand',
    defaultPos: 'stand',
    sex: 'either',
    wealth: 0,
    form: 0,
    parts: 0,
    size: 'medium',
    material: 'unknown',
    flagRemovals: [],
  };
}

/** Minimal valid object: takeable trash with all-numeric values. */
export function newObjectTemplate(vnum: number): MudObject {
  return {
    vnum,
    name: 'new object',
    shortDescr: 'a new object',
    description: 'A new object lies here.',
    material: 'unknown',
    itemType: 'trash',
    extraFlags: 0,
    wearFlags: 1,
    values: [0, 0, 0, 0, 0],
    level: 0,
    weight: 1,
    cost: 0,
    condition: 'P',
    affects: [],
    flagAffects: [],
    extraDescrs: [],
  };
}

/** Minimal valid room: no exits yet (link it up in the editor). */
export function newRoomTemplate(vnum: number): Room {
  return {
    vnum,
    name: 'A New Room',
    description: 'A freshly dug room. The walls are still damp.\n',
    areaNumber: 0,
    roomFlags: 0,
    sectorType: 0,
    exits: [],
    extraDescrs: [],
  };
}
