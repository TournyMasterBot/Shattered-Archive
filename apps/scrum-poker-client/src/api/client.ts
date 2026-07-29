import type { RoomSettings } from '@shatteredarchive/scrum-poker-core';

/**
 * The two REST calls that happen before a websocket exists: mint a room, and check a pasted
 * code is real. Everything inside a room goes over `/ws/scrum` — see net/useScrumRoom.ts.
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
  hostToken: string;
  settings: RoomSettings;
}

export interface RoomSummary {
  id: string;
  friendlyName: string;
  participantCount: number;
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
};
