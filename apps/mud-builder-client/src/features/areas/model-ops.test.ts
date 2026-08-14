import { emitAreaFile, parseAreaFile } from '@shatteredarchive/merc-area';

import {
  addMobile,
  addObject,
  addRoom,
  deleteBlockers,
  getShop,
  getSpecial,
  newMobTemplate,
  newObjectTemplate,
  newRoomTemplate,
  newShopTemplate,
  newSocialTemplate,
  nextFreeVnum,
  removeEntity,
  removeShop,
  removeSocial,
  removeSpecial,
  setSpecial,
  socialsOf,
  upsertShop,
  upsertSocial,
} from './model-ops.js';

const AREA_TEXT = `#AREA
tiny.are~
Tiny~
{ 1 50} Test  Tiny~
100 199

#MOBILES
#101
guard test~
the test guard~
A test guard stands here.
~
He looks thoroughly bored.
~
human~
A 0 0 0 1 0 1d1+1 1d1+1 1d1+1 slash 0 0 0 0 0 0 0 0 stand stand male 0 0 0 medium unknown
#0

#ROOMS
#100
The Test Room~
A perfectly ordinary test room.
~
0 0 1
D0
~
~
0 0 102
S
#102
The Other Room~
Another room.
~
0 0 1
S
#0

#RESETS
M 0 101 1 100 1
S

#$
`;

const area = () => parseAreaFile(AREA_TEXT);

describe('nextFreeVnum', () => {
  it('allocates the first unused vnum across all entity kinds', () => {
    // 100 (room), 101 (mob), 102 (room) used → 103.
    expect(nextFreeVnum(area())).toBe(103);
  });

  it('returns null when the declared range is exhausted', () => {
    const a = area();
    for (const s of a.sections) {
      if (s.kind === 'rooms') {
        for (let v = 100; v <= 199; v++) s.rooms.push({ ...newRoomTemplate(v) });
      }
    }
    expect(nextFreeVnum(a)).toBeNull();
  });
});

describe('templates round-trip through the real emitter/parser', () => {
  it('emits a file with a new mob, object, and room that re-parses identically', () => {
    let a = area();
    a = addMobile(a, newMobTemplate(103));
    a = addObject(a, newObjectTemplate(104)); // no #OBJECTS section existed
    a = addRoom(a, newRoomTemplate(105));

    const text = emitAreaFile(a);
    expect(text).toContain('#103');
    expect(text).toContain('a new mob~');
    expect(text).toContain('a new object~');
    expect(text).toContain('A New Room~');
    // #OBJECTS was created before the reference sections.
    expect(text.indexOf('#OBJECTS')).toBeLessThan(text.indexOf('#RESETS'));
    expect(parseAreaFile(text)).toEqual(a);
  });
});

describe('deleteBlockers / removeEntity', () => {
  it('blocks deleting a mob a reset spawns, naming the reset', () => {
    const blockers = deleteBlockers(area(), 'mob', 101);
    expect(blockers).toHaveLength(1);
    expect(blockers[0]).toContain('reset #1 (M)');
  });

  it('blocks deleting a room another room exits into', () => {
    const blockers = deleteBlockers(area(), 'room', 102);
    expect(blockers.join('; ')).toContain('room 100 exit 0');
  });

  it("does not count the entity's own outgoing references", () => {
    // Room 100 exits into 102 and hosts the M reset, but nothing points AT it
    // except the reset's room arg — remove the reset and 100 is deletable.
    const a = area();
    for (const s of a.sections) {
      if (s.kind === 'resets') s.resets = [];
    }
    expect(deleteBlockers(a, 'room', 100)).toEqual([]);
    const after = removeEntity(a, 'room', 100);
    const rooms = after.sections.find((s) => s.kind === 'rooms');
    expect(rooms && rooms.kind === 'rooms' ? rooms.rooms.map((r) => r.vnum) : []).toEqual([102]);
  });

  it('allows deleting an unreferenced mob', () => {
    const a = addMobile(area(), newMobTemplate(103));
    expect(deleteBlockers(a, 'mob', 103)).toEqual([]);
  });
});

