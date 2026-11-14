/**
 * The strict reader for a map file. Anything that comes from outside (a file on disk, an import, a request body, a
 * Builder export) goes through `validateMapFile` or `parseMapFile` before it is used.
 *
 * Strict means: unknown fields are errors (a typo is not silently dropped), every string and list has a cap, ids match
 * `ID_PATTERN`, numbers are finite and bounded, and the references hold together (every link starts at a live room and
 * ends at one, every exit slot names a link that starts there, every alias ends at a live room, ids and vnums are
 * unique). It reports up to `MAX_ERRORS` problems, each with the path to the value, and never throws.
 */

import {
  CONTENT_KINDS,
  DATE_PATTERN,
  DIRECTIONS,
  ID_PATTERN,
  LIMITS,
  LINK_STATES,
  MAP_SCHEMA_VERSION,
  SOURCE_KINDS,
  SUBZONE_KINDS,
  isDirection,
  type MapFile,
} from './schema.js';

export const MAX_ERRORS = 20;
/** The most characters `parseMapFile` accepts by default (about 40 MB of JSON). */
export const DEFAULT_MAX_TEXT = 40_000_000;

export type ValidationResult = { ok: true; map: MapFile } | { ok: false; errors: string[] };

type Obj = Record<string, unknown>;

class Check {
  readonly errors: string[] = [];
  fail(path: string, message: string): void {
    if (this.errors.length < MAX_ERRORS) this.errors.push(`${path}: ${message}`);
  }

  obj(value: unknown, path: string, allowed: readonly string[]): Obj | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      this.fail(path, 'must be an object');
      return null;
    }
    for (const key of Object.keys(value)) if (!allowed.includes(key)) this.fail(`${path}.${key}`, 'unknown field');
    return value as Obj;
  }
  arr(value: unknown, path: string, max: number): unknown[] | null {
    if (!Array.isArray(value)) {
      this.fail(path, 'must be a list');
      return null;
    }
    if (value.length > max) {
      this.fail(path, `has ${value.length} entries, the most allowed is ${max}`);
      return null;
    }
    return value;
  }
  str(value: unknown, path: string, max: number, minLength = 0): string | null {
    if (typeof value !== 'string') {
      this.fail(path, 'must be a string');
      return null;
    }
    if (value.length > max || value.length < minLength) {
      this.fail(path, `must be ${minLength > 0 ? `${minLength} to ` : 'at most '}${max} characters`);
      return null;
    }
    return value;
  }
  id(value: unknown, path: string): string | null {
    if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
      this.fail(path, 'must be an id (lower-case letters, digits, . _ : -, at most 64 characters)');
      return null;
    }
    return value;
  }
  date(value: unknown, path: string): string | null {
    if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
      this.fail(path, 'must be a date (YYYY-MM-DD or a UTC timestamp)');
      return null;
    }
    return value;
  }
  int(value: unknown, path: string, min: number, max: number): number | null {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
      this.fail(path, `must be a whole number from ${min} to ${max}`);
      return null;
    }
    return value;
  }
  bool(value: unknown, path: string): boolean | null {
    if (typeof value !== 'boolean') {
      this.fail(path, 'must be true or false');
      return null;
    }
    return value;
  }
  oneOf(value: unknown, path: string, options: readonly string[]): string | null {
    if (typeof value !== 'string' || !options.includes(value)) {
      this.fail(path, `must be one of ${options.join(', ')}`);
      return null;
    }
    return value;
  }
}

function sources(c: Check, value: unknown, path: string): void {
  const list = c.arr(value, path, LIMITS.maxSources);
  list?.forEach((entry, i) => {
    const p = `${path}[${i}]`;
    const o = c.obj(entry, p, ['kind', 'ref', 'credit', 'date']);
    if (!o) return;
    c.oneOf(o.kind, `${p}.kind`, SOURCE_KINDS);
    if (o.ref !== undefined) c.str(o.ref, `${p}.ref`, LIMITS.shortText);
    if (o.credit !== undefined) c.str(o.credit, `${p}.credit`, LIMITS.shortText);
    if (o.date !== undefined) c.date(o.date, `${p}.date`);
  });
}

