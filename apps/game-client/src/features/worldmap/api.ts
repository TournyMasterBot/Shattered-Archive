// apps/game-client/src/features/worldmap/api.ts
//
// Client of the C# site's world-map API (GET /api/world-map/index|area/{id}|search and GET /api/health). Production feature: it reads only the
// audited layer the site publishes. See docs/shattered-maps/world-map-api.md for the routes and docs/shattered-maps/surfaces.md for the pane.
//
// Rules: every call takes an AbortSignal and a cancelled call answers { kind: 'aborted' } (never an error the UI would show); a network
// failure is { kind: 'offline' }; the site's own { error } text is kept for http failures; a body that is not the documented shape is
// { kind: 'invalid' }. Whole areas are kept in memory. Revalidation by ETag is the BROWSER's job (a plain GET: no custom request header, so
// no CORS preflight, and the ETag header is not readable cross-origin anyway); this client adds the one thing the browser cannot know:
// /api/health says whether the site was restarted since it was last asked (at most every `freshnessMs`), and if so the memory is dropped
// and each URL is fetched once with cache: 'reload', past the browser's five-minute copy.

import type { Link, MapFile, Room } from '@shatteredarchive/shattered-maps-core';

export interface WorldMapIndex {
  available: boolean;
  versionId: string;
  publishedAt?: string;
  credits: string[];
  continents: { id: string; name: string; areas: number; rooms: number }[];
  areas: { id: string; name: string; continentId: string; rooms: number }[];
}

export interface SearchHit {
  roomId: string;
  title: string;
  areaId: string;
  areaName: string;
  subzoneId: string;
}

/** Which area a room is in (GET /api/world-map/room/{id}): how an exit that leaves the area is followed. */
export interface RoomArea {
  roomId: string;
  areaId: string;
  areaName: string;
}

export interface SearchResult {
  versionId: string;
  q: string;
  total: number;
  results: SearchHit[];
}

/** One whole area, its pages joined: a map file the shared slicer understands. */
export interface LoadedArea {
  id: string;
  name: string;
  continentId: string;
  versionId: string;
  credits: string[];
  map: MapFile;
}

export type ApiError =
  | { kind: 'offline' }
  | { kind: 'http'; status: number; message: string }
  | { kind: 'invalid' }
  | { kind: 'aborted' };

export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: ApiError };

export interface WorldMapApiOptions {
  baseUrl: string;
  /** The route the map is served under (default `/api/world-map`, the DSL's). Only a local-only world module gives another one. */
  mapPrefix?: string;
  fetchFn?: typeof fetch;
  /** How often /api/health is asked to notice a redeploy. Default 5 minutes. */
  freshnessMs?: number;
  now?: () => number;
}

export interface WorldMapApi {
  getIndex(signal: AbortSignal): Promise<ApiResult<WorldMapIndex>>;
  getArea(areaId: string, signal: AbortSignal): Promise<ApiResult<LoadedArea>>;
  search(q: string, signal: AbortSignal): Promise<ApiResult<SearchResult>>;
  /** The area a room belongs to; an http 404 when the map has no such room. */
  getRoomArea(roomId: string, signal: AbortSignal): Promise<ApiResult<RoomArea>>;
  /** Drops cached answers when the site restarted since the last look. Cheap; safe to call before every use. */
  checkFresh(signal: AbortSignal): Promise<void>;
}

const PAGE = 300;
const MAX_PAGES = 400; // 120,000 rooms: far above the schema's cap; stops a server that never ends its paging
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string';
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isString);

function asIndex(v: unknown): WorldMapIndex | null {
  if (!isObject(v) || typeof v.available !== 'boolean' || !isString(v.versionId)) return null;
  const continents = Array.isArray(v.continents) ? v.continents : [];
  const areas = Array.isArray(v.areas) ? v.areas : [];
  const okContinents = continents.every(
    (c) =>
      isObject(c) && isString(c.id) && isString(c.name) && typeof c.areas === 'number' && typeof c.rooms === 'number',
  );
  const okAreas = areas.every(
    (a) => isObject(a) && isString(a.id) && isString(a.name) && isString(a.continentId) && typeof a.rooms === 'number',
  );
  if (!okContinents || !okAreas) return null;
  return {
    available: v.available,
    versionId: v.versionId,
    publishedAt: isString(v.publishedAt) ? v.publishedAt : undefined,
    credits: isStringArray(v.credits) ? v.credits : [],
    continents: continents as WorldMapIndex['continents'],
    areas: areas as WorldMapIndex['areas'],
  };
}

