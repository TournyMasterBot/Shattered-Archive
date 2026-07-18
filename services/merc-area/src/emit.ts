/**
 * Emitter for Merc 2.4 area files. Produces text that merc-mud/2.4/src/db.c
 * boots directly. Flags are emitted in db.c's letter form ('A'=1 … 'z'=2^51,
 * the spelling hand-written area files use; decimal only for values letters
 * cannot express), strings as tilde-terminated blocks, and words are quoted
 * when they contain whitespace (fread_word supports '/" quoting).
 *
 * Guarantee (verified by the round-trip suite): parse(emit(area)) is
 * deep-equal to area for any model produced by parseAreaFile.
 */

import type {
  AreaFile,
  AreaSection,
  AreaHeaderSection,
  HelpsSection,
  MobilesSection,
  Mobile,
  Dice,
  ObjectsSection,
  MudObject,
  RoomsSection,
  Room,
  ResetsSection,
  ShopsSection,
  SpecialsSection,
  SocialsSection,
  ScriptsSection,
} from './types.js';
import { objValueKinds } from './types.js';

export class EmitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmitError';
  }
}

/** Tilde-terminated string. The content itself must not contain '~'. */
function str(s: string, what: string): string {
  if (s.includes('~')) {
    throw new EmitError(`${what} contains '~', which cannot be represented in an area file`);
  }
  return `${s}~\n`;
}

/** Single word token; quoted when empty or containing whitespace. */
function word(w: string, what: string): string {
  if (/\s/.test(w) || w === '') {
    if (!w.includes("'")) return `'${w}'`;
    if (!w.includes('"')) return `"${w}"`;
    throw new EmitError(`${what} contains whitespace plus both quote characters: ${JSON.stringify(w)}`);
  }
  if (w.includes('~')) {
    throw new EmitError(`${what} contains '~': ${JSON.stringify(w)}`);
  }
  return w;
}

function dice(d: Dice): string {
  return `${d.number}d${d.type}+${d.bonus}`;
}

/**
 * Flag vector in db.c's letter form ('A'=1 … 'Z'=2^25, 'a'=2^26 … 'z'=2^51),
 * the spelling hand-written area files use. Zero, negatives, and bits beyond
 * 'z' fall back to decimal, which fread_flag accepts equally. Bit tests use
 * division (not `&`) because JS bitwise ops truncate to 32 bits.
 */
function flag(n: number): string {
  if (!Number.isSafeInteger(n) || n <= 0 || n >= 2 ** 52) return String(n);
  let out = '';
  for (let bit = 0; bit < 52; bit++) {
    if (Math.floor(n / 2 ** bit) % 2 === 1) {
      out += bit < 26 ? String.fromCharCode(65 + bit) : String.fromCharCode(97 + bit - 26);
    }
  }
  return out;
}

function tail(comment: string): string {
  return comment === '' ? '' : ` ${comment}`;
}

export function emitAreaFile(area: AreaFile): string {
  let out = '';
  for (const section of area.sections) {
    out += emitSection(section);
  }
  out += '#$\n';
  return out;
}

function emitSection(section: AreaSection): string {
  switch (section.kind) {
    case 'area':
      return emitAreaHeader(section);
    case 'helps':
      return emitHelps(section);
    case 'mobiles':
      return emitMobiles(section);
    case 'objects':
      return emitObjects(section);
    case 'rooms':
      return emitRooms(section);
    case 'resets':
      return emitResets(section);
    case 'shops':
      return emitShops(section);
    case 'specials':
      return emitSpecials(section);
    case 'socials':
      return emitSocials(section);
    case 'scripts':
      return emitScripts(section);
  }
}

function emitScripts(s: ScriptsSection): string {
  let out = '#SCRIPTS\n';
  for (const sc of s.scripts) {
    const what = sc.attach === 'room' ? 'room' : 'mob';
    out += `${sc.attach === 'room' ? 'R' : 'M'} ${sc.mobVnum} `;
    out += `${word(sc.trigger, `script trigger for ${what} ${sc.mobVnum}`)} `;
    out += str(sc.phrase, `script phrase for ${what} ${sc.mobVnum}`);
    out += str(sc.body, `script body for ${what} ${sc.mobVnum}`);
  }
  out += '#0\n\n';
  return out;
}

