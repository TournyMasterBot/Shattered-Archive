/**
 * Parser for Merc 2.4 area files, a faithful mirror of merc-mud/2.4/src/db.c
 * boot_db's section loop and the load_* functions (db.c + db2.c). Anything this
 * accepts, db.c boots; anything db.c boots, this accepts — except the legacy
 * #MOBOLD/#OBJOLD sections (unused by the corpus), which raise a clear error.
 */

import { Reader, ParseError } from './reader.js';
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
  ObjValue,
  RoomsSection,
  Room,
  ResetsSection,
  Reset,
  ResetComment,
  ShopsSection,
  Shop,
  SpecialsSection,
  Special,
  SocialsSection,
  Social,
  ScriptsSection,
  MobScript,
} from './types.js';
import { objValueKinds } from './types.js';

export { ParseError };

export function parseAreaFile(text: string): AreaFile {
  const r = new Reader(text);
  const sections: AreaSection[] = [];

  for (;;) {
    const hash = r.letter();
    if (hash !== '#') r.fail(`expected '#' at start of section (got ${JSON.stringify(hash)})`);
    const word = r.word();

    if (word.startsWith('$')) break;

    switch (word) {
      case 'AREA':
        sections.push(parseAreaHeader(r));
        break;
      case 'HELPS':
        sections.push(parseHelps(r));
        break;
      case 'MOBILES':
        sections.push(parseMobiles(r));
        break;
      case 'OBJECTS':
        sections.push(parseObjects(r));
        break;
      case 'RESETS':
        sections.push(parseResets(r));
        break;
      case 'ROOMS':
        sections.push(parseRooms(r));
        break;
      case 'SHOPS':
        sections.push(parseShops(r));
        break;
      case 'SPECIALS':
        sections.push(parseSpecials(r));
        break;
      case 'SOCIALS':
        sections.push(parseSocials(r));
        break;
      case 'SCRIPTS':
        sections.push(parseScripts(r));
        break;
      case 'MOBOLD':
      case 'OBJOLD':
        r.fail(`legacy #${word} sections are not supported (convert to #MOBILES/#OBJECTS)`);
        break;
      default:
        r.fail(`bad section name #${word}`);
    }
  }

  return { sections };
}

function parseAreaHeader(r: Reader): AreaHeaderSection {
  return {
    kind: 'area',
    fileName: r.string(),
    name: r.string(),
    credits: r.string(),
    minVnum: r.number(),
    maxVnum: r.number(),
  };
}

function parseHelps(r: Reader): HelpsSection {
  const helps = [];
  for (;;) {
    const level = r.number();
    const keyword = r.string();
    if (keyword.startsWith('$')) {
      return { kind: 'helps', helps, endLevel: level };
    }
    helps.push({ level, keyword, text: r.string() });
  }
}

function parseDice(r: Reader): Dice {
  const number = r.number();
  r.letter(); // 'd'
  const type = r.number();
  r.letter(); // '+'
  const bonus = r.number();
  return { number, type, bonus };
}

function parseMobiles(r: Reader): MobilesSection {
  const mobiles: Mobile[] = [];
  for (;;) {
    const hash = r.letter();
    if (hash !== '#') r.fail(`Load_mobiles: # not found (got ${JSON.stringify(hash)})`);
    const vnum = r.number();
    if (vnum === 0) return { kind: 'mobiles', mobiles };

    const mob: Mobile = {
      vnum,
      name: r.string(),
      shortDescr: r.string(),
      longDescr: r.string(),
      description: r.string(),
      race: r.string(),
      act: r.flag(),
      affectedBy: r.flag(),
      alignment: r.number(),
      group: r.number(),
      level: r.number(),
      hitroll: r.number(),
      hit: parseDice(r),
      mana: parseDice(r),
      damage: parseDice(r),
      damType: r.word(),
      ac: [r.number(), r.number(), r.number(), r.number()],
      offFlags: r.flag(),
      immFlags: r.flag(),
      resFlags: r.flag(),
      vulnFlags: r.flag(),
      startPos: r.word(),
      defaultPos: r.word(),
      sex: r.word(),
      wealth: r.number(),
      form: r.flag(),
      parts: r.flag(),
      size: r.word(),
      material: r.word(),
      flagRemovals: [],
    };

    while (!r.atEof() && r.peekLetter() === 'F') {
      r.letter();
      mob.flagRemovals.push({ field: r.word(), vector: r.flag() });
    }

    mobiles.push(mob);
  }
}

function parseObjects(r: Reader): ObjectsSection {
  const objects: MudObject[] = [];
  for (;;) {
    const hash = r.letter();
    if (hash !== '#') r.fail(`Load_objects: # not found (got ${JSON.stringify(hash)})`);
    const vnum = r.number();
    if (vnum === 0) return { kind: 'objects', objects };

    const name = r.string();
    const shortDescr = r.string();
    const description = r.string();
    const material = r.string();
    const itemType = r.word();
    const extraFlags = r.flag();
    const wearFlags = r.flag();

    const kinds = objValueKinds(itemType);
    const values = kinds.map((kind): ObjValue => {
      switch (kind) {
        case 'word':
          return r.word();
        case 'flag':
          return r.flag();
        default:
          return r.number();
      }
    }) as [ObjValue, ObjValue, ObjValue, ObjValue, ObjValue];

    const obj: MudObject = {
      vnum,
      name,
      shortDescr,
      description,
      material,
      itemType,
      extraFlags,
      wearFlags,
      values,
      level: r.number(),
      weight: r.number(),
      cost: r.number(),
      condition: r.letter(),
      affects: [],
      flagAffects: [],
      extraDescrs: [],
    };

    for (;;) {
      if (r.atEof()) r.fail(`Load_objects: unexpected EOF after object #${vnum}`);
      const letter = r.peekLetter();
      if (letter === 'A') {
        r.letter();
        obj.affects.push({ location: r.number(), modifier: r.number() });
      } else if (letter === 'F') {
        r.letter();
        const where = r.letter();
        if (where !== 'A' && where !== 'I' && where !== 'R' && where !== 'V') {
          r.fail(`Load_objects: bad where '${where}' on flag set`);
        }
        obj.flagAffects.push({
          where,
          location: r.number(),
          modifier: r.number(),
          bitvector: r.flag(),
        });
      } else if (letter === 'E') {
        r.letter();
        obj.extraDescrs.push({ keyword: r.string(), description: r.string() });
      } else {
        break;
      }
    }

    objects.push(obj);
  }
}

