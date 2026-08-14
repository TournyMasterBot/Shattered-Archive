import type { RoomAction } from '../../domain/gameReducer.js';
import type { RoomState } from '../../domain/types.js';
import PhaseTimer from './PhaseTimer.js';

interface PhaseControllerProps {
  room: RoomState;
  dispatch: (action: RoomAction) => void;
}

export default function PhaseController({ room, dispatch }: PhaseControllerProps) {
  return (
    <div className="ss-phase-controller">
      <span className="ss-phase-label">
        {room.phase === 'day' ? 'Day' : 'Night'} {room.dayNumber}
      </span>

      <PhaseTimer room={room} />

      {room.phase === 'day' ? (
        <button type="button" onClick={() => dispatch({ type: 'advanceToNight' })}>
          Night falls →
        </button>
      ) : (
        <button type="button" onClick={() => dispatch({ type: 'resolveNight' })}>
          Resolve night →
        </button>
      )}
    </div>
  );
}
