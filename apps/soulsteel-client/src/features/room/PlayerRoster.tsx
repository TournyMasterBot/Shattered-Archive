import { useState } from 'react';

import { recommendedDistribution } from '../../domain/recommendedDistribution.js';
import type { RoomAction } from '../../domain/gameReducer.js';
import type { RoomState } from '../../domain/types.js';

interface PlayerRosterProps {
  room: RoomState;
  dispatch: (action: RoomAction) => void;
}

export default function PlayerRoster({ room, dispatch }: PlayerRosterProps) {
  const [name, setName] = useState('');
  const distribution = recommendedDistribution(room.players.length);

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
        <>
          <p className="ss-roster-hint">
            Suggested for {room.players.length} players: {distribution.umbraseer ? '1 Umbraseer, ' : ''}
            {distribution.darkshield ? '1 Darkshield, ' : ''}
            {distribution.assassins} Assassin{distribution.assassins === 1 ? '' : 's'}, {distribution.darkKnights} Dark
            Knight{distribution.darkKnights === 1 ? '' : 's'}.
          </p>

          <ul className="ss-roster-list">
            {room.players.map((p) => (
              <li key={p.id} className={p.alive ? 'ss-player-alive' : 'ss-player-dead'}>
                <input
                  type="text"
                  value={p.name}
                  aria-label={`Name for ${p.name}`}
                  onChange={(e) => dispatch({ type: 'renamePlayer', playerId: p.id, name: e.target.value })}
                />
                <select
                  aria-label={`Role for ${p.name}`}
                  value={p.roleId ?? ''}
                  onChange={(e) => dispatch({ type: 'assignRole', playerId: p.id, roleId: e.target.value || null })}
                >
                  <option value="">Unassigned</option>
                  {room.roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={`ss-player-status-toggle ${p.alive ? 'ss-player-status-alive' : 'ss-player-status-dead'}`}
                  onClick={() => dispatch({ type: 'setPlayerAlive', playerId: p.id, alive: !p.alive })}
                  aria-label={`Mark ${p.name} as ${p.alive ? 'dead' : 'alive'}`}
                  title={
                    p.alive
                      ? 'Alive — click to mark dead'
                      : `Dead — ${p.eliminatedAt?.cause ?? 'unknown'} (Day ${p.eliminatedAt?.day ?? '?'}) — click to revive`
                  }
                >
                  {p.alive ? 'Alive' : `Dead — ${p.eliminatedAt?.cause ?? 'unknown'} (Day ${p.eliminatedAt?.day ?? '?'})`}
                </button>
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'removePlayer', playerId: p.id })}
                  aria-label={`Remove ${p.name}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
