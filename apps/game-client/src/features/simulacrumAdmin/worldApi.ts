/**
 * Reads the area and room list from the local-only read-only vhost (docs/game/simulacrum-admin.md, "World data"). Two GET calls and
 * nothing else: `/api/map` (every area) and `/api/map/<file>.are` (one area's rooms). Every failure is a value, never a throw: the tabs
 * show an offline or error state and keep working (E8).
 */

export interface WorldArea {
  file: string;
  name?: string;
  minVnum?: number;
  maxVnum?: number;
  rooms: number;
  /** The server could not read this area file; kept so the owner can see which one. */
  parseError?: string;
}

export interface WorldRoom {
  vnum: number;
  /** Colour codes removed. */
  name: string;
}

export type WorldResult<T> =
  | { ok: true; data: T; at: number }
  | { ok: false; kind: 'offline' | 'error' | 'aborted'; message: string };

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Looks `fetch` up when called, so an environment without it (a test) gives an offline result instead of a ReferenceError. */
const browserFetch: FetchLike = (input, init) => fetch(input, init);

const AREA_FILE = /^[A-Za-z0-9_][A-Za-z0-9_.-]*\.are$/;

/** `{R`-style colour codes out, `{{` back to `{`. */
export function stripColourCodes(text: string): string {
  return text.replace(/\{(?:\{|[A-Za-z])/g, (m) => (m === '{{' ? '{' : ''));
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;
const optionalVnum = (value: unknown): boolean => value === undefined || isCount(value);

/** Hand-written check of one entry of `/api/map` `areas`. Unknown fields are ignored; a wrong type rejects. */
function parseArea(value: unknown): WorldArea | undefined {
  if (!isRecord(value)) return undefined;
  const { file, name, minVnum, maxVnum, rooms, parseError } = value;
  if (typeof file !== 'string' || !AREA_FILE.test(file) || !isCount(rooms)) return undefined;
  if (name !== undefined && typeof name !== 'string') return undefined;
  if (!optionalVnum(minVnum) || !optionalVnum(maxVnum)) return undefined;
  if (parseError !== undefined && typeof parseError !== 'string') return undefined;
  return {
    file,
    rooms,
    ...(typeof name === 'string' ? { name: stripColourCodes(name) } : {}),
    ...(typeof minVnum === 'number' ? { minVnum } : {}),
    ...(typeof maxVnum === 'number' ? { maxVnum } : {}),
    ...(typeof parseError === 'string' ? { parseError } : {}),
  };
}

function parseAreas(body: unknown): WorldArea[] | undefined {
  if (!isRecord(body) || !Array.isArray(body.areas)) return undefined;
  const areas: WorldArea[] = [];
  for (const entry of body.areas) {
    const area = parseArea(entry);
    if (!area) return undefined;
    areas.push(area);
  }
  return areas;
}

/** Hand-written check of `/api/map/<file>`: only the vnum and the name of each room are kept (exits and the rest are dropped). */
function parseRooms(body: unknown): WorldRoom[] | undefined {
  if (!isRecord(body) || !Array.isArray(body.rooms)) return undefined;
  const rooms: WorldRoom[] = [];
  for (const entry of body.rooms) {
    if (!isRecord(entry) || !isCount(entry.vnum) || entry.vnum < 1 || typeof entry.name !== 'string') return undefined;
    rooms.push({ vnum: entry.vnum, name: stripColourCodes(entry.name) });
  }
  return rooms;
}

async function getJson<T>(
  url: string,
  parse: (body: unknown) => T | undefined,
  signal: AbortSignal | undefined,
  fetchImpl: FetchLike,
  now: () => number,
): Promise<WorldResult<T>> {
  let response: Response;
  try {
    // no credentials, no cookies: the vhost is public inside the private network and needs none
    response = await fetchImpl(url, { signal, headers: { Accept: 'application/json' }, credentials: 'omit', cache: 'no-store' });
  } catch (error) {
    if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      return { ok: false, kind: 'aborted', message: 'The request was cancelled.' };
    }
    return { ok: false, kind: 'offline', message: 'The world index could not be reached. Is the local nginx running with the Simulacrum Admin vhost?' };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, kind: 'error', message: `The world index answered ${response.status} with something that is not JSON.` };
  }
  if (!response.ok) {
    const detail = isRecord(body) && typeof body.error === 'string' ? `: ${body.error}` : '';
    return { ok: false, kind: 'error', message: `The world index answered ${response.status}${detail}` };
  }
  const data = parse(body);
  if (data === undefined) return { ok: false, kind: 'error', message: 'The world index answered in a shape this panel does not know.' };
  return { ok: true, data, at: now() };
}

export function fetchAreas(
  base: string,
  signal?: AbortSignal,
  fetchImpl: FetchLike = browserFetch,
  now: () => number = Date.now,
): Promise<WorldResult<WorldArea[]>> {
  return getJson(`${base}/api/map`, parseAreas, signal, fetchImpl, now);
}

export function fetchRooms(
  base: string,
  file: string,
  signal?: AbortSignal,
  fetchImpl: FetchLike = browserFetch,
  now: () => number = Date.now,
): Promise<WorldResult<WorldRoom[]>> {
  // the file name is checked before it is put in a URL: nothing but an area file name can be asked for
  if (!AREA_FILE.test(file)) return Promise.resolve({ ok: false, kind: 'error', message: 'That is not an area file name.' });
  return getJson(`${base}/api/map/${encodeURIComponent(file)}`, parseRooms, signal, fetchImpl, now);
}
