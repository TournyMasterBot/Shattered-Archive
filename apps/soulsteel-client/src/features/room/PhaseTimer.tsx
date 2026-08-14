import { useEffect, useRef, useState } from 'react';

import type { RoomState } from '../../domain/types.js';

interface PhaseTimerProps {
  room: RoomState;
}

type SubPhase = 'discuss' | 'vote';

/**
 * A manual on-screen countdown to pace live play — not wired into the reducer/RoomState. The
 * rules recommend 3m night / 5m discuss / 3m vote (scaling with group size), and Day in this
 * app's phase model covers both discussion and voting, so a sub-phase toggle picks which of the
 * two durations is running. Deliberately ephemeral: reloading the page resets the clock, which
 * is an acceptable trade for not persisting timer state the Herald didn't ask to save.
 */
export default function PhaseTimer({ room }: PhaseTimerProps) {
  const [subPhase, setSubPhase] = useState<SubPhase>('discuss');
  const durationSeconds =
    room.phase === 'night'
      ? room.settings.nightTimerSeconds
      : subPhase === 'discuss'
        ? room.settings.discussTimerSeconds
        : room.settings.voteTimerSeconds;

  const [remaining, setRemaining] = useState(durationSeconds);
  const [running, setRunning] = useState(false);

  // Reset the clock whenever the phase, sub-phase, or configured duration changes.
  useEffect(() => {
    setRemaining(durationSeconds);
    setRunning(false);
  }, [room.phase, subPhase, durationSeconds]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          setRunning(false);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  return (
    <div className="ss-phase-timer">
      {room.phase === 'day' && (
        <div className="ss-phase-timer-subphase" role="group" aria-label="Timer phase">
          <button type="button" className={subPhase === 'discuss' ? 'ss-active' : ''} onClick={() => setSubPhase('discuss')}>
            Discuss
          </button>
          <button type="button" className={subPhase === 'vote' ? 'ss-active' : ''} onClick={() => setSubPhase('vote')}>
            Vote
          </button>
        </div>
      )}

      <span className="ss-phase-timer-clock">
        {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </span>

      <button type="button" onClick={() => setRunning((r) => !r)} disabled={remaining === 0}>
        {running ? 'Pause' : 'Start'}
      </button>
      <button
        type="button"
        onClick={() => {
          setRunning(false);
          setRemaining(durationSeconds);
        }}
      >
        Reset
      </button>
    </div>
  );
}
