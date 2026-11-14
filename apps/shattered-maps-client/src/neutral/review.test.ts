import { emptyMap, validateMapFile, type MapFile, type Room } from '@shatteredarchive/shattered-maps-core';
import { candidatesMap } from '../testing/neutralFixtures';
import {
  acceptLink,
  acceptMany,
  acceptRoom,
  editLink,
  editRoom,
  emptyLog,
  pendingItems,
  rejectItem,
  reopenItem,
  statusOf,
  tally,
  type Outcome,
} from './review';

const META = { at: '2026-11-07', note: 'checked in game' };
const roomsOf = (map: MapFile): Room[] => map.continents.flatMap((c) => c.areas.flatMap((a) => a.subzones.flatMap((s) => s.rooms)));
const roomOf = (map: MapFile, id: string): Room => roomsOf(map).find((r) => r.id === id) as Room;
const must = (outcome: Outcome) => {
  if (!outcome.ok) throw new Error(outcome.reason);
  return outcome;
};
const valid = (map: MapFile): string[] => {
  const verdict = validateMapFile(map);
  return verdict.ok ? [] : verdict.errors;
};

const candidates = candidatesMap();
const audited = emptyMap('2026-11-06');

describe('pendingItems and statusOf', () => {
  it('lists every live room and every link of a live room, rooms first, and not the merged-away room', () => {
    const items = pendingItems(candidates, emptyLog());
    expect(items.filter((i) => i.kind === 'room').map((i) => i.id)).toEqual(['r-gate', 'r-barn', 'r-well', 'r-cellar', 'r-quay']);
    expect(items.filter((i) => i.kind === 'link').map((i) => i.id).sort()).toEqual(['l1', 'l2', 'l3', 'l4', 'l5']);
    expect(items.find((i) => i.id === 'l3')?.label).toBe('The Gate N');
    expect(items.findIndex((i) => i.kind === 'link')).toBeGreaterThan(items.findLastIndex((i) => i.kind === 'room'));
  });

  it('leaves out decided items, and can be limited to some rooms', () => {
    const log = must(acceptRoom(candidates, audited, emptyLog(), 'r-gate', META)).log;
    expect(pendingItems(candidates, log).some((i) => i.id === 'r-gate')).toBe(false);
    const within = pendingItems(candidates, emptyLog(), new Set(['r-barn']));
    expect(within.map((i) => i.id).sort()).toEqual(['l2', 'l5', 'r-barn']);
    expect(statusOf(log, 'room', 'r-gate')).toBe('accepted');
    expect(statusOf(log, 'room', 'r-barn')).toBe('candidate');
  });
});

