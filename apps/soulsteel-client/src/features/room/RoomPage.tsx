import { useCallback, useEffect, useState } from 'react';

import { createRoom, reduceRoom, rematchRoom, type RoomAction } from '../../domain/gameReducer.js';
import type { RoomState } from '../../domain/types.js';
import { loadRoom, saveRoom } from '../../storage/soulsteelDb.js';
import DayVoteRecorder from './DayVoteRecorder.js';
import NightActionLog from './NightActionLog.js';
import PhaseController from './PhaseController.js';
import PlayerRoster from './PlayerRoster.js';
import RolesPanel from './RolesPanel.js';
import RoomSettingsDialog from './RoomSettingsDialog.js';
import RulesModal from '../shared/RulesModal.js';
import Timeline from './Timeline.js';
import WinConditionBanner from './WinConditionBanner.js';

interface RoomPageProps {
  roomId: string;
  onExit: () => void;
  onPlayAgain: (roomId: string) => void;
}

/**
 * The Herald's dashboard for one room. Loads a saved `RoomState` from IndexedDB on mount (or
 * creates a fresh one if this id has never been opened before), and persists every dispatch —
 * plain on-dispatch writes, not debounced, since IndexedDB writes here are local and cheap (no
 * network round-trip, unlike scrum-poker-server's debounced room-file flush).
 */
export default function RoomPage({ roomId, onExit, onPlayAgain }: RoomPageProps) {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadRoom(roomId)
      .then((existing) => {
        if (!alive) return;
        setRoom(existing ?? createRoom(roomId, new Date().toISOString()));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [roomId]);

  const dispatch = useCallback((action: RoomAction) => {
    setRoom((current) => {
      if (!current) return current;
      const next = reduceRoom(current, action, new Date().toISOString());
      void saveRoom(next);
      return next;
    });
  }, []);

  if (loading || !room) {
    return <p className="ss-room-loading">Loading room…</p>;
  }

  // Rematch spawns a brand-new room rather than resetting this one in place — the finished
  // match stays saved under its own id (its own entry in the Landing page's list) instead of
  // being overwritten, which a plain in-place reset was doing before.
  const playAgain = async () => {
    if (
      !window.confirm(
        "Start a new game with the same players? This game stays saved as its own entry — a fresh one opens for the rematch.",
      )
    ) {
      return;
    }
    const newRoomId = crypto.randomUUID();
    await saveRoom(rematchRoom(room, newRoomId, new Date().toISOString()));
    onPlayAgain(newRoomId);
  };

  return (
    <div className="ss-room">
      <div className="ss-room-toolbar">
        <button type="button" onClick={onExit}>
          ← Back to games
        </button>
        <PhaseController room={room} dispatch={dispatch} />
        <button type="button" onClick={() => setRulesOpen(true)}>
          Rules
        </button>
        <button type="button" onClick={() => setSettingsOpen(true)}>
          Settings
        </button>
        <button type="button" className="ss-play-again" onClick={playAgain}>
          Play again
        </button>
      </div>

      {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}
      {settingsOpen && <RoomSettingsDialog room={room} dispatch={dispatch} onClose={() => setSettingsOpen(false)} />}

      <WinConditionBanner room={room} />

      <div className="ss-room-grid">
        <PlayerRoster room={room} dispatch={dispatch} />
        <RolesPanel room={room} dispatch={dispatch} />
        {room.phase === 'night' ? (
          <NightActionLog room={room} dispatch={dispatch} />
        ) : (
          <DayVoteRecorder room={room} dispatch={dispatch} />
        )}
        <Timeline room={room} />
      </div>
    </div>
  );
}
