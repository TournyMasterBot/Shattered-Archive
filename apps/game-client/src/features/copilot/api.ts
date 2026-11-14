import {
  readBucketTable,
  validateDecision,
  validateSuggestion,
  validateTicket,
  type BucketTable,
  type Decision,
  type EscalationTicket,
  type Suggestion,
} from '@shatteredarchive/copilot-core';

/**
 * Why a call gave nothing. `offline`: the server could not be reached (or took too long): the window shows "offline", suggests nothing
 * and never queues a command (E1). `aborted`: the caller cancelled. `http`: the server answered with an error status. `invalid`: what
 * was sent or received did not pass validation.
 */
export type ApiFailure = 'offline' | 'aborted' | 'http' | 'invalid';

export type ApiResult<T> = { ok: true; value: T } | { ok: false; reason: ApiFailure; status?: number };

/** The part of `GET /state` the client uses. */
export interface ServerState {
  connected: boolean;
  stale: boolean;
  staleAfterSeconds: number;
  lastEventAgeSeconds: number | null;
  /** Seconds since the last line of the text feed; absent from a server older than the auto-approval phase (then nothing runs by itself). */
  lastTextAgeSeconds?: number | null;
  inFight: boolean;
  /** Whether the server is reading the game logs (the Copilot switch); absent from a server older than the switch. */
  learning?: boolean;
  room: { name: string; sector: string; exits: string[] } | null;
}

export interface CharacterSummary {
  codename: string;
  kind: 'test' | 'real';
  gender: 'M' | 'F' | 'U';
  hasDescription: boolean;
}

/** Claude training mode as the server reports it (apps/copilot-server/src/training.ts). */
export interface TrainingStatus {
  enabled: boolean;
  /** The world of the connection the server saw (the Simulacrum is `sandbox`), or absent when none. */
  world?: 'dsl' | 'sandbox';
  /** True when the server would turn it on now. */
  canEnable: boolean;
  refusal?: 'not-simulacrum' | 'copilot-off';
}

/** A walked room from `GET /world/near`, cut down to what the map window's add-room flow uses. */
export interface NearRoomWire {
  title: string;
  sector?: string;
  visits: number;
  sameExits: boolean;
  /** Each walked exit: the compass letter and the title of the room it led to (absent when not known). */
  exits: { dir: string; toTitle?: string }[];
}

export interface CopilotApiOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  /** Per call (default 10 s); a call that takes longer is `offline`. */
  timeoutMs?: number;
}

export interface CopilotApi {
  getState(signal: AbortSignal): Promise<ApiResult<ServerState>>;
  /** Tell the server to start or stop reading the game logs (the Copilot switch). Answers with the state it now has. */
  setLearning(enabled: boolean, signal: AbortSignal): Promise<ApiResult<{ enabled: boolean }>>;
  /** Claude training mode: whether it is on, the world of the connection, and why it cannot be turned on now. */
  getTraining(signal: AbortSignal): Promise<ApiResult<TrainingStatus>>;
  /** Turn Claude training on or off. The server refuses (409) against anything but the Simulacrum; the answer is then `http` with that status. */
  setTraining(enabled: boolean, signal: AbortSignal): Promise<ApiResult<TrainingStatus>>;
  /** The server's walked rooms with this title in one map world (`GET /world/near`); entries that are not rooms are dropped. */
  nearRooms(world: string, title: string, exits: string[], signal: AbortSignal): Promise<ApiResult<NearRoomWire[]>>;
  /** Only suggestions that pass `validateSuggestion` are returned. */
  getSuggestions(signal: AbortSignal): Promise<ApiResult<Suggestion[]>>;
  getCharacters(signal: AbortSignal): Promise<ApiResult<CharacterSummary[]>>;
  /** The tickets still open (what the agent could not settle and the owner or a teaching session must). Invalid ones are dropped. */
  getOpenTickets(signal: AbortSignal): Promise<ApiResult<EscalationTicket[]>>;
  /** The decision is validated before anything is sent. */
  postDecision(decision: Decision, signal: AbortSignal): Promise<ApiResult<{ written: boolean }>>;
  /** The owner's answers per (sphere, kind), counted by the server from its ledger. Entries that are not real buckets are dropped. */
  getBucketStats(signal: AbortSignal): Promise<ApiResult<BucketTable>>;
  /** The ticket is validated before anything is sent. `written` is false when the server already had it. */
  postTicket(ticket: EscalationTicket, signal: AbortSignal): Promise<ApiResult<{ written: boolean }>>;
}

/**
 * The client of the Copilot server. Every call takes an `AbortSignal` (the window aborts on unmount), never throws, and answers with
 * an `ApiResult`. There is no retry and no queue: an unreachable server is `offline` and the caller shows that.
 */