describe('acceptRoom', () => {
  it('copies the room with its place in the hierarchy, its baseline and sources, and stamps the review on it', () => {
    const out = must(acceptRoom(candidates, audited, emptyLog(), 'r-gate', META));
    expect(out.added).toEqual(['r-gate']);
    expect(out.audited.continents.map((c) => [c.name, c.areas.map((a) => [a.name, a.subzones.map((s) => [s.name, s.kind, s.rooms.length])])])).toEqual([
      ['Greenmarch', [['North Farm', [['Fields', 'consistent', 1]]]]],
    ]);
    const gate = roomOf(out.audited, 'r-gate');
    expect(gate).toMatchObject({ title: 'The Gate', sector: 'city', vnum: 100 });
    expect(gate.baseline?.contents.map((c) => c.label)).toEqual(['a tired guard', 'a wandering bard']);
    expect(gate.baseline?.was.map((w) => w.label)).toEqual(['a lost cat']);
    expect(gate.sources).toEqual([
      { kind: 'azah', ref: 'r-gate', credit: 'Test Author', date: '2026-10-01' },
      { kind: 'manual', ref: 'review', date: '2026-11-07' },
    ]);
    expect(gate.history).toEqual([{ at: '2026-11-07', op: 'create', note: 'review: accepted: checked in game' }]);
    expect(gate.exits).toEqual({});
    expect(out.log.decisions).toEqual([{ kind: 'room', id: 'r-gate', status: 'accepted', at: '2026-11-07', note: 'checked in game' }]);
    expect(valid(out.audited)).toEqual([]);
  });

  it('does not change what it was given', () => {
    const before = JSON.stringify([candidates, audited]);
    must(acceptRoom(candidates, audited, emptyLog(), 'r-gate', META));
    expect(JSON.stringify([candidates, audited])).toBe(before);
  });

  it('adds a second room to the container the first one made, and keeps the area placement', () => {
    const one = must(acceptRoom(candidates, audited, emptyLog(), 'r-gate', META));
    const two = must(acceptRoom(candidates, one.audited, one.log, 'r-cellar', META));
    const farm = two.audited.continents[0].areas[0];
    expect(farm.placement).toEqual({ x: 0, y: 0, w: 2, h: 1 });
    expect(farm.subzones.map((s) => [s.name, s.rooms.length])).toEqual([['Fields', 1], ['Cellar', 1]]);
    expect(two.audited.continents[0].areas).toHaveLength(1);
  });

  it('accepts with changes: the edited fields are applied, named in the log and in the history', () => {
    const out = must(acceptRoom(candidates, audited, emptyLog(), 'r-gate', META, { title: 'The Great Gate', description: '', sector: 'inside' }));
    const gate = roomOf(out.audited, 'r-gate');
    expect(gate).toMatchObject({ title: 'The Great Gate', sector: 'inside' });
    expect(gate.description).toBeUndefined();
    expect(gate.history?.[0].note).toBe('review: accepted with changes (title, description, sector): checked in game');
    expect(out.log.decisions[0]).toMatchObject({ status: 'edited', edits: ['title', 'description', 'sector'] });
    expect(roomOf(candidates, 'r-gate').title).toBe('The Gate');
  });

  it('counts "accepted with changes" with no real change as a plain accept', () => {
    const out = must(acceptRoom(candidates, audited, emptyLog(), 'r-gate', META, { title: 'The Gate', sector: 'city' }));
    expect(out.log.decisions[0].status).toBe('accepted');
    expect(out.log.decisions[0].edits).toBeUndefined();
  });

  it('refuses what cannot be accepted, with the reason, and changes nothing', () => {
    const one = must(acceptRoom(candidates, audited, emptyLog(), 'r-gate', META));
    expect(acceptRoom(candidates, one.audited, one.log, 'r-gate', META)).toEqual({ ok: false, reason: 'the room is already in the audited file' });
    for (const id of ['nope', 'r-old'])
      expect(acceptRoom(candidates, audited, emptyLog(), id, META)).toEqual({ ok: false, reason: 'the room is not a live room of the candidates file' });
    for (const edits of [{ title: '  ' }, { title: 'x'.repeat(201) }, { description: 'x'.repeat(8001) }, { sector: 'x'.repeat(201) }])
      expect(acceptRoom(candidates, audited, emptyLog(), 'r-barn', META, edits).ok).toBe(false);
  });

  it('refuses a room whose number another accepted room already has', () => {
    const clash = JSON.parse(JSON.stringify(candidates)) as MapFile;
    const barn = roomOf(clash, 'r-barn');
    barn.vnum = 100;
    const one = must(acceptRoom(clash, audited, emptyLog(), 'r-gate', META));
    const refused = acceptRoom(clash, one.audited, one.log, 'r-barn', META);
    expect(refused).toEqual({ ok: false, reason: 'room number 100 is already used by another room of the audited file' });
  });

  it('keeps no more than the allowed number of sources and history lines', () => {
    const crowded = JSON.parse(JSON.stringify(candidates)) as MapFile;
    const gate = roomOf(crowded, 'r-gate');
    gate.sources = Array.from({ length: 16 }, (_, i) => ({ kind: 'azah' as const, ref: `s${i}` }));
    const out = must(acceptRoom(crowded, audited, emptyLog(), 'r-gate', META));
    const sources = roomOf(out.audited, 'r-gate').sources;
    expect(sources).toHaveLength(16);
    expect(sources[15]).toEqual({ kind: 'manual', ref: 'review', date: '2026-11-07' });
    expect(valid(out.audited)).toEqual([]);
  });
});