interface AreaPage {
  versionId: string;
  area: {
    id: string;
    name: string;
    continentId: string;
    placement: unknown;
    subzones: { id: string; name: string; kind: string; rooms: Room[] }[];
  };
  links: Link[];
  nextOffset: number | null;
  credits: string[];
}

function asAreaPage(v: unknown): AreaPage | null {
  if (!isObject(v) || !isString(v.versionId) || !isObject(v.area) || !Array.isArray(v.links)) return null;
  const area = v.area;
  if (!isString(area.id) || !isString(area.name) || !isString(area.continentId) || !Array.isArray(area.subzones))
    return null;
  const subzonesOk = area.subzones.every(
    (s) =>
      isObject(s) &&
      isString(s.id) &&
      isString(s.name) &&
      isString(s.kind) &&
      Array.isArray(s.rooms) &&
      s.rooms.every((r) => isObject(r) && isString(r.id)),
  );
  const next = v.nextOffset;
  if (!subzonesOk || !(next === null || (typeof next === 'number' && Number.isInteger(next) && next > 0))) return null;
  return {
    versionId: v.versionId,
    area: area as AreaPage['area'],
    links: v.links as Link[],
    nextOffset: next,
    credits: isStringArray(v.credits) ? v.credits : [],
  };
}

const ROOM_ID = /^[a-z0-9][a-z0-9._:-]{0,63}$/;

function asRoomArea(v: unknown, wanted: string): RoomArea | null {
  if (!isObject(v) || v.roomId !== wanted || !isString(v.areaId) || !isString(v.areaName) || !ID.test(v.areaId))
    return null;
  return { roomId: wanted, areaId: v.areaId, areaName: v.areaName };
}

function asSearch(v: unknown): SearchResult | null {
  if (
    !isObject(v) ||
    !isString(v.versionId) ||
    !isString(v.q) ||
    typeof v.total !== 'number' ||
    !Array.isArray(v.results)
  )
    return null;
  const ok = v.results.every(
    (r) =>
      isObject(r) &&
      isString(r.roomId) &&
      isString(r.title) &&
      isString(r.areaId) &&
      isString(r.areaName) &&
      isString(r.subzoneId),
  );
  return ok ? { versionId: v.versionId, q: v.q, total: v.total, results: v.results as SearchHit[] } : null;
}

