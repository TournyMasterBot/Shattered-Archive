import { isUmbraseerBlocked, UMBRASEER_BLOCKED_MESSAGE } from '../../domain/umbraseerBlock.js';
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
    case 'night-check': {
      const target = playerName(room, entry.targetId);
      return isUmbraseerBlocked(room, entry.day)
        ? `${playerName(room, entry.checkerId)} checked ${target}, but was told "${UMBRASEER_BLOCKED_MESSAGE}" (actually ${entry.roleName}).`
        : `${playerName(room, entry.checkerId)} checked ${target}: ${entry.roleName}.`;
    }
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
    case 'admin-status-change':
      return entry.alive
        ? `${playerName(room, entry.targetId)} was manually marked ALIVE by the Herald.`
        : `${playerName(room, entry.targetId)} was manually marked DEAD by the Herald.`;
    default:
      return '';
  }
}

/**
 * Day-phase entries for a round are chronologically before that round's night-phase entries —
 * Day N happens, then Night N. Every other entry kind's phase is inferable from its `kind`
 * prefix, but `admin-status-change` can happen in either phase, so it carries its own explicit
 * `phase` field instead.
 */
function entryPhase(entry: TimelineEntry): 'day' | 'night' {
  if (entry.kind === 'admin-status-change') return entry.phase;
  return entry.kind.startsWith('day') ? 'day' : 'night';
}

function timelineRank(entry: TimelineEntry): number {
  return entryPhase(entry) === 'day' ? 0 : 1;
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
            <li key={entry.id} className={entry.kind === 'admin-status-change' ? 'ss-timeline-admin' : undefined}>
              <span className="ss-timeline-day">
                {entryPhase(entry) === 'day' ? `Day ${entry.day}` : `Night ${entry.day}`}
              </span>{' '}
              {entry.kind === 'admin-status-change' && <span className="ss-timeline-admin-tag">Admin</span>}{' '}
              {describeEntry(room, entry)}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