describe('acceptLink', () => {
  it('accepts a link and, first, its starting room; the room gets the exit slot; the file stays valid', () => {
    const out = must(acceptLink(candidates, audited, emptyLog(), 'l1', META));
    expect(out.added).toEqual(['r-gate', 'l1']);
    const gate = roomOf(out.audited, 'r-gate');
    expect(gate.exits).toEqual({ E: 'l1' });
    const link = out.audited.links[0];
    expect(link).toMatchObject({ id: 'l1', from: 'r-gate', dir: 'E', to: 'r-barn', state: 'confirmed', confidence: 0.95, reverse: true, traversals: 3 });
    // the target room has not been accepted: the link leaves the page (the neutral file allows exactly that)
    expect(link.offPage).toBe(true);
    expect(link.sources?.at(-1)).toEqual({ kind: 'manual', ref: 'review', date: '2026-11-07' });
    expect(out.log.decisions.map((d) => [d.kind, d.id, d.status])).toEqual([['room', 'r-gate', 'accepted'], ['link', 'l1', 'accepted']]);
    expect(valid(out.audited)).toEqual([]);
  });

  it('keeps the link on the page when both its rooms are accepted', () => {
    const a = must(acceptRoom(candidates, audited, emptyLog(), 'r-gate', META));
    const b = must(acceptRoom(candidates, a.audited, a.log, 'r-barn', META));
    const c = must(acceptLink(candidates, b.audited, b.log, 'l1', META));
    expect(c.audited.links[0].offPage).toBe(false);
    expect(c.added).toEqual(['l1']);
    expect(valid(c.audited)).toEqual([]);
  });

  it('keeps an exit with no known target as it is (a gap), and a conflict with the places it was seen to lead', () => {
    const gap = must(acceptLink(candidates, audited, emptyLog(), 'l3', META));
    expect(gap.audited.links[0]).toMatchObject({ to: null, state: 'unknown-target', confidence: 0 });
    const conflict = must(acceptLink(candidates, audited, emptyLog(), 'l5', META));
    expect(conflict.audited.links[0]).toMatchObject({ state: 'conflict', conflictTo: ['r-cellar'] });
    expect(valid(conflict.audited)).toEqual([]);
  });

  it('accepts a link that the candidate marked off the page, to a room that is not in its file at all', () => {
    const out = must(acceptLink(candidates, audited, emptyLog(), 'l4', META));
    expect(out.audited.links[0]).toMatchObject({ to: 'r-quay', offPage: true });
    expect(valid(out.audited)).toEqual([]);
  });

  it('accepts with changes: a new target, and a state the curator vouches for', () => {
    const out = must(acceptLink(candidates, audited, emptyLog(), 'l3', META, { to: 'r-well', state: 'confirmed' }));
    expect(out.audited.links[0]).toMatchObject({ to: 'r-well', state: 'confirmed', confidence: 0.95, offPage: true });
    expect(out.log.decisions.at(-1)).toMatchObject({ kind: 'link', status: 'edited', edits: ['target', 'state'] });
    const resolved = must(acceptLink(candidates, audited, emptyLog(), 'l5', META, { to: 'r-cellar' }));
    expect(resolved.audited.links[0]).toMatchObject({ to: 'r-cellar', state: 'candidate', confidence: 0.6 });
    expect(resolved.audited.links[0].conflictTo).toBeUndefined();
    expect(valid(out.audited)).toEqual([]);
    expect(valid(resolved.audited)).toEqual([]);
  });

  it('refuses what cannot be accepted, with the reason', () => {
    const one = must(acceptLink(candidates, audited, emptyLog(), 'l1', META));
    expect(acceptLink(candidates, one.audited, one.log, 'l1', META)).toEqual({ ok: false, reason: 'the link is already in the audited file' });
    expect(acceptLink(candidates, audited, emptyLog(), 'nope', META)).toEqual({ ok: false, reason: 'the link is not in the candidates file' });
    expect(acceptLink(candidates, audited, emptyLog(), 'l3', META, { to: 'nowhere' })).toEqual({
      ok: false,
      reason: 'the new target is not a live room of the audited file or the candidates',
    });
    expect(acceptLink(candidates, audited, emptyLog(), 'l3', META, { to: 'r-old' }).ok).toBe(false);
    expect(acceptLink(candidates, audited, emptyLog(), 'l3', META, { state: 'confirmed' })).toEqual({
      ok: false,
      reason: 'an exit with no target cannot be made a candidate or confirmed',
    });
  });

  it('refuses a link whose slot is taken, and one whose room cannot be accepted', () => {
    const crowded = JSON.parse(JSON.stringify(candidates)) as MapFile;
    crowded.links.push({ ...crowded.links[0], id: 'l9' });
    const one = must(acceptLink(crowded, audited, emptyLog(), 'l1', META));
    expect(acceptLink(crowded, one.audited, one.log, 'l9', META)).toEqual({ ok: false, reason: 'the audited room already has an exit E' });
    const clash = JSON.parse(JSON.stringify(candidates)) as MapFile;
    roomOf(clash, 'r-gate').vnum = 5;
    roomOf(clash, 'r-barn').vnum = 5;
    const first = must(acceptRoom(clash, audited, emptyLog(), 'r-barn', META));
    const refused = acceptLink(clash, first.audited, first.log, 'l1', META);
    expect(refused.ok ? '' : refused.reason).toContain('its starting room cannot be accepted');
  });
});