function parseRooms(r: Reader): RoomsSection {
  const rooms: Room[] = [];
  for (;;) {
    const hash = r.letter();
    if (hash !== '#') r.fail(`Load_rooms: # not found (got ${JSON.stringify(hash)})`);
    const vnum = r.number();
    if (vnum === 0) return { kind: 'rooms', rooms };

    const room: Room = {
      vnum,
      name: r.string(),
      description: r.string(),
      areaNumber: r.number(),
      roomFlags: r.flag(),
      sectorType: r.number(),
      exits: [],
      extraDescrs: [],
    };

    for (;;) {
      const letter = r.letter();
      if (letter === 'S') break;

      if (letter === 'H') {
        room.healRate = r.number();
      } else if (letter === 'M') {
        room.manaRate = r.number();
      } else if (letter === 'C') {
        if (room.clan !== undefined) r.fail(`Load_rooms: duplicate clan fields in room #${vnum}`);
        room.clan = r.string();
      } else if (letter === 'D') {
        const door = r.number();
        if (door < 0 || door > 5) r.fail(`Load_rooms: room #${vnum} has bad door number ${door}`);
        room.exits.push({
          door,
          description: r.string(),
          keyword: r.string(),
          locks: r.number(),
          key: r.number(),
          toVnum: r.number(),
        });
      } else if (letter === 'E') {
        room.extraDescrs.push({ keyword: r.string(), description: r.string() });
      } else if (letter === 'O') {
        if (room.owner !== undefined) r.fail(`Load_rooms: duplicate owner in room #${vnum}`);
        room.owner = r.string();
      } else {
        r.fail(`Load_rooms: room #${vnum} has flag ${JSON.stringify(letter)} not 'DES'`);
      }
    }

    rooms.push(room);
  }
}

function parseResets(r: Reader): ResetsSection {
  const resets: (Reset | ResetComment)[] = [];
  for (;;) {
    const letter = r.letter();
    if (letter === 'S') return { kind: 'resets', resets };

    if (letter === '*') {
      resets.push({ command: '*', comment: r.restOfLine() });
      continue;
    }

    if (!'MOPGEDR'.includes(letter)) {
      r.fail(`Load_resets: bad command '${letter}'`);
    }
    const command = letter as Reset['command'];

    const ifFlag = r.number();
    const arg1 = r.number();
    const arg2 = r.number();
    const arg3 = command === 'G' || command === 'R' ? 0 : r.number();
    const arg4 = command === 'P' || command === 'M' ? r.number() : 0;
    const comment = r.restOfLine();

    resets.push({ command, ifFlag, arg1, arg2, arg3, arg4, comment });
  }
}

function parseShops(r: Reader): ShopsSection {
  const shops: Shop[] = [];
  for (;;) {
    const keeper = r.number();
    if (keeper === 0) return { kind: 'shops', shops };
    shops.push({
      keeper,
      buyTypes: [r.number(), r.number(), r.number(), r.number(), r.number()],
      profitBuy: r.number(),
      profitSell: r.number(),
      openHour: r.number(),
      closeHour: r.number(),
      comment: r.restOfLine(),
    });
  }
}

function parseSpecials(r: Reader): SpecialsSection {
  const specials: Special[] = [];
  for (;;) {
    const letter = r.letter();
    if (letter === 'S') return { kind: 'specials', specials };

    if (letter === '*') {
      specials.push({ command: '*', comment: r.restOfLine() });
    } else if (letter === 'M') {
      specials.push({
        command: 'M',
        mobVnum: r.number(),
        specFun: r.word(),
        comment: r.restOfLine(),
      });
    } else {
      r.fail(`Load_specials: letter '${letter}' not *MS`);
    }
  }
}

function parseSocials(r: Reader): SocialsSection {
  const socials: Social[] = [];
  for (;;) {
    const name = r.word();
    if (name === '#0') return { kind: 'socials', socials };

    const social: Social = { name, nameComment: r.restOfLine(), fields: [] };

    for (let i = 0; i < 8; i++) {
      const line = r.stringEol();
      if (line === '#') break;
      social.fields.push(line === '$' ? null : line);
    }

    socials.push(social);
  }
}

/** MUD Builder extension section; mirror of merc-mud/2.4/src/db.c load_scripts. */
function parseScripts(r: Reader): ScriptsSection {
  const scripts: MobScript[] = [];
  for (;;) {
    const letter = r.letter();
    if (letter === '#') {
      const n = r.number();
      if (n !== 0) r.fail(`Load_scripts: expected #0 terminator (got #${n})`);
      return { kind: 'scripts', scripts };
    }
    if (letter !== 'M') {
      r.fail(`Load_scripts: expected 'M' or '#0' (got ${JSON.stringify(letter)})`);
    }
    const script: MobScript = {
      mobVnum: r.number(),
      trigger: r.word(),
      phrase: r.string(),
      body: r.string(),
    };
    scripts.push(script);
  }
}
