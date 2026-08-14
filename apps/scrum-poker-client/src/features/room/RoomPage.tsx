import { useEffect, useRef, useState } from 'react';

import { api, ApiError } from '../../api/client.js';
import { useScrumRoom } from '../../net/useScrumRoom.js';
import { storage } from '../../storage.js';
import CardDeck from './CardDeck.js';
import JoinPanel from './JoinPanel.js';
import ParticipantTable from './ParticipantTable.js';
import ResultsSummary from './ResultsSummary.js';
import RoomSettingsDialog from './RoomSettingsDialog.js';
import RoomToolbar from './RoomToolbar.js';

/**
 * A single room: connection lifecycle, the join gate, and the estimating surface.
 *
 * The page opens with a REST `peekRoom` before any socket, so a mistyped code fails
 * immediately with "no room with that code" instead of a websocket that connects fine and
 * then rejects the join — a much more confusing sequence for the person pasting a link.
 */
export default function RoomPage({ roomId, onExit }: { roomId: string; onExit: () => void }) {
  const room = useScrumRoom(roomId);
  const [lookup, setLookup] = useState<{ state: 'loading' } | { state: 'found'; name: string } | { state: 'missing' }>({
    state: 'loading',
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const autoJoined = useRef(false);

  useEffect(() => {
    let cancelled = false;
    // No `setLookup({state:'loading'})` reset here: App keys this component by room id, so a
    // different roomId always arrives as a fresh mount with the initial 'loading' state — the
    // reset would be dead code, and a synchronous setState in an effect body at that.
    api
      .peekRoom(roomId)
      .then((summary) => {
        if (!cancelled) setLookup({ state: 'found', name: summary.friendlyName });
      })
      .catch((err) => {
        if (cancelled) return;
        // A network blip shouldn't look like a deleted room: only a real 404 says "missing",
        // anything else falls through to the socket, which reports its own status.
        setLookup(err instanceof ApiError && err.status === 404 ? { state: 'missing' } : { state: 'found', name: '' });
      });
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  // A returning participant (their name is already stored) shouldn't have to confirm it
  // every time they open the link — join straight through once the room is known to exist.
  //
  // The guard is released on cleanup so it re-arms. Without that, StrictMode's dev-only
  // mount→unmount→mount cycle tears the socket down and then skips the re-join, leaving
  // `pnpm dev` staring at a dead room (production, where effects run once, would look fine).
  // Depends on `room.join` — a stable useCallback — rather than the `room` object, which is
  // rebuilt every render and would re-fire this on each one.
  const { join } = room;
  const storedName = storage.getName();
  useEffect(() => {
    if (autoJoined.current || lookup.state !== 'found' || !storedName) return;
    autoJoined.current = true;
    join(storedName);
    return () => {
      autoJoined.current = false;
    };
  }, [lookup.state, storedName, join]);

  if (lookup.state === 'missing') {
    return (
      <div className="sp-card">
        <h2 className="sp-section-title">No room with that link</h2>
        <p className="sp-section-hint">
          {/* Stub, not the full id — a UUID in prose is unreadable and nobody is comparing it by eye. */}
          Room {roomId.slice(0, 8)} doesn’t exist, or it expired after a month of inactivity.
        </p>
        <button type="button" className="sp-btn sp-btn-primary" onClick={onExit}>
          Start a new room
        </button>
      </div>
    );
  }

  if (room.fatalError) {
    return (
      <div className="sp-card">
        <h2 className="sp-section-title">This room is gone</h2>
        <p className="sp-section-hint">{room.fatalError}</p>
        <button type="button" className="sp-btn sp-btn-primary" onClick={onExit}>
          Start a new room
        </button>
      </div>
    );
  }

  const view = room.room;
  const joined = Boolean(view && room.participantId && view.participants.some((p) => p.id === room.participantId));
  const roomLabel = view?.settings.friendlyName || (lookup.state === 'found' && lookup.name) || `room ${roomId}`;
  const connecting = room.status === 'connecting' || room.status === 'reconnecting';

  return (
    <>
      {room.transientError && (
        <div className="sp-banner sp-banner-error" role="alert">
          <span>{room.transientError}</span>
          <div className="sp-banner-actions">
            <button type="button" className="sp-btn" onClick={room.dismissError}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {room.evicted && (
        <div className="sp-banner sp-banner-info" role="status">
          <span>You were removed after an hour without any activity.</span>
          <div className="sp-banner-actions">
            <button type="button" className="sp-btn sp-btn-primary" onClick={() => room.join(storage.getName())}>
              Rejoin
            </button>
          </div>
        </div>
      )}

      {room.status === 'reconnecting' && (
        <div className="sp-banner sp-banner-info" role="status">
          <span className="sp-status-dot is-retrying" />
          <span>Connection lost — reconnecting…</span>
        </div>
      )}

      {!joined || !view ? (
        <JoinPanel
          roomLabel={roomLabel}
          initialName={storedName}
          busy={connecting}
          onJoin={(name) => room.join(name)}
        />
      ) : (
        <>
          <section className="sp-card">
            <h2 className="sp-section-title">Provide an estimate</h2>
            <p className="sp-section-hint">
              Pick the card that matches the complexity of the story. Click it again to take it back.
            </p>
            <CardDeck deck={view.settings.deck} selected={room.myVote} disabled={connecting} onPick={room.vote} />
          </section>

          <section className="sp-card">
            <RoomToolbar
              revealed={view.revealed}
              settings={view.settings}
              isHost={room.isHost}
              disabled={connecting}
              onSetRevealed={room.setRevealed}
              onReset={room.resetEstimates}
              onClearUsers={room.clearUsers}
              onOpenSettings={() => setSettingsOpen(true)}
            />

            <ParticipantTable participants={view.participants} youId={room.participantId} revealed={view.revealed} />

            {view.stats && <ResultsSummary stats={view.stats} settings={view.settings} />}
          </section>
        </>
      )}

      {settingsOpen && view && (
        <RoomSettingsDialog
          settings={view.settings}
          onSave={room.updateSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </>
  );
}