describe('acceptMany', () => {
  it('accepts a view of items in one pass, skips the ones that cannot go, and the result is a valid file', () => {
    const items = pendingItems(candidates, emptyLog());
    const out = acceptMany(candidates, audited, emptyLog(), [...items, { kind: 'room', id: 'nope' }], META);
    expect(out.accepted).toBe(items.length);
    expect(out.skipped).toEqual([{ kind: 'room', id: 'nope', reason: 'the room is not a live room of the candidates file' }]);
    expect(roomsOf(out.audited)).toHaveLength(5);
    expect(out.audited.links).toHaveLength(5);
    expect(valid(out.audited)).toEqual([]);
    expect(pendingItems(candidates, out.log)).toEqual([]);
    expect(tally(candidates, out.log)).toEqual({ pending: 0, accepted: items.length, edited: 0, rejected: 0 });
  });

  it('does not change what it was given', () => {
    const before = JSON.stringify([candidates, audited]);
    acceptMany(candidates, audited, emptyLog(), pendingItems(candidates, emptyLog()), META);
    expect(JSON.stringify([candidates, audited])).toBe(before);
  });
});

describe('rejectItem and reopenItem', () => {
  it('rejects a pending item with a note; it leaves the queue; nothing enters the audited file', () => {
    const rejected = rejectItem(emptyLog(), 'room', 'r-well', META);
    if (!rejected.ok) throw new Error(rejected.reason);
    expect(rejected.log.decisions).toEqual([{ kind: 'room', id: 'r-well', status: 'rejected', at: '2026-11-07', note: 'checked in game' }]);
    expect(pendingItems(candidates, rejected.log).some((i) => i.id === 'r-well')).toBe(false);
    expect(tally(candidates, rejected.log).rejected).toBe(1);
    expect(statusOf(rejected.log, 'room', 'r-well')).toBe('rejected');
  });

  it('cannot reject an item that is already decided', () => {
    const one = must(acceptRoom(candidates, audited, emptyLog(), 'r-gate', META));
    expect(rejectItem(one.log, 'room', 'r-gate', META)).toEqual({ ok: false, reason: 'the room is already accepted' });
    const rej = rejectItem(emptyLog(), 'link', 'l1', META);
    if (!rej.ok) throw new Error(rej.reason);
    expect(rejectItem(rej.log, 'link', 'l1', META)).toEqual({ ok: false, reason: 'the link is already rejected' });
  });

  it('reopens a rejected item (it is pending again) and nothing else', () => {
    const rej = rejectItem(emptyLog(), 'room', 'r-well', META);
    if (!rej.ok) throw new Error(rej.reason);
    const back = reopenItem(rej.log, 'room', 'r-well');
    if (!back.ok) throw new Error(back.reason);
    expect(back.log.decisions).toEqual([]);
    expect(pendingItems(candidates, back.log).some((i) => i.id === 'r-well')).toBe(true);
    expect(reopenItem(back.log, 'room', 'r-well')).toEqual({ ok: false, reason: 'the room is not rejected' });
    const one = must(acceptRoom(candidates, audited, emptyLog(), 'r-gate', META));
    expect(reopenItem(one.log, 'room', 'r-gate')).toEqual({ ok: false, reason: 'the room is not rejected' });
  });

  it('strikes only the latest rejection when an item was rejected twice', () => {
    const a = rejectItem(emptyLog(), 'room', 'r-well', { at: '2026-11-01', note: 'first' });
    if (!a.ok) throw new Error(a.reason);
    const back = reopenItem(a.log, 'room', 'r-well');
    if (!back.ok) throw new Error(back.reason);
    const again = rejectItem(back.log, 'room', 'r-well', { at: '2026-11-02', note: 'second' });
    if (!again.ok) throw new Error(again.reason);
    expect(again.log.decisions.map((d) => d.note)).toEqual(['second']);
  });
});