export function createWorldMapApi(options: WorldMapApiOptions): WorldMapApi {
  const base = options.baseUrl.replace(/\/+$/, '');
  const prefix = options.mapPrefix ?? '/api/world-map';
  const doFetch = options.fetchFn ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const now = options.now ?? Date.now;
  const freshnessMs = options.freshnessMs ?? 5 * 60 * 1000;

  const areas = new Map<string, LoadedArea>();
  const roomAreas = new Map<string, RoomArea>();
  /** Bumped when the site restarted; a URL is fetched past the browser cache once per generation. */
  let generation = 0;
  const fetchedIn = new Map<string, number>();
  let startedAt: string | null = null;
  let lastHealthAt = Number.NEGATIVE_INFINITY;

  async function get(path: string, signal: AbortSignal): Promise<ApiResult<unknown>> {
    const url = `${base}${path}`;
    const reload = generation > 0 && fetchedIn.get(url) !== generation;
    let response: Response;
    try {
      response = await doFetch(url, {
        headers: { Accept: 'application/json' },
        signal,
        ...(reload ? { cache: 'reload' as RequestCache } : {}),
      });
    } catch (error) {
      if (signal.aborted || (error instanceof Error && error.name === 'AbortError'))
        return { ok: false, error: { kind: 'aborted' } };
      return { ok: false, error: { kind: 'offline' } };
    }
    let body: unknown = null;
    try {
      body = await response.json();
    } catch (error) {
      if (signal.aborted || (error instanceof Error && error.name === 'AbortError'))
        return { ok: false, error: { kind: 'aborted' } };
      body = null;
    }
    if (!response.ok) {
      const message =
        isObject(body) && isString(body.error) ? body.error.slice(0, 200) : `The server answered ${response.status}.`;
      return { ok: false, error: { kind: 'http', status: response.status, message } };
    }
    if (body === null) return { ok: false, error: { kind: 'invalid' } };
    fetchedIn.set(url, generation);
    return { ok: true, value: body };
  }

  async function checkFresh(signal: AbortSignal): Promise<void> {
    if (now() - lastHealthAt < freshnessMs) return;
    lastHealthAt = now();
    let response: Response;
    try {
      response = await doFetch(`${base}/api/health`, {
        headers: { Accept: 'application/json' },
        signal,
        cache: 'no-store',
      });
    } catch {
      return; // health unreachable: keep what is cached, the next real call reports the failure
    }
    if (!response.ok) return;
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return;
    }
    const started = isObject(body) && isString(body.startedAt) ? body.startedAt : null;
    if (started === null) return;
    if (startedAt !== null && started !== startedAt) {
      generation += 1;
      areas.clear();
      roomAreas.clear();
    }
    startedAt = started;
  }

  return {
    checkFresh,

    async getIndex(signal) {
      const r = await get(`${prefix}/index`, signal);
      if (!r.ok) return r;
      const index = asIndex(r.value);
      return index ? { ok: true, value: index } : { ok: false, error: { kind: 'invalid' } };
    },

    async search(q, signal) {
      const r = await get(`${prefix}/search?q=${encodeURIComponent(q)}&limit=100`, signal);
      if (!r.ok) return r;
      const result = asSearch(r.value);
      return result ? { ok: true, value: result } : { ok: false, error: { kind: 'invalid' } };
    },

    async getRoomArea(roomId, signal) {
      if (!ROOM_ID.test(roomId)) return { ok: false, error: { kind: 'invalid' } };
      const known = roomAreas.get(roomId);
      if (known) return { ok: true, value: known };
      const r = await get(`${prefix}/room/${encodeURIComponent(roomId)}`, signal);
      if (!r.ok) return r;
      const found = asRoomArea(r.value, roomId);
      if (!found) return { ok: false, error: { kind: 'invalid' } };
      roomAreas.set(roomId, found);
      return { ok: true, value: found };
    },

    async getArea(areaId, signal) {
      if (!ID.test(areaId) || areaId.length > 64) return { ok: false, error: { kind: 'invalid' } };
      const known = areas.get(areaId);
      if (known) return { ok: true, value: known };
      const subzones: { id: string; name: string; kind: string; rooms: Room[] }[] = [];
      const byId = new Map<string, (typeof subzones)[number]>();
      const links: Link[] = [];
      let head: AreaPage | null = null;
      let offset = 0;
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const r = await get(`${prefix}/area/${encodeURIComponent(areaId)}?limit=${PAGE}&offset=${offset}`, signal);
        if (!r.ok) return r;
        const body = asAreaPage(r.value);
        if (!body || body.area.id !== areaId || (head && body.versionId !== head.versionId))
          return { ok: false, error: { kind: 'invalid' } };
        head ??= body;
        for (const sz of body.area.subzones) {
          let into = byId.get(sz.id);
          if (!into) {
            into = { id: sz.id, name: sz.name, kind: sz.kind, rooms: [] };
            byId.set(sz.id, into);
            subzones.push(into);
          }
          into.rooms.push(...sz.rooms);
        }
        links.push(...body.links);
        if (body.nextOffset === null) {
          const map = {
            version: 1,
            continents: [
              {
                id: head.area.continentId,
                name: head.area.continentId,
                areas: [{ id: head.area.id, name: head.area.name, placement: head.area.placement, subzones }],
              },
            ],
            links,
          } as unknown as MapFile;
          const loaded: LoadedArea = {
            id: head.area.id,
            name: head.area.name,
            continentId: head.area.continentId,
            versionId: head.versionId,
            credits: head.credits,
            map,
          };
          areas.set(areaId, loaded);
          return { ok: true, value: loaded };
        }
        if (body.nextOffset <= offset) return { ok: false, error: { kind: 'invalid' } }; // a server that does not move forward
        offset = body.nextOffset;
      }
      return { ok: false, error: { kind: 'invalid' } };
    },
  };
}
