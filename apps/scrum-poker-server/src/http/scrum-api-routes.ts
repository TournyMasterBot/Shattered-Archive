import type { Application, Request, Response } from 'express';

import { applySettingsPatch, parseDeck } from '@shatteredarchive/scrum-poker-core';
import type { RoomSettingsPatch } from '@shatteredarchive/scrum-poker-core';

import type { RoomStore } from '../room-store.js';

/**
 * The small REST surface that exists only because it happens BEFORE a websocket makes sense:
 * minting a room, and checking a pasted code is real. Everything inside a room — voting,
 * revealing, settings — is websocket-only, so there is one path to state and one broadcast.
 *
 * Both routes are deliberately unauthenticated. This is a transient-participant tool with no
 * accounts by design; possession of the room id is the only thing membership means, and
 * possession of the host token (returned once, at creation) is the only thing organizer means.
 */

export interface ScrumApiDeps {
  readonly store: RoomStore;
  readonly now: () => number;
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

      res.status(201).json({ roomId: room.id, hostToken, settings: patched.settings });
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
}