describe('shops and specials (Phase 5)', () => {
  it('upsertShop creates #SHOPS on first use and round-trips through the emitter', () => {
    const a = upsertShop(area(), { ...newShopTemplate(101), profitBuy: 150 });
    expect(getShop(a, 101)?.profitBuy).toBe(150);

    const reparsed = parseAreaFile(emitAreaFile(a));
    expect(getShop(reparsed, 101)?.profitBuy).toBe(150);

    // upsert replaces, never duplicates
    const b = upsertShop(a, { ...getShop(a, 101)!, openHour: 6 });
    const shops = b.sections.find((s) => s.kind === 'shops');
    expect(shops && shops.kind === 'shops' ? shops.shops.length : 0).toBe(1);
    expect(getShop(b, 101)?.openHour).toBe(6);

    expect(getShop(removeShop(b, 101), 101)).toBeUndefined();
  });

  it('setSpecial creates #SPECIALS after #SHOPS, replaces on re-set, and removes cleanly', () => {
    let a = upsertShop(area(), newShopTemplate(101));
    a = setSpecial(a, 101, 'spec_guard');
    expect(getSpecial(a, 101)).toBe('spec_guard');

    const kinds = a.sections.map((s) => s.kind);
    expect(kinds.indexOf('shops')).toBeLessThan(kinds.indexOf('specials'));

    a = setSpecial(a, 101, 'spec_thief');
    const specials = a.sections.find((s) => s.kind === 'specials');
    expect(specials && specials.kind === 'specials' ? specials.specials.length : 0).toBe(1);
    expect(getSpecial(parseAreaFile(emitAreaFile(a)), 101)).toBe('spec_thief');

    expect(getSpecial(removeSpecial(a, 101), 101)).toBeUndefined();
  });

  it('a shop blocks deleting its keeper until removed', () => {
    const a = upsertShop(area(), newShopTemplate(101));
    const withoutReset = {
      sections: a.sections.map((s) => (s.kind === 'resets' ? { ...s, resets: [] } : s)),
    };
    expect(deleteBlockers(withoutReset, 'mob', 101).join('; ')).toContain('keeper mob 101');
    expect(deleteBlockers(removeShop(withoutReset, 101), 'mob', 101)).toEqual([]);
  });
});

describe('socials (Phase 6)', () => {
  it('upsertSocial creates #SOCIALS and round-trips through the emitter', () => {
    const a = upsertSocial(area(), newSocialTemplate('wave'));
    expect(socialsOf(a).map((s) => s.name)).toEqual(['wave']);

    const reparsed = parseAreaFile(emitAreaFile(a));
    const wave = socialsOf(reparsed)[0];
    expect(wave.fields[0]).toBe('You wave.');
    expect(wave.fields[1]).toBe('$n waves.');
    expect(wave.fields.slice(2)).toEqual([null, null, null, null, null, null]); // blanks stay `$`

    // Replace by (renamed) key, never duplicate; then remove.
    const renamed = upsertSocial(a, { ...socialsOf(a)[0], name: 'Wave', fields: [...socialsOf(a)[0].fields] }, 'wave');
    expect(socialsOf(renamed).length).toBe(1);
    expect(socialsOf(removeSocial(renamed, 'WAVE')).length).toBe(0);
  });

  it('leaves an early-terminated social untouched when editing another', () => {
    const short = { name: 'grin', nameComment: '0 0', fields: ['You grin evilly.', '$n grins evilly.'] };
    let a = upsertSocial(area(), short);
    a = upsertSocial(a, newSocialTemplate('wave'));

    const emitted = emitAreaFile(a);
    // grin keeps its 2 lines + '#' early terminator through the round trip.
    expect(emitted).toContain('You grin evilly.\n$n grins evilly.\n#\n');
    const reparsed = parseAreaFile(emitAreaFile(parseAreaFile(emitted)));
    expect(socialsOf(reparsed).find((s) => s.name === 'grin')?.fields.length).toBe(2);
  });
});
