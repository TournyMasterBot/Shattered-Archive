import type { Application, Request, Response } from 'express';

import { RoomStore } from '../room-store.js';
import { applySettingsPatch, joinRoom, parseDeck, SCRUM_PROTOCOL_VERSION } from '@shatteredarchive/scrum-poker-core';
import type { RoomSettingsPatch } from '@shatteredarchive/scrum-poker-core';

import { buildSetCookie, hostCookieName, readCookieValue, secretCookieName } from './cookies.js';

/**
 * The small REST surface that exists only because it happens BEFORE a websocket makes sense:
 * minting a room, checking a pasted code is real, and — since 2026-08-05 — minting/reattaching
 * a participant so its secret can reach the browser as an HttpOnly cookie (a WebSocket upgrade
 * response cannot reliably carry `Set-Cookie`; an HTTP response before it opens can). Everything
 * ELSE inside a room — voting, revealing, settings — stays websocket-only, so there is one path
 * to state and one broadcast.
 *
 * All three routes are deliberately unauthenticated. This is a transient-participant tool with
 * no accounts by design; possession of the room id is the only thing membership means, and
 * possession of the host token (minted once, at creation, straight into a cookie) is the only
 * thing organizer means.
 */

export interface ScrumApiDeps {
  readonly store: RoomStore;
  readonly now: () => number;
  /** Cookie `Max-Age`, so a credential for a room that has since expired expires with it. */
  readonly roomTtlMs: number;
}

function readCreateSettings(body: unknown): RoomSettingsPatch | { error: string } {
  if (typeof body !== 'object' || body === null) return {};
  const input = body as Record<string, unknown>;
  const patch: RoomSettingsPatch = {};

  if (typeof input.friendlyName === 'string') patch.friendlyName = input.friendlyName;
  if (typeof input.deck === 'string') patch.deck = parseDeck(input.deck);
  else if (Array.isArray(input.deck) && input.deck.every((c) => typeof c === 'string')) patch.deck = input.deck as string[];
  if (typeof input.hideUntilRevealed === 'boolean') patch.hideUntilRevealed = input.hideUntilRevealed;

  return patch;
}

export function registerScrumApiRoutes(app: Application, deps: ScrumApiDeps): void {
  app.post('/api/scrum/rooms', (req: Request, res: Response) => {
    const requested = readCreateSettings(req.body);
    if ('error' in requested) {
      res.status(400).json({ error: requested.error });
      return;
    }

    try {
      // Validate the requested settings against the SAME rules a later settings edit uses,
      // before anything is stored — a room should never be born in a state its own editor
      // would reject.
      const { room, hostToken } = deps.store.create(deps.now());
      const patched = applySettingsPatch(room.settings, requested);
      if ('error' in patched) {
        deps.store.delete(room.id);
        res.status(400).json({ error: patched.error });
        return;
      }
      deps.store.save({ ...room, settings: patched.settings });

      // Straight into a cookie, never the body: the host token is a bearer credential — the
      // ONLY thing that makes this browser the organizer — and it is issued exactly once, so
      // there is no re-mint to fall back on if a script ever managed to read it out of a
      // response body the way it could out of the old localStorage copy.
      res.setHeader('Set-Cookie', buildSetCookie(hostCookieName(room.id), hostToken, deps.roomTtlMs));
      res.status(201).json({ roomId: room.id, settings: patched.settings });
    } catch {
      res.status(503).json({ error: 'The server is at its room limit. Try again later.' });
    }
  });

  // Lets the join form confirm a pasted invite link resolves to a real room, and name it, without
  // opening a socket and without revealing anything about who is in it.
  app.get('/api/scrum/rooms/:id', (req: Request, res: Response) => {
    const room = deps.store.get(String(req.params.id));
    if (!room) {
      res.status(404).json({ error: 'No room with that code.' });
      return;
    }
    res.json({
      id: room.id,
      friendlyName: room.settings.friendlyName,
      participantCount: room.participants.length,
    });
  });

  // Mints (or reattaches) a participant BEFORE the websocket opens, so its secret can reach
  // this browser as a `Set-Cookie` on an ordinary HTTP response — the websocket's own upgrade
  // response cannot reliably carry one. The client is expected to await this and let the
  // cookie land in the jar before constructing the WebSocket, or a brand-new participant's
  // secret never reaches this browser at all and a refresh a moment later starts a second,
  // unlinked participant instead of reattaching to this one. `/ws/scrum`'s own `join` frame
  // still runs the identical reducer call a moment later (reading the SAME cookie this route
  // just set) — that second call is what actually attaches a connection and broadcasts the
  // roster; this route only gets the credential into the browser.
  app.post('/api/scrum/rooms/:id/join', (req: Request, res: Response) => {
    const room = deps.store.get(String(req.params.id));
    if (!room) {
      res.status(404).json({ error: 'No room with that code.' });
      return;
    }

    const body = req.body as { name?: unknown } | undefined;
    const name = typeof body?.name === 'string' ? body.name : '';
    const replayedSecret = readCookieValue(req.headers.cookie, secretCookieName(room.id));

    const result = joinRoom(room, {
      participantId: RoomStore.newParticipantId(),
      participantSecret: RoomStore.newParticipantSecret(),
      replayedSecret,
      name,
      now: deps.now(),
    });
    if ('error' in result) {
      res.status(400).json({ error: result.error });
      return;
    }
    deps.store.save(result.room);

    const hostToken = readCookieValue(req.headers.cookie, hostCookieName(room.id));
    const isHost = hostToken !== undefined && hostToken === room.hostToken;

    res.setHeader('Set-Cookie', buildSetCookie(secretCookieName(room.id), result.participant.secret, deps.roomTtlMs));
    res.status(200).json({
      participantId: result.participant.id,
      isHost,
      protocolVersion: SCRUM_PROTOCOL_VERSION,
    });
  });
}
