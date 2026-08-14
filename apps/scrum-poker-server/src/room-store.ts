import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';

import { applySettingsPatch, createRoom, sweepIdle } from '@shatteredarchive/scrum-poker-core';
import type { Room, RoomSettings } from '@shatteredarchive/scrum-poker-core';

import type { ScrumPokerConfig } from './config.js';

/**
 * The live room registry plus its disk backing.
 *
 * Rooms are held in memory (a poker round is chatty — a vote per person per story) and
 * flushed to a single `rooms.json` on a short debounce, atomically via temp+rename so a
 * crash mid-write can never leave a half-written file. That combination is deliberate:
 * losing the last second of votes to a hard kill is harmless, but losing a team's room
 * configuration to a routine container recreate would not be.
 *
 * Room ids are UUIDs. The reference site's 8-digit code is nicer to read down a phone line,
 * but in this design the id IS the access boundary — there are no accounts, so anyone holding
 * it is a member — and a 90M-wide numeric space is enumerable by anyone who cares to try.
 * 122 random bits removes both the collision question and the guessing one. Sharing is a
 * pasted invite link rather than a spoken number, which is what a chat-first team does anyway.
 *
 * Ids read off disk are NOT required to match this format, so rooms created before the switch
 * keep working.
 */

const ROOMS_FILE = 'rooms.json';
const PERSIST_DEBOUNCE_MS = 750;
/** Serialized envelope; `version` exists so a future shape change can migrate rather than guess. */
interface RoomsFile {
  version: 1;
  rooms: Room[];
}

export interface CreatedRoom {
  readonly room: Room;
  /** Returned exactly once, at creation. The creator's browser keeps it; the server never re-issues it. */
  readonly hostToken: string;
}

export class RoomStore {
  private readonly rooms = new Map<string, Room>();
  private readonly filePath: string;
  private persistTimer: NodeJS.Timeout | undefined;
  private dirty = false;

  constructor(
    private readonly config: ScrumPokerConfig,
    private readonly onError: (message: string, meta?: Record<string, unknown>) => void = () => {},
  ) {
    this.filePath = path.join(config.dataDir, ROOMS_FILE);
    this.load();
  }

  /** Rooms currently held, newest first — used by /health and the sweeper's logging. */
  get size(): number {
    return this.rooms.size;
  }

  get(id: string): Room | undefined {
    return this.rooms.get(id);
  }

  /**
   * Mints a room with a fresh id and host token. Throws only when the store is at
   * `maxRooms`, which the route surfaces as a 503 rather than a crash.
   */
  create(now: number, settings?: Partial<RoomSettings>): CreatedRoom {
    if (this.rooms.size >= this.config.maxRooms) {
      throw new Error('Room limit reached');
    }
    const hostToken = randomBytes(24).toString('base64url');
    const room = createRoom(this.nextRoomId(), hostToken, now, settings);
    this.rooms.set(room.id, room);
    this.markDirty();
    return { room, hostToken };
  }

  /** Replaces a room wholesale (the reducers return new objects) and schedules a flush. */
  save(room: Room): void {
    this.rooms.set(room.id, room);
    this.markDirty();
  }

  delete(id: string): void {
    if (this.rooms.delete(id)) this.markDirty();
  }

  /** A fresh participant id. PUBLIC — it is broadcast in every roster, so it is a key, not a credential. */
  static newParticipantId(): string {
    return randomUUID();
  }

  /**
   * A fresh participant secret: the private half of an identity, sent to exactly one
   * connection and replayed from its localStorage to re-attach after a refresh. Same
   * strength as `hostToken` (192 bits) because it does the same kind of job — it is the
   * only thing standing between a room member and voting as one of their colleagues.
   */
  static newParticipantSecret(): string {
    return randomBytes(24).toString('base64url');
  }

  /**
   * Drops idle participants and expired rooms. Returns the ids of rooms whose roster
   * actually changed so the gateway can re-broadcast only those.
   */
  sweep(now: number): { changed: string[]; removed: string[] } {
    const changed: string[] = [];
    const removed: string[] = [];

    for (const [id, room] of this.rooms) {
      if (now - room.lastActiveAt > this.config.roomTtlMs) {
        this.rooms.delete(id);
        removed.push(id);
        continue;
      }
      // Never joined by anyone: `lastActiveAt` still equals `createdAt`, which stops being
      // true the moment the first person joins. Reclaims rooms minted and abandoned (or minted
      // in bulk against the open create endpoint) without ever touching a room a team used.
      if (room.lastActiveAt === room.createdAt && now - room.createdAt > this.config.emptyRoomTtlMs) {
        this.rooms.delete(id);
        removed.push(id);
        continue;
      }
      const swept = sweepIdle(room, now, this.config.idleTimeoutMs);
      if (swept !== room) {
        this.rooms.set(id, swept);
        changed.push(id);
      }
    }

    if (changed.length > 0 || removed.length > 0) this.markDirty();
    return { changed, removed };
  }

  /** Writes immediately, cancelling any pending debounce. Called on shutdown. */
  flush(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = undefined;
    }
    if (!this.dirty) return;
    this.persist();
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private nextRoomId(): string {
    // A v4 UUID collision is not a real event; the loop keeps the invariant ("never hand back
    // an id already in use") a guarantee rather than a probability argument, and costs nothing.
    for (let attempt = 0; attempt < 50; attempt++) {
      const id = randomUUID();
      if (!this.rooms.has(id)) return id;
    }
    throw new Error('Could not allocate a room id');
  }