function emitAreaHeader(s: AreaHeaderSection): string {
  return (
    '#AREA\n' +
    str(s.fileName, 'area fileName') +
    str(s.name, 'area name') +
    str(s.credits, 'area credits') +
    `${s.minVnum} ${s.maxVnum}\n\n`
  );
}

function emitHelps(s: HelpsSection): string {
  let out = '#HELPS\n';
  for (const h of s.helps) {
    out += `${h.level} ${str(h.keyword, 'help keyword')}`;
    out += str(h.text, `help text for ${h.keyword}`);
    out += '\n';
  }
  out += `${s.endLevel} $~\n\n`;
  return out;
}

function emitMobiles(s: MobilesSection): string {
  let out = '#MOBILES\n';
  for (const m of s.mobiles) out += emitMobile(m);
  out += '#0\n\n';
  return out;
}

function emitMobile(m: Mobile): string {
  let out = `#${m.vnum}\n`;
  out += str(m.name, `mob #${m.vnum} name`);
  out += str(m.shortDescr, `mob #${m.vnum} shortDescr`);
  out += str(m.longDescr, `mob #${m.vnum} longDescr`);
  out += str(m.description, `mob #${m.vnum} description`);
  out += str(m.race, `mob #${m.vnum} race`);
  out += `${flag(m.act)} ${flag(m.affectedBy)} ${m.alignment} ${m.group}\n`;
  out += `${m.level} ${m.hitroll} ${dice(m.hit)} ${dice(m.mana)} ${dice(m.damage)} ${word(m.damType, `mob #${m.vnum} damType`)}\n`;
  out += `${m.ac.join(' ')}\n`;
  out += `${flag(m.offFlags)} ${flag(m.immFlags)} ${flag(m.resFlags)} ${flag(m.vulnFlags)}\n`;
  out += `${word(m.startPos, 'startPos')} ${word(m.defaultPos, 'defaultPos')} ${word(m.sex, 'sex')} ${m.wealth}\n`;
  out += `${flag(m.form)} ${flag(m.parts)} ${word(m.size, 'size')} ${word(m.material, 'material')}\n`;
  for (const f of m.flagRemovals) {
    out += `F ${word(f.field, 'flag removal field')} ${flag(f.vector)}\n`;
  }
  return out;
}

function emitObjects(s: ObjectsSection): string {
  let out = '#OBJECTS\n';
  for (const o of s.objects) out += emitObject(o);
  out += '#0\n\n';
  return out;
}

function emitObject(o: MudObject): string {
  let out = `#${o.vnum}\n`;
  out += str(o.name, `obj #${o.vnum} name`);
  out += str(o.shortDescr, `obj #${o.vnum} shortDescr`);
  out += str(o.description, `obj #${o.vnum} description`);
  out += str(o.material, `obj #${o.vnum} material`);
  out += `${word(o.itemType, `obj #${o.vnum} itemType`)} ${flag(o.extraFlags)} ${flag(o.wearFlags)}\n`;

  const kinds = objValueKinds(o.itemType);
  const values = o.values.map((v, i) => {
    if (kinds[i] === 'word') {
      if (typeof v !== 'string') throw new EmitError(`obj #${o.vnum} value[${i}] must be a word for item type '${o.itemType}'`);
      return word(v, `obj #${o.vnum} value[${i}]`);
    }
    if (typeof v !== 'number') throw new EmitError(`obj #${o.vnum} value[${i}] must be a number for item type '${o.itemType}'`);
    return kinds[i] === 'flag' ? flag(v) : String(v);
  });
  out += `${values.join(' ')}\n`;

  if (o.condition.length !== 1) throw new EmitError(`obj #${o.vnum} condition must be a single letter`);
  out += `${o.level} ${o.weight} ${o.cost} ${o.condition}\n`;

  for (const a of o.affects) {
    out += `A\n${a.location} ${a.modifier}\n`;
  }
  for (const f of o.flagAffects) {
    out += `F ${f.where} ${f.location} ${f.modifier} ${flag(f.bitvector)}\n`;
  }
  for (const e of o.extraDescrs) {
    out += 'E\n';
    out += str(e.keyword, `obj #${o.vnum} extra descr keyword`);
    out += str(e.description, `obj #${o.vnum} extra descr text`);
  }
  return out;
}

