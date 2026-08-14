import { UMBRASEER_BLOCKED_MESSAGE } from '../../domain/umbraseerBlock.js';
import type { RoomAction } from '../../domain/gameReducer.js';
import type { RoomState } from '../../domain/types.js';

interface RoomSettingsDialogProps {
  room: RoomState;
  dispatch: (action: RoomAction) => void;
  onClose: () => void;
}

/** Custom/modifier roles live in `RolesPanel` now — this dialog is timers only. */
export default function RoomSettingsDialog({ room, dispatch, onClose }: RoomSettingsDialogProps) {
  return (
    <div className="ss-dialog-backdrop" role="presentation" onClick={onClose}>
      <div className="ss-dialog" role="dialog" aria-label="Room settings" onClick={(e) => e.stopPropagation()}>
        <div className="ss-dialog-header">
          <h2>Settings</h2>
          <button type="button" onClick={onClose} aria-label="Close settings">
            ✕
          </button>
        </div>

        <section className="ss-dialog-section">
          <h3>Timers</h3>
          <label>
            Discuss (seconds)
            <input
              type="number"
              min={0}
              value={room.settings.discussTimerSeconds}
              onChange={(e) =>
                dispatch({ type: 'updateSettings', settings: { discussTimerSeconds: Number(e.target.value) } })
              }
            />
          </label>
          <label>
            Vote (seconds)
            <input
              type="number"
              min={0}
              value={room.settings.voteTimerSeconds}
              onChange={(e) => dispatch({ type: 'updateSettings', settings: { voteTimerSeconds: Number(e.target.value) } })}
            />
          </label>
          <label>
            Night (seconds)
            <input
              type="number"
              min={0}
              value={room.settings.nightTimerSeconds}
              onChange={(e) => dispatch({ type: 'updateSettings', settings: { nightTimerSeconds: Number(e.target.value) } })}
            />
          </label>
        </section>

        <section className="ss-dialog-section">
          <h3>House rules</h3>
          <label className="ss-dialog-checkbox">
            <input
              type="checkbox"
              checked={room.settings.firstNightNoKill}
              onChange={(e) => dispatch({ type: 'updateSettings', settings: { firstNightNoKill: e.target.checked } })}
            />
            No kill allowed on the first night
          </label>
          <label className="ss-dialog-checkbox">
            <input
              type="checkbox"
              checked={room.settings.darkshieldBlocksUmbraseer}
              onChange={(e) =>
                dispatch({ type: 'updateSettings', settings: { darkshieldBlocksUmbraseer: e.target.checked } })
              }
            />
            Darkshield blocks Umbraseer
          </label>
          <p className="ss-dialog-hint">
            If the Darkshield protects an Assassin-aligned player, the Umbraseer is told &ldquo;
            {UMBRASEER_BLOCKED_MESSAGE}&rdquo; that night instead of the true result. Good for small
            games that otherwise resolve too quickly.
          </p>
        </section>
      </div>
    </div>
  );
}
