import { useState } from 'react';

import type { RoomAction } from '../../domain/gameReducer.js';
import type { RoomState } from '../../domain/types.js';

interface PlayerRosterProps {
  room: RoomState;
  dispatch: (action: RoomAction) => void;
}

export default function PlayerRoster({ room, dispatch }: PlayerRosterProps) {
  const [name, setName] = useState('');

  const addPlayer = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    dispatch({ type: 'addPlayer', name: trimmed });
    setName('');
  };

  return (
    <section className="ss-roster" aria-label="Players">
      <h2>Players</h2>

      <div className="ss-roster-add">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addPlayer();
          }}
          placeholder="Player name"
        />
        <button type="button" onClick={addPlayer} disabled={!name.trim()}>
          Add
        </button>
      </div>

      {room.players.length === 0 ? (
        <p className="ss-roster-empty">Add players to begin.</p>
      ) : (
        <ul className="ss-roster-list">
          {room.players.map((p) => (
            <li key={p.id} className={p.alive ? 'ss-player-alive' : 'ss-player-dead'}>
              <input
                type="text"
                value={p.name}
                aria-label={`Name for ${p.name}`}
                onChange={(e) => dispatch({ type: 'renamePlayer', playerId: p.id, name: e.target.value })}
              />
              <span className="ss-player-status">
                {p.alive ? 'Alive' : `Dead — ${p.eliminatedAt?.cause ?? 'unknown'} (Day ${p.eliminatedAt?.day ?? '?'})`}
              </span>
              <button type="button" onClick={() => dispatch({ type: 'removePlayer', playerId: p.id })} aria-label={`Remove ${p.name}`}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
