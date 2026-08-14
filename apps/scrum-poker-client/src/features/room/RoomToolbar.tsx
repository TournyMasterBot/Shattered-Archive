import { useState } from 'react';

import type { RoomSettings } from '@shatteredarchive/scrum-poker-core';

/**
 * Show/hide, reset, and clear-users.
 *
 * Only "Clear all users" confirms. Show/hide and reset are trivially undoable — press the
 * other one — so a dialog on those is friction with no safety value; clearing wipes the whole
 * roster and is the one action here a mis-click makes visible to everyone in the room.
 *
 * Controls the caller isn't allowed to run are rendered DISABLED with an explanatory title
 * rather than hidden, so a guest can see the organizer has restricted them instead of
 * wondering where the button went.
 */
export default function RoomToolbar({
  revealed,
  settings,
  isHost,
  disabled,
  onSetRevealed,
  onReset,
  onClearUsers,
  onOpenSettings,
}: {
  revealed: boolean;
  settings: RoomSettings;
  isHost: boolean;
  disabled: boolean;
  onSetRevealed: (revealed: boolean) => void;
  onReset: () => void;
  onClearUsers: () => void;
  onOpenSettings: () => void;
}) {
  const [confirmingClear, setConfirmingClear] = useState(false);

  const mayReveal = isHost || settings.allowGuestsToReveal;
  const mayReset = isHost || settings.allowGuestsToReset;
  const mayClear = isHost || settings.allowGuestsToClearUsers;
  const restricted = 'The room organizer has restricted this to themselves.';

  if (confirmingClear) {
    return (
      <div className="sp-banner sp-banner-info">
        <span>
          Clear everyone from the room? People with the page open will reappear automatically; stale entries won’t.
        </span>
        <div className="sp-banner-actions">
          <button type="button" className="sp-btn" onClick={() => setConfirmingClear(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="sp-btn sp-btn-danger"
            onClick={() => {
              setConfirmingClear(false);
              onClearUsers();
            }}
          >
            Clear all users
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="sp-toolbar">
      <button
        type="button"
        className="sp-btn sp-btn-primary"
        disabled={disabled || !mayReveal}
        title={mayReveal ? undefined : restricted}
        onClick={() => onSetRevealed(!revealed)}
      >
        {revealed ? 'Hide estimates' : 'Show estimates'}
      </button>

      <button
        type="button"
        className="sp-btn"
        disabled={disabled || !mayReset}
        title={mayReset ? undefined : restricted}
        onClick={onReset}
      >
        Reset estimates
      </button>

      <button
        type="button"
        className="sp-btn"
        disabled={disabled || !mayClear}
        title={mayClear ? undefined : restricted}
        onClick={() => setConfirmingClear(true)}
      >
        Clear all users
      </button>

      <span className="sp-toolbar-spacer" />

      <button
        type="button"
        className="sp-btn"
        disabled={disabled || !isHost}
        title={isHost ? undefined : 'Only the person who created this room can change its settings.'}
        onClick={onOpenSettings}
      >
        Room settings
      </button>
    </div>
  );
}
