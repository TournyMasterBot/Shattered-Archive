import { useState } from 'react';

import type { RoomAction } from '../../domain/gameReducer.js';
import type { RoomState } from '../../domain/types.js';

interface DayVoteRecorderProps {
  room: RoomState;
  dispatch: (action: RoomAction) => void;
}

export default function DayVoteRecorder({ room, dispatch }: DayVoteRecorderProps) {
  const [tally, setTally] = useState<Record<string, number>>({});

  if (room.phase !== 'day') return null;

  const day = room.dayNumber;
  const alive = room.players.filter((p) => p.alive);
  const executionEntry = room.timeline.find((e) => e.kind === 'day-execution' && e.day === day);

  if (executionEntry && executionEntry.kind === 'day-execution') {
    const targetName = executionEntry.targetId ? room.players.find((p) => p.id === executionEntry.targetId)?.name : null;
    return (
      <section className="ss-day-vote" aria-label="Day vote">
        <h2>Day {day} vote</h2>
        <p>{targetName ? `${targetName} was executed.` : 'No majority was reached — no one was executed.'}</p>
      </section>
    );
  }

  const totalVotes = Object.values(tally).reduce((sum, v) => sum + v, 0);
  const majorityThreshold = Math.floor(alive.length / 2) + 1;
  const leaderEntry = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
  const hasMajority = !!leaderEntry && leaderEntry[1] >= majorityThreshold && leaderEntry[1] > 0;
  const leaderName = hasMajority ? room.players.find((p) => p.id === leaderEntry![0])?.name : undefined;

  const setVotes = (playerId: string, votes: number) => {
    setTally((t) => ({ ...t, [playerId]: Math.max(0, votes) }));
  };

  const confirm = () => {
    dispatch({ type: 'recordVoteTally', tally });
    dispatch({
      type: 'executePlayer',
      targetId: hasMajority ? leaderEntry![0] : null,
      note: hasMajority ? undefined : 'no majority reached',
    });
  };

  return (
    <section className="ss-day-vote" aria-label="Day vote">
      <h2>Day {day} vote</h2>
      <p className="ss-day-vote-hint">
        Majority needed: {majorityThreshold} of {alive.length} living player{alive.length === 1 ? '' : 's'}.
      </p>

      {alive.length === 0 ? (
        <p>No living players to vote.</p>
      ) : (
        <ul className="ss-day-vote-list">
          {alive.map((p) => (
            <li key={p.id}>
              <span>{p.name}</span>
              <input
                type="number"
                min={0}
                aria-label={`Votes for ${p.name}`}
                value={tally[p.id] ?? 0}
                onChange={(e) => setVotes(p.id, Number(e.target.value))}
              />
            </li>
          ))}
        </ul>
      )}

      <button type="button" disabled={totalVotes === 0} onClick={confirm}>
        {hasMajority ? `Execute ${leaderName}` : 'Record — no majority'}
      </button>
    </section>
  );
}