function exitSlots(c: Check, value: unknown, path: string): Obj | null {
  const o = c.obj(value, path, DIRECTIONS);
  if (!o) return null;
  for (const dir of DIRECTIONS) if (o[dir] !== undefined) c.id(o[dir], `${path}.${dir}`);
  return o;
}

function link(c: Check, value: unknown, path: string): Obj | null {
  const o = c.obj(value, path, [
    'id',
    'from',
    'dir',
    'to',
    'state',
    'confidence',
    'offPage',
    'traversals',
    'reverse',
    'conflictTo',
    'lastWalked',
    'sources',
  ]);
  if (!o) return null;
  c.id(o.id, `${path}.id`);
  c.id(o.from, `${path}.from`);
  c.oneOf(o.dir, `${path}.dir`, DIRECTIONS);
  if (o.to !== null) c.id(o.to, `${path}.to`);
  const state = c.oneOf(o.state, `${path}.state`, LINK_STATES);
  if (state !== null && (state === 'unknown-target') !== (o.to === null))
    c.fail(`${path}.to`, 'must be null exactly when the state is unknown-target');
  if (typeof o.confidence !== 'number' || !(o.confidence >= 0 && o.confidence <= 1))
    c.fail(`${path}.confidence`, 'must be a number from 0 to 1');
  c.bool(o.offPage, `${path}.offPage`);
  c.int(o.traversals, `${path}.traversals`, 0, LIMITS.maxTraversals);
  c.bool(o.reverse, `${path}.reverse`);
  if (o.conflictTo !== undefined)
    c.arr(o.conflictTo, `${path}.conflictTo`, LIMITS.maxConflictTargets)?.forEach((t, i) =>
      c.id(t, `${path}.conflictTo[${i}]`),
    );
  if (o.lastWalked !== undefined) c.date(o.lastWalked, `${path}.lastWalked`);
  if (o.sources !== undefined) sources(c, o.sources, `${path}.sources`);
  return o;
}

function baseline(c: Check, value: unknown, path: string): void {
  const o = c.obj(value, path, ['visits', 'days', 'contents', 'was']);
  if (!o) return;
  c.int(o.visits, `${path}.visits`, 0, LIMITS.maxTraversals);
  c.arr(o.days, `${path}.days`, LIMITS.maxDays)?.forEach((d, i) => c.date(d, `${path}.days[${i}]`));
  c.arr(o.contents, `${path}.contents`, LIMITS.maxContents)?.forEach((entry, i) => {
    const p = `${path}.contents[${i}]`;
    const r = c.obj(entry, p, [
      'label',
      'kind',
      'status',
      'seen',
      'observed',
      'count',
      'days',
      'firstSeen',
      'lastSeen',
      'missed',
      'returns',
    ]);
    if (!r) return;
    c.str(r.label, `${p}.label`, LIMITS.shortText, 1);
    c.oneOf(r.kind, `${p}.kind`, CONTENT_KINDS);
    c.oneOf(r.status, `${p}.status`, ['transient', 'fixture']);
    c.int(r.seen, `${p}.seen`, 1, LIMITS.maxTraversals);
    c.int(r.observed, `${p}.observed`, 1, LIMITS.maxTraversals);
    if (typeof r.seen === 'number' && typeof r.observed === 'number' && r.seen > r.observed)
      c.fail(`${p}.seen`, 'cannot exceed observed');
    c.int(r.count, `${p}.count`, 1, 1_000);
    c.arr(r.days, `${p}.days`, LIMITS.maxDays)?.forEach((d, j) => c.date(d, `${p}.days[${j}]`));
    c.date(r.firstSeen, `${p}.firstSeen`);
    c.date(r.lastSeen, `${p}.lastSeen`);
    c.int(r.missed, `${p}.missed`, 0, LIMITS.maxTraversals);
    c.int(r.returns, `${p}.returns`, 0, LIMITS.maxTraversals);
  });
  c.arr(o.was, `${path}.was`, LIMITS.maxWas)?.forEach((entry, i) => {
    const p = `${path}.was[${i}]`;
    const r = c.obj(entry, p, [
      'label',
      'kind',
      'seen',
      'observed',
      'count',
      'firstSeen',
      'lastSeen',
      'demotedOn',
      'returns',
    ]);
    if (!r) return;
    c.str(r.label, `${p}.label`, LIMITS.shortText, 1);
    c.oneOf(r.kind, `${p}.kind`, CONTENT_KINDS);
    c.int(r.seen, `${p}.seen`, 1, LIMITS.maxTraversals);
    c.int(r.observed, `${p}.observed`, 1, LIMITS.maxTraversals);
    c.int(r.count, `${p}.count`, 1, 1_000);
    c.date(r.firstSeen, `${p}.firstSeen`);
    c.date(r.lastSeen, `${p}.lastSeen`);
    c.date(r.demotedOn, `${p}.demotedOn`);
    c.int(r.returns, `${p}.returns`, 0, LIMITS.maxTraversals);
  });
}

