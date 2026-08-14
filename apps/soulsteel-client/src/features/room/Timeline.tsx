import type { RoomState, TimelineEntry } from '../../domain/types.js';

interface TimelineProps {
  room: RoomState;
}

function playerName(room: RoomState, id: string | null | undefined): string {
  if (!id) return 'no one';
  return room.players.find((p) => p.id === id)?.name ?? 'unknown player';
}

function describeEntry(room: RoomState, entry: TimelineEntry): string {
  switch (entry.kind) {
    case 'night-check':
      return `${playerName(room, entry.checkerId)} checked ${playerName(room, entry.targetId)}: ${
        entry.result === 'assassin' ? 'an Assassin' : 'not an Assassin'
      }.`;
    case 'night-protect':
      return `${playerName(room, entry.protectorId)} protected ${playerName(room, entry.targetId)}.`;
    case 'night-assassin-target':
      return `The Assassins marked ${playerName(room, entry.targetId)}.`;
    case 'night-elimination':
      return entry.protected
        ? `${playerName(room, entry.targetId)} was attacked but survived — protected.`
        : `${playerName(room, entry.targetId)} was assassinated.`;
    case 'day-vote-tally': {
      const parts = Object.entries(entry.tally)
        .filter(([, votes]) => votes > 0)
        .map(([id, votes]) => `${playerName(room, id)}: ${votes}`);
      return `Vote tally — ${parts.length > 0 ? parts.join(', ') : 'no votes cast'}.`;
    }
    case 'day-execution':
      return entry.targetId ? `${playerName(room, entry.targetId)} was executed.` : 'No majority — no one was executed.';
    default:
      return '';
  }
}

/** Day-phase entries for a round are chronologically before that round's night-phase entries —
 * Day N happens, then Night N. Sort keeps that ordering; ties preserve insertion order. */
function timelineRank(entry: TimelineEntry): number {
  return entry.kind.startsWith('day') ? 0 : 1;
}

export default function Timeline({ room }: TimelineProps) {
  const sorted = [...room.timeline].sort((a, b) => a.day - b.day || timelineRank(a) - timelineRank(b));

  return (
    <section className="ss-timeline" aria-label="Timeline">
      <h2>Timeline</h2>
      {sorted.length === 0 ? (
        <p>Nothing has happened yet.</p>
      ) : (
        <ol>
          {sorted.map((entry) => (
            <li key={entry.id}>
              <span className="ss-timeline-day">{entry.kind.startsWith('day') ? `Day ${entry.day}` : `Night ${entry.day}`}</span>{' '}
              {describeEntry(room, entry)}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