  private markDirty(): void {
    this.dirty = true;
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = undefined;
      this.persist();
    }, PERSIST_DEBOUNCE_MS);
    // A pending flush must never hold the process open on shutdown.
    this.persistTimer.unref?.();
  }

  private persist(): void {
    const payload: RoomsFile = { version: 1, rooms: [...this.rooms.values()] };
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    try {
      fs.mkdirSync(this.config.dataDir, { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify(payload), 'utf8');
      fs.renameSync(tmp, this.filePath);
      this.dirty = false;
    } catch (err) {
      // Persistence is best-effort: an unwritable volume must degrade to "rooms live only
      // in memory until the next restart", never take the service down mid-planning-session.
      this.onError('failed to persist rooms', { err: String(err), filePath: this.filePath });
      try {
        fs.rmSync(tmp, { force: true });
      } catch {
        /* nothing useful to do */
      }
    }
  }

  private load(): void {
    if (!fs.existsSync(this.filePath)) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    } catch (err) {
      // A corrupt file is set aside rather than deleted, so it can be inspected, and the
      // service still boots — an unparseable rooms file must not be a startup failure.
      const quarantine = `${this.filePath}.corrupt-${Date.now()}`;
      this.onError('rooms file was unreadable; starting empty', { err: String(err), quarantine });
      try {
        fs.renameSync(this.filePath, quarantine);
      } catch {
        /* nothing useful to do */
      }
      return;
    }

    const rooms = (parsed as RoomsFile | null)?.rooms;
    if (!Array.isArray(rooms)) {
      this.onError('rooms file had no room array; starting empty', { filePath: this.filePath });
      return;
    }
    let dropped = 0;
    for (const room of rooms) {
      // Per-record, and belt-and-braces around a function that already returns undefined for
      // bad input: one unreadable room must never cost the service its startup, and the whole
      // point of this path is that it runs on data nothing has vouched for.
      try {
        const normalized = normalizeStoredRoom(room);
        if (normalized) this.rooms.set(normalized.id, normalized);
        else dropped += 1;
      } catch (err) {
        dropped += 1;
        this.onError('dropped a room record that could not be normalized', { err: String(err) });
      }
    }
    if (dropped > 0) this.onError('dropped unreadable room records while loading', { dropped, kept: this.rooms.size });
  }
}

/**
 * Re-validates a room read off disk. The file is ours, but it is also the one input to this
 * service that survives a code change — a room written by an older build with a since-tightened
 * deck rule should be dropped cleanly, not loaded into a state the reducers consider illegal.
 */
export function normalizeStoredRoom(raw: unknown): Room | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const room = raw as Partial<Room>;
  if (typeof room.id !== 'string' || typeof room.hostToken !== 'string') return undefined;
  if (typeof room.createdAt !== 'number' || typeof room.lastActiveAt !== 'number') return undefined;
  if (!Array.isArray(room.participants) || typeof room.settings !== 'object' || room.settings === null) {
    return undefined;
  }

  const base = createRoom(room.id, room.hostToken, room.createdAt);
  const patched = applySettingsPatch(base.settings, pickStoredSettings(room.settings));
  if ('error' in patched) return undefined;

  return {
    ...base,
    settings: patched.settings,
    revealed: room.revealed === true,
    lastActiveAt: room.lastActiveAt,
    // A row without a `secret` predates split participant identity and cannot be re-attached
    // to safely, so it is dropped rather than loaded: its owner simply rejoins and gets a
    // fresh row. Rosters are transient by design (an hour of idle clears them anyway), so
    // this costs a name in a list, not a room or its settings.
    participants: room.participants.filter(
      (p): p is Room['participants'][number] =>
        typeof p === 'object' &&
        p !== null &&
        typeof p.id === 'string' &&
        typeof p.secret === 'string' &&
        typeof p.name === 'string' &&
        typeof p.joinedAt === 'number' &&
        typeof p.lastActiveAt === 'number' &&
        (p.vote === null || typeof p.vote === 'string'),
    ),
  };
}

/** The only settings keys a stored record may contribute. */
const STORED_SETTING_KEYS = [
  'friendlyName',
  'deck',
  'hideUntilRevealed',
  'allowGuestsToReveal',
  'allowGuestsToReset',
  'allowGuestsToClearUsers',
  'showAverage',
  'showMedian',
] as const;

/**
 * Narrows a stored settings blob to the keys this build knows about.
 *
 * `applySettingsPatch` merges by spreading, so without this an unexpected key in rooms.json
 * would survive validation and be re-broadcast inside `settings` to every client in the room.
 * The websocket path is already whitelisted this way by `parseScrumClientMessage`; this gives
 * the file — the one input that outlives a deployment — the same treatment.
 */
function pickStoredSettings(raw: object): Partial<RoomSettings> {
  const input = raw as Record<string, unknown>;
  const picked: Record<string, unknown> = {};
  for (const key of STORED_SETTING_KEYS) {
    if (key in input) picked[key] = input[key];
  }
  return picked as Partial<RoomSettings>;
}