function history(c: Check, value: unknown, path: string): void {
  c.arr(value, path, LIMITS.maxHistory)?.forEach((entry, i) => {
    const p = `${path}[${i}]`;
    const o = c.obj(entry, p, ['at', 'op', 'with', 'note', 'undo']);
    if (!o) return;
    c.date(o.at, `${p}.at`);
    c.oneOf(o.op, `${p}.op`, ['create', 'merge', 'undo-merge', 'split']);
    if (o.with !== undefined) c.arr(o.with, `${p}.with`, 8)?.forEach((w, j) => c.id(w, `${p}.with[${j}]`));
    if (o.note !== undefined) c.str(o.note, `${p}.note`, LIMITS.shortText);
    if (o.undo === undefined) return;
    const u = c.obj(o.undo, `${p}.undo`, [
      'absorbed',
      'moved',
      'dropped',
      'changed',
      'absorbedExits',
      'keptBaseline',
      'keptExits',
    ]);
    if (!u) return;
    c.id(u.absorbed, `${p}.undo.absorbed`);
    c.arr(u.moved, `${p}.undo.moved`, 1_000)?.forEach((m, j) => {
      const mo = c.obj(m, `${p}.undo.moved[${j}]`, ['link', 'end']);
      if (!mo) return;
      c.id(mo.link, `${p}.undo.moved[${j}].link`);
      c.oneOf(mo.end, `${p}.undo.moved[${j}].end`, ['from', 'to']);
    });
    c.arr(u.dropped, `${p}.undo.dropped`, 64)?.forEach((l, j) => link(c, l, `${p}.undo.dropped[${j}]`));
    c.arr(u.changed, `${p}.undo.changed`, 64)?.forEach((l, j) => link(c, l, `${p}.undo.changed[${j}]`));
    exitSlots(c, u.absorbedExits, `${p}.undo.absorbedExits`);
    exitSlots(c, u.keptExits, `${p}.undo.keptExits`);
    if (u.keptBaseline !== null) baseline(c, u.keptBaseline, `${p}.undo.keptBaseline`);
  });
}