describe('editRoom and editLink (on the audited file)', () => {
  it('changes an accepted room, keeps the history and the sources, and records the edit', () => {
    const one = must(acceptRoom(candidates, audited, emptyLog(), 'r-gate', META));
    const out = must(editRoom(one.audited, one.log, 'r-gate', { description: 'A tall gate of iron.' }, { at: '2026-11-08', note: 'iron' }));
    const gate = roomOf(out.audited, 'r-gate');
    expect(gate.description).toBe('A tall gate of iron.');
    expect(gate.history?.map((h) => h.note)).toEqual(['review: accepted: checked in game', 'review: edited (description): iron']);
    expect(gate.sources.map((s) => s.date)).toEqual(['2026-10-01', '2026-11-07', '2026-11-08']);
    expect(out.log.decisions.at(-1)).toMatchObject({ status: 'edited', edits: ['description'], at: '2026-11-08' });
    expect(valid(out.audited)).toEqual([]);
  });

  it('refuses an edit of a room that is not accepted, one that changes nothing, and one that is not allowed', () => {
    const one = must(acceptRoom(candidates, audited, emptyLog(), 'r-gate', META));
    expect(editRoom(one.audited, one.log, 'r-barn', { title: 'x' }, META)).toEqual({ ok: false, reason: 'the room is not in the audited file' });
    expect(editRoom(one.audited, one.log, 'r-gate', { title: 'The Gate' }, META)).toEqual({ ok: false, reason: 'nothing changed' });
    expect(editRoom(one.audited, one.log, 'r-gate', { title: '' }, META).ok).toBe(false);
  });

  it('changes an accepted link: to a known room, to no target at all, and to a state', () => {
    const one = must(acceptLink(candidates, audited, emptyLog(), 'l1', META));
    const moved = must(editLink(one.audited, candidates, one.log, 'l1', { to: 'r-well' }, META));
    expect(moved.audited.links[0]).toMatchObject({ to: 'r-well', state: 'confirmed' });
    const gap = must(editLink(moved.audited, candidates, moved.log, 'l1', { to: null }, META));
    expect(gap.audited.links[0]).toMatchObject({ to: null, state: 'unknown-target', confidence: 0, reverse: false });
    const target = must(editLink(gap.audited, candidates, gap.log, 'l1', { to: 'r-barn', state: 'confirmed' }, META));
    expect(target.audited.links[0]).toMatchObject({ to: 'r-barn', state: 'confirmed', confidence: 0.95 });
    const down = must(editLink(target.audited, candidates, target.log, 'l1', { state: 'candidate' }, META));
    expect(down.audited.links[0]).toMatchObject({ state: 'candidate', confidence: 0.6 });
    expect(valid(down.audited)).toEqual([]);
  });

  it('refuses a link edit that names nothing new, an unknown link, or a target that is not a room', () => {
    const one = must(acceptLink(candidates, audited, emptyLog(), 'l1', META));
    expect(editLink(one.audited, candidates, one.log, 'l1', { to: 'r-barn' }, META)).toEqual({ ok: false, reason: 'nothing changed' });
    expect(editLink(one.audited, candidates, one.log, 'zz', { to: null }, META)).toEqual({ ok: false, reason: 'the link is not in the audited file' });
    expect(editLink(one.audited, candidates, one.log, 'l1', { to: 'nowhere' }, META).ok).toBe(false);
  });
});