export function createCopilotApi(options: CopilotApiOptions): CopilotApi {
  const base = options.baseUrl.replace(/\/+$/, '');
  // looked up per call: some environments (and old browsers) have no global fetch until it is used
  const doFetch: typeof fetch = options.fetch ?? ((input, init) => fetch(input, init));
  const timeoutMs = options.timeoutMs ?? 10_000;

  async function call(path: string, init: RequestInit, signal: AbortSignal): Promise<ApiResult<unknown>> {
    if (signal.aborted) return { ok: false, reason: 'aborted' };
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), timeoutMs);
    const onAbort = (): void => timeout.abort();
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      const res = await doFetch(`${base}${path}`, { ...init, signal: timeout.signal });
      if (!res.ok) return { ok: false, reason: 'http', status: res.status };
      try {
        return { ok: true, value: await res.json() };
      } catch {
        return { ok: false, reason: 'invalid' };
      }
    } catch {
      return { ok: false, reason: signal.aborted ? 'aborted' : 'offline' };
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    }
  }

  const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

  function readTraining(res: ApiResult<unknown>): ApiResult<TrainingStatus> {
    if (!res.ok) return res;
    const v = res.value;
    const valid =
      isRecord(v) &&
      typeof v.enabled === 'boolean' &&
      typeof v.canEnable === 'boolean' &&
      (v.world === undefined || v.world === 'dsl' || v.world === 'sandbox') &&
      (v.refusal === undefined || v.refusal === 'not-simulacrum' || v.refusal === 'copilot-off');
    return valid ? { ok: true, value: v as unknown as TrainingStatus } : { ok: false, reason: 'invalid' };
  }

  return {
    async getState(signal) {
      const res = await call('/state', {}, signal);
      if (!res.ok) return res;
      const v = res.value;
      const valid =
        isRecord(v) &&
        typeof v.connected === 'boolean' &&
        typeof v.stale === 'boolean' &&
        typeof v.staleAfterSeconds === 'number' &&
        typeof v.inFight === 'boolean' &&
        (v.lastEventAgeSeconds === null || typeof v.lastEventAgeSeconds === 'number') &&
        (v.learning === undefined || typeof v.learning === 'boolean') &&
        (v.room === null || isRecord(v.room));
      return valid ? { ok: true, value: v as unknown as ServerState } : { ok: false, reason: 'invalid' };
    },

    async setLearning(enabled, signal) {
      const res = await call('/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) }, signal);
      if (!res.ok) return res;
      const now = isRecord(res.value) ? res.value.enabled : undefined;
      return typeof now === 'boolean' ? { ok: true, value: { enabled: now } } : { ok: false, reason: 'invalid' };
    },

    async getTraining(signal) {
      return readTraining(await call('/training', {}, signal));
    },

    async setTraining(enabled, signal) {
      return readTraining(await call('/training', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) }, signal));
    },

    async nearRooms(world, title, exits, signal) {
      const query = new URLSearchParams({ title, exits: exits.join(','), world });
      const res = await call(`/world/near?${query.toString()}`, {}, signal);
      if (!res.ok) return res;
      const list = isRecord(res.value) ? res.value.rooms : undefined;
      if (!Array.isArray(list)) return { ok: false, reason: 'invalid' };
      const rooms: NearRoomWire[] = [];
      for (const item of list) {
        if (!isRecord(item) || typeof item.title !== 'string' || typeof item.visits !== 'number' || typeof item.sameExits !== 'boolean' || !Array.isArray(item.exits)) continue;
        const exitList = item.exits.flatMap((e: unknown) =>
          isRecord(e) && typeof e.dir === 'string' ? [{ dir: e.dir, ...(typeof e.toTitle === 'string' ? { toTitle: e.toTitle } : {}) }] : [],
        );
        rooms.push({ title: item.title, ...(typeof item.sector === 'string' ? { sector: item.sector } : {}), visits: item.visits, sameExits: item.sameExits, exits: exitList });
      }
      return { ok: true, value: rooms };
    },

    async getSuggestions(signal) {
      const res = await call('/suggestions', {}, signal);
      if (!res.ok) return res;
      const list = isRecord(res.value) ? res.value.suggestions : undefined;
      if (!Array.isArray(list)) return { ok: false, reason: 'invalid' };
      const suggestions: Suggestion[] = [];
      for (const item of list) {
        const checked = validateSuggestion(item);
        if (checked.ok) suggestions.push(checked.value);
      }
      return { ok: true, value: suggestions };
    },

    async getCharacters(signal) {
      const res = await call('/characters', {}, signal);
      if (!res.ok) return res;
      const list = isRecord(res.value) ? res.value.characters : undefined;
      return Array.isArray(list) ? { ok: true, value: list as CharacterSummary[] } : { ok: false, reason: 'invalid' };
    },

    async getOpenTickets(signal) {
      const res = await call('/tickets?status=open&limit=200', {}, signal);
      if (!res.ok) return res;
      const list = isRecord(res.value) ? res.value.tickets : undefined;
      if (!Array.isArray(list)) return { ok: false, reason: 'invalid' };
      const tickets: EscalationTicket[] = [];
      for (const item of list) {
        const checked = validateTicket(item);
        if (checked.ok) tickets.push(checked.value);
      }
      return { ok: true, value: tickets };
    },

    async postDecision(decision, signal) {
      if (!validateDecision(decision).ok) return { ok: false, reason: 'invalid' };
      const res = await call('/decisions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(decision) }, signal);
      if (!res.ok) return res;
      const written = isRecord(res.value) ? res.value.written : undefined;
      return typeof written === 'boolean' ? { ok: true, value: { written } } : { ok: false, reason: 'invalid' };
    },

    async getBucketStats(signal) {
      const res = await call('/stats/buckets', {}, signal);
      if (!res.ok) return res;
      const buckets = isRecord(res.value) ? res.value.buckets : undefined;
      return isRecord(buckets) ? { ok: true, value: readBucketTable(buckets) } : { ok: false, reason: 'invalid' };
    },

    async postTicket(ticket, signal) {
      if (!validateTicket(ticket).ok) return { ok: false, reason: 'invalid' };
      const res = await call('/tickets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ticket) }, signal);
      if (!res.ok) return res;
      const written = isRecord(res.value) ? res.value.written : undefined;
      return typeof written === 'boolean' ? { ok: true, value: { written } } : { ok: false, reason: 'invalid' };
    },
  };
}