/** The strict check of an already parsed value. The same object comes back as the typed map when it is valid. */
export function validateMapFile(input: unknown): ValidationResult {
  const c = new Check();
  const root = c.obj(input, 'map', ['version', 'generatedAt', 'continents', 'links']);
  if (!root) return { ok: false, errors: c.errors };
  if (root.version !== MAP_SCHEMA_VERSION) {
    c.fail('map.version', `unsupported version (this reader understands ${MAP_SCHEMA_VERSION})`);
    return { ok: false, errors: c.errors };
  }
  if (root.generatedAt !== undefined) c.date(root.generatedAt, 'map.generatedAt');

  const roomIds = new Set<string>();
  const live = new Set<string>();
  const vnums = new Set<number>();
  const areaIds = new Set<string>();
  const subzoneIds = new Set<string>();
  const continentIds = new Set<string>();
  const roomExits: { id: string; exits: Obj }[] = [];
  const aliases = new Map<string, string>();
  let areas = 0;
  let subzones = 0;
  let rooms = 0;

  c.arr(root.continents, 'map.continents', LIMITS.maxContinents)?.forEach((continent, ci) => {
    const cp = `map.continents[${ci}]`;
    const co = c.obj(continent, cp, ['id', 'name', 'areas']);
    if (!co) return;
    const cid = c.id(co.id, `${cp}.id`);
    if (cid !== null && continentIds.has(cid)) c.fail(`${cp}.id`, 'duplicate continent id');
    if (cid !== null) continentIds.add(cid);
    c.str(co.name, `${cp}.name`, LIMITS.shortText, 1);
    c.arr(co.areas, `${cp}.areas`, LIMITS.maxAreas)?.forEach((area, ai) => {
      const ap = `${cp}.areas[${ai}]`;
      areas += 1;
      if (areas > LIMITS.maxAreas) return c.fail(ap, `more than ${LIMITS.maxAreas} areas in the file`);
      const ao = c.obj(area, ap, ['id', 'name', 'placement', 'subzones', 'sources']);
      if (!ao) return;
      const aid = c.id(ao.id, `${ap}.id`);
      if (aid !== null && areaIds.has(aid)) c.fail(`${ap}.id`, 'duplicate area id');
      if (aid !== null) areaIds.add(aid);
      c.str(ao.name, `${ap}.name`, LIMITS.shortText, 1);
      if (ao.placement !== null) {
        const po = c.obj(ao.placement, `${ap}.placement`, ['x', 'y', 'w', 'h']);
        if (po) {
          for (const key of ['x', 'y'] as const)
            c.int(po[key], `${ap}.placement.${key}`, -LIMITS.maxCoord, LIMITS.maxCoord);
          for (const key of ['w', 'h'] as const)
            if (po[key] !== undefined) c.int(po[key], `${ap}.placement.${key}`, 1, LIMITS.maxCoord);
        }
      }
      if (ao.sources !== undefined) sources(c, ao.sources, `${ap}.sources`);
      c.arr(ao.subzones, `${ap}.subzones`, LIMITS.maxSubzones)?.forEach((subzone, si) => {
        const sp = `${ap}.subzones[${si}]`;
        subzones += 1;
        if (subzones > LIMITS.maxSubzones) return c.fail(sp, `more than ${LIMITS.maxSubzones} subzones in the file`);
        const so = c.obj(subzone, sp, ['id', 'name', 'kind', 'rooms']);
        if (!so) return;
        const sid = c.id(so.id, `${sp}.id`);
        if (sid !== null && subzoneIds.has(sid)) c.fail(`${sp}.id`, 'duplicate subzone id');
        if (sid !== null) subzoneIds.add(sid);
        c.str(so.name, `${sp}.name`, LIMITS.shortText, 1);
        c.oneOf(so.kind, `${sp}.kind`, SUBZONE_KINDS);
        c.arr(so.rooms, `${sp}.rooms`, LIMITS.maxRooms)?.forEach((room, ri) => {
          const rp = `${sp}.rooms[${ri}]`;
          rooms += 1;
          if (rooms > LIMITS.maxRooms) return c.fail(rp, `more than ${LIMITS.maxRooms} rooms in the file`);
          const ro = c.obj(room, rp, [
            'id',
            'title',
            'sector',
            'vnum',
            'description',
            'exits',
            'coords',
            'baseline',
            'sources',
            'aliasOf',
            'history',
          ]);
          if (!ro) return;
          const rid = c.id(ro.id, `${rp}.id`);
          if (rid !== null && roomIds.has(rid)) c.fail(`${rp}.id`, 'duplicate room id');
          if (rid !== null) roomIds.add(rid);
          c.str(ro.title, `${rp}.title`, LIMITS.shortText, 1);
          if (ro.sector !== undefined) c.str(ro.sector, `${rp}.sector`, LIMITS.shortText);
          if (ro.description !== undefined) c.str(ro.description, `${rp}.description`, LIMITS.description);
          const vnum = ro.vnum === undefined ? null : c.int(ro.vnum, `${rp}.vnum`, 0, LIMITS.maxVnum);
          const exits = exitSlots(c, ro.exits, `${rp}.exits`);
          if (ro.coords !== undefined) {
            const xo = c.obj(ro.coords, `${rp}.coords`, ['x', 'y', 'z']);
            if (xo) {
              c.int(xo.x, `${rp}.coords.x`, -LIMITS.maxCoord, LIMITS.maxCoord);
              c.int(xo.y, `${rp}.coords.y`, -LIMITS.maxCoord, LIMITS.maxCoord);
              if (xo.z !== undefined) c.int(xo.z, `${rp}.coords.z`, -LIMITS.maxCoord, LIMITS.maxCoord);
            }
          }
          if (ro.baseline !== undefined) baseline(c, ro.baseline, `${rp}.baseline`);
          sources(c, ro.sources, `${rp}.sources`);
          if (ro.history !== undefined) history(c, ro.history, `${rp}.history`);
          if (ro.aliasOf !== undefined) {
            const target = c.id(ro.aliasOf, `${rp}.aliasOf`);
            if (rid !== null && target !== null) aliases.set(rid, target);
            if (exits && DIRECTIONS.some((d) => exits[d] !== undefined))
              c.fail(`${rp}.exits`, 'a merged-away room has no exits');
          } else if (rid !== null) {
            live.add(rid);
            if (vnum !== null) {
              if (vnums.has(vnum)) c.fail(`${rp}.vnum`, 'two live rooms share this vnum');
              vnums.add(vnum);
            }
          }
          if (rid !== null && exits) roomExits.push({ id: rid, exits });
        });
      });
    });
  });

  for (const [from, target] of aliases) {
    let current = target;
    let hops = 0;
    while (aliases.has(current) && hops < 16) {
      current = aliases.get(current) as string;
      hops += 1;
    }
    if (!roomIds.has(target)) c.fail(`room ${from}`, `aliasOf names a room that is not in the file (${target})`);
    else if (!live.has(current))
      c.fail(`room ${from}`, 'aliasOf does not end at a live room (a loop, or a chain that is too long)');
  }

  const linkIds = new Set<string>();
  const linksById = new Map<string, Obj>();
  c.arr(root.links, 'map.links', LIMITS.maxLinks)?.forEach((entry, i) => {
    const p = `map.links[${i}]`;
    const o = link(c, entry, p);
    if (!o) return;
    if (typeof o.id === 'string') {
      if (linkIds.has(o.id)) c.fail(`${p}.id`, 'duplicate link id');
      linkIds.add(o.id);
      linksById.set(o.id, o);
    }
    if (typeof o.from === 'string' && !live.has(o.from)) c.fail(`${p}.from`, 'must be a live room in the file');
    // an exit marked off-page may lead to a room on another page (another file, as in the per-area candidate files); every other link ends here
    if (typeof o.to === 'string' && !live.has(o.to) && o.offPage !== true)
      c.fail(`${p}.to`, 'must be a live room in the file (or the link marked off-page)');
  });
  for (const { id, exits } of roomExits) {
    for (const dir of DIRECTIONS) {
      const slot = exits[dir];
      if (typeof slot !== 'string') continue;
      const target = linksById.get(slot);
      if (!target) c.fail(`room ${id}.exits.${dir}`, `names a link that is not in the file (${slot})`);
      else if (target.from !== id || target.dir !== dir)
        c.fail(`room ${id}.exits.${dir}`, 'names a link that does not start at this room in this direction');
    }
  }
  const exitsOf = new Map(roomExits.map((r) => [r.id, r.exits] as const));
  for (const [id, l] of linksById) {
    if (typeof l.from !== 'string' || !isDirection(l.dir)) continue;
    const exits = exitsOf.get(l.from);
    if (exits && exits[l.dir] !== id) c.fail(`link ${id}`, "is not in its room's exit slot");
  }

  return c.errors.length === 0 ? { ok: true, map: input as MapFile } : { ok: false, errors: c.errors };
}

/** Text in, typed map out (or the reasons not). The text is size-checked before it is parsed. */
export function parseMapFile(text: string, maxChars: number = DEFAULT_MAX_TEXT): ValidationResult {
  if (typeof text !== 'string') return { ok: false, errors: ['map: must be text'] };
  if (text.length > maxChars)
    return { ok: false, errors: [`map: ${text.length} characters, the most allowed is ${maxChars}`] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['map: not valid JSON'] };
  }
  return validateMapFile(parsed);
}
