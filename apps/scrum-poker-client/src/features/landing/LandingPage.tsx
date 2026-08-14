import { useState } from 'react';

import { DEFAULT_DECK, formatDeck, parseDeck, validateDeck } from '@shatteredarchive/scrum-poker-core';

import { api, ApiError } from '../../api/client.js';
import { extractRoomId } from '../../routing/room-id.js';

/**
 * Create a room, or join one by code.
 *
 * Creating lands this browser's host token straight into an HttpOnly cookie (the create
 * response never carries it) — that cookie, and only that cookie, is what makes this browser
 * the organizer later. It is minted exactly once, so if it is lost the room simply has no
 * organizer; nothing can re-mint it.
 */
export default function LandingPage({ onEnterRoom }: { onEnterRoom: (roomId: string) => void }) {
  const [friendlyName, setFriendlyName] = useState('');
  const [deckText, setDeckText] = useState(formatDeck(DEFAULT_DECK));
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const deckError = validateDeck(parseDeck(deckText));

  const create = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      const created = await api.createRoom({ friendlyName, deck: deckText });
      onEnterRoom(created.roomId);
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Could not create a room. Try again.');
    } finally {
      setCreating(false);
    }
  };

  const join = async () => {
    const roomId = extractRoomId(code);
    if (!roomId) return;
    setJoining(true);
    setJoinError(null);
    try {
      // Checked here rather than on the room page so a bad code is corrected in the field
      // it was pasted into, with the value still on screen.
      await api.peekRoom(roomId);
      onEnterRoom(roomId);
    } catch (err) {
      setJoinError(
        err instanceof ApiError && err.status === 404 ? 'No room with that code.' : 'Could not reach the server.',
      );
    } finally {
      setJoining(false);
    }
  };

  return (
    <>
      <div className="sp-landing-lede">
        <h1>Scrum Poker</h1>
        <p>Create a room, share the code, estimate together. No sign-up, no accounts.</p>
      </div>

      <div className="sp-landing-grid">
        <form
          className="sp-card"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <h2 className="sp-section-title">Start a room</h2>
          <p className="sp-section-hint">You’ll be its organizer, and can change any of this later.</p>

          <div className="sp-field">
            <label htmlFor="sp-new-name">Room name (optional)</label>
            <input
              id="sp-new-name"
              type="text"
              value={friendlyName}
              maxLength={60}
              placeholder="e.g. Platform Team"
              onChange={(e) => setFriendlyName(e.target.value)}
            />
          </div>

          <div className="sp-field">
            <label htmlFor="sp-new-deck">Estimate cards</label>
            <input id="sp-new-deck" type="text" value={deckText} onChange={(e) => setDeckText(e.target.value)} />
            <span className="sp-field-hint">{deckError ?? 'Comma-separated, in the order they should appear.'}</span>
          </div>

          {createError && <p className="sp-field-hint">{createError}</p>}

          <button type="submit" className="sp-btn sp-btn-primary" disabled={creating || Boolean(deckError)}>
            {creating ? 'Creating…' : 'Create room'}
          </button>
        </form>

        <form
          className="sp-card"
          onSubmit={(e) => {
            e.preventDefault();
            void join();
          }}
        >
          <h2 className="sp-section-title">Join a room</h2>
          <p className="sp-section-hint">Paste the invite link, or the room code from it.</p>

          <div className="sp-field">
            <label htmlFor="sp-join-code">Invite link or room code</label>
            <input
              id="sp-join-code"
              className="sp-code-input"
              type="text"
              value={code}
              maxLength={200}
              placeholder="https://scrum-poker.shatteredarchive.dev/room/…"
              onChange={(e) => setCode(e.target.value)}
            />
            {joinError && <span className="sp-field-hint">{joinError}</span>}
          </div>

          <button type="submit" className="sp-btn" disabled={joining || extractRoomId(code).length === 0}>
            {joining ? 'Checking…' : 'Join room'}
          </button>
        </form>
      </div>
    </>
  );
}
