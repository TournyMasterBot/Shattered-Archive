import { ListenEvent } from '../event-emitter/event-dispatcher';
import type { GameRemoteServerGmcp } from '../../types/event-types/game-remote-server-gmcp';

/**
 * Holds the GMCP the simulacrum sends, in memory only, capped, and only while the connection is the simulacrum (E3, E16, S8). The
 * wire format is `<package> <json>`. This does not use features/gmcp/gmcpRouter.ts: that one drops every package it does not map, and
 * the point here is to see exactly what arrives, including what it cannot parse.
 */

export const DEFAULT_CAP = 1000;

// A unique key: the shared dispatcher keeps ONE listener per key, and the default key for this event would replace the app's own (A1, E26).
export const KEY_GMCP = 'simulacrumAdmin::gmcp';

export interface GmcpEntry {
  id: number;
  /** ISO time the client received it. */
  receivedAt: string;
  /** The text before the first space (the whole text when there is no space). */
  pkg: string;
  /** Characters in the raw message. */
  size: number;
  /** The whole message as it arrived. */
  raw: string;
  /** The parsed JSON, when it parsed. */
  data?: unknown;
  /** Fixed wording, never the payload itself. */
  parseError?: 'empty message' | 'no payload' | 'invalid JSON';
}

export interface ParsedGmcp {
  pkg: string;
  data?: unknown;
  parseError?: GmcpEntry['parseError'];
}

/** `<package> <json>` -> package and parsed JSON; malformed input becomes a parse error, never an exception (E23). */
export function parseGmcpText(raw: string): ParsedGmcp {
  const text = raw.trim();
  if (text === '') return { pkg: '', parseError: 'empty message' };
  const space = text.indexOf(' ');
  if (space === -1) return { pkg: text, parseError: 'no payload' };
  const pkg = text.slice(0, space);
  try {
    return { pkg, data: JSON.parse(text.slice(space + 1)) as unknown };
  } catch {
    return { pkg, parseError: 'invalid JSON' };
  }
}

export interface GmcpCaptureOptions {
  cap?: number;
  /** Nothing is stored unless this says the connection is the simulacrum. */
  isActive: () => boolean;
  now?: () => string;
}

export interface GmcpCapture {
  /** The same array until something changes, newest last. */
  getEntries(): readonly GmcpEntry[];
  subscribe(listener: () => void): () => void;
  /** Called for every message received while active, also while paused (the character info must not miss a login). */
  onMessage(listener: (entry: GmcpEntry) => void): () => void;
  isPaused(): boolean;
  pause(): void;
  resume(): void;
  clear(): void;
  dispose(): void;
}

export function createGmcpCapture(options: GmcpCaptureOptions): GmcpCapture {
  const cap = options.cap ?? DEFAULT_CAP;
  const now = options.now ?? (() => new Date().toISOString());
  let entries: readonly GmcpEntry[] = [];
  let paused = false;
  let nextId = 1;
  const listeners = new Set<() => void>();
  const messageListeners = new Set<(entry: GmcpEntry) => void>();
  const notify = (): void => {
    for (const listener of [...listeners]) listener();
  };

  const stop = ListenEvent<Partial<GameRemoteServerGmcp>>(
    'game:remote-server:gmcp',
    (event) => {
      if (!options.isActive()) return;
      const raw = typeof event?.payload === 'string' ? event.payload : '';
      const parsed = parseGmcpText(raw);
      const entry: GmcpEntry = {
        id: nextId++,
        receivedAt: typeof event?.receivedTimestamp === 'string' ? event.receivedTimestamp : now(),
        pkg: parsed.pkg,
        size: raw.length,
        raw,
        ...(parsed.data !== undefined ? { data: parsed.data } : {}),
        ...(parsed.parseError ? { parseError: parsed.parseError } : {}),
      };
      for (const listener of [...messageListeners]) listener(entry);
      if (paused) return;
      entries = entries.length >= cap ? [...entries.slice(entries.length - cap + 1), entry] : [...entries, entry];
      notify();
    },
    { key: KEY_GMCP },
  );

  return {
    getEntries: () => entries,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onMessage(listener) {
      messageListeners.add(listener);
      return () => messageListeners.delete(listener);
    },
    isPaused: () => paused,
    pause() {
      paused = true;
      notify();
    },
    resume() {
      paused = false;
      notify();
    },
    clear() {
      if (entries.length === 0) return;
      entries = [];
      notify();
    },
    dispose() {
      stop();
      listeners.clear();
      messageListeners.clear();
    },
  };
}
