import type { RoomSettings } from '@shatteredarchive/scrum-poker-core';

/**
 * The REST calls that happen before — or instead of — a websocket message: mint a room, check
 * a pasted code is real, and mint/reattach a participant. Everything ELSE inside a room goes
 * over `/ws/scrum` — see net/useScrumRoom.ts.
 *
 * URLs are relative on purpose: the deployed edge serves the SPA and proxies /api to
 * scrum-poker-server on the same host, and `vite dev` reproduces that split with a proxy.
 * No VITE_* API base is needed anywhere.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface CreateRoomInput {
  friendlyName?: string;
  /** Comma-separated, exactly as typed in the deck field; the server parses it. */
  deck?: string;
  hideUntilRevealed?: boolean;
}

export interface CreatedRoom {
  roomId: string;
  settings: RoomSettings;
}

export interface RoomSummary {
  id: string;
  friendlyName: string;
  participantCount: number;
}

/** What `joinRoom` returns — no secret, ever: it lands in an HttpOnly cookie, not this body. */
export interface JoinedRoom {
  participantId: string;
  isHost: boolean;
  protocolVersion: number;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new ApiError(body.error ?? `${res.status} ${res.statusText}`, res.status);
  }
  return body;
}

export const api = {
  createRoom: (input: CreateRoomInput) =>
    request<CreatedRoom>('/api/scrum/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),

  /** Resolves a code to its name/headcount, or throws ApiError(404) if there is no such room. */
  peekRoom: (roomId: string) => request<RoomSummary>(`/api/scrum/rooms/${encodeURIComponent(roomId)}`),

  /**
   * Mints a fresh participant, or reattaches an existing one via whatever secret cookie this
   * browser is already holding for the room — either way, the (possibly new) secret comes
   * back as a `Set-Cookie`, never in this response. MUST be awaited, and MUST resolve, before
   * opening the `/ws/scrum` socket for a room this browser has never joined: the socket's own
   * upgrade handshake is the request that would carry the cookie along, so if that handshake
   * fires before this call's `Set-Cookie` has landed in the jar, a brand-new participant's
   * secret never reaches this browser at all. See net/useScrumRoom.ts.
   */
  joinRoom: (roomId: string, name: string) =>
    request<JoinedRoom>(`/api/scrum/rooms/${encodeURIComponent(roomId)}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ name }),
    }),
};