function emitRooms(s: RoomsSection): string {
  let out = '#ROOMS\n';
  for (const room of s.rooms) out += emitRoom(room);
  out += '#0\n\n';
  return out;
}

function emitRoom(room: Room): string {
  let out = `#${room.vnum}\n`;
  out += str(room.name, `room #${room.vnum} name`);
  out += str(room.description, `room #${room.vnum} description`);
  out += `${room.areaNumber} ${flag(room.roomFlags)} ${room.sectorType}\n`;
  for (const ex of room.exits) {
    if (ex.door < 0 || ex.door > 9) throw new EmitError(`room #${room.vnum} exit has bad door ${ex.door}`);
    out += `D${ex.door}\n`;
    out += str(ex.description, `room #${room.vnum} exit ${ex.door} description`);
    out += str(ex.keyword, `room #${room.vnum} exit ${ex.door} keyword`);
    out += `${ex.locks} ${ex.key} ${ex.toVnum}\n`;
  }
  for (const e of room.extraDescrs) {
    out += 'E\n';
    out += str(e.keyword, `room #${room.vnum} extra descr keyword`);
    out += str(e.description, `room #${room.vnum} extra descr text`);
  }
  if (room.healRate !== undefined) out += `H ${room.healRate}\n`;
  if (room.manaRate !== undefined) out += `M ${room.manaRate}\n`;
  if (room.clan !== undefined) out += `C ${str(room.clan, `room #${room.vnum} clan`)}`;
  if (room.owner !== undefined) out += `O ${str(room.owner, `room #${room.vnum} owner`)}`;
  out += 'S\n';
  return out;
}

function emitResets(s: ResetsSection): string {
  let out = '#RESETS\n';
  for (const reset of s.resets) {
    if (reset.command === '*') {
      out += `*${tail(reset.comment)}\n`;
      continue;
    }
    const r = reset;
    const parts = [r.command, String(r.ifFlag), String(r.arg1), String(r.arg2)];
    if (r.command !== 'G' && r.command !== 'R') parts.push(String(r.arg3));
    if (r.command === 'P' || r.command === 'M') parts.push(String(r.arg4));
    out += `${parts.join(' ')}${tail(r.comment)}\n`;
  }
  out += 'S\n\n';
  return out;
}

function emitShops(s: ShopsSection): string {
  let out = '#SHOPS\n';
  for (const shop of s.shops) {
    out += `${shop.keeper} ${shop.buyTypes.join(' ')} ${shop.profitBuy} ${shop.profitSell} ${shop.openHour} ${shop.closeHour}${tail(shop.comment)}\n`;
  }
  out += '0\n\n';
  return out;
}

function emitSpecials(s: SpecialsSection): string {
  let out = '#SPECIALS\n';
  for (const sp of s.specials) {
    if (sp.command === '*') {
      out += `*${tail(sp.comment)}\n`;
    } else {
      out += `M ${sp.mobVnum} ${word(sp.specFun, 'specFun')}${tail(sp.comment)}\n`;
    }
  }
  out += 'S\n\n';
  return out;
}

function emitSocials(s: SocialsSection): string {
  let out = '#SOCIALS\n\n';
  for (const social of s.socials) {
    if (social.name === '#0' || social.name === '#') {
      throw new EmitError(`social name ${JSON.stringify(social.name)} collides with a section terminator`);
    }
    out += `${word(social.name, 'social name')}${tail(social.nameComment)}\n`;
    for (const field of social.fields) {
      if (field === null) {
        out += '$\n';
      } else if (field === '' || field === '#' || field === '$') {
        throw new EmitError(`social '${social.name}' has a field that cannot be represented: ${JSON.stringify(field)}`);
      } else {
        out += `${field}\n`;
      }
    }
    if (social.fields.length < 8) out += '#\n';
    out += '\n';
  }
  out += '#0\n\n';
  return out;
}
