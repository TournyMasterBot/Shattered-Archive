import { useState } from 'react';

import type { RoomAction } from '../../domain/gameReducer.js';
import type { Alignment, RoomState } from '../../domain/types.js';

interface RoomSettingsDialogProps {
  room: RoomState;
  dispatch: (action: RoomAction) => void;
  onClose: () => void;
}

const ALIGNMENT_LABELS: Record<Alignment, string> = {
  darkKnight: 'Dark Knight-aligned',
  assassin: 'Assassin-aligned',
  neutral: 'Neutral',
};

export default function RoomSettingsDialog({ room, dispatch, onClose }: RoomSettingsDialogProps) {
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleAlignment, setNewRoleAlignment] = useState<Alignment>('darkKnight');
  const [newRoleCounts, setNewRoleCounts] = useState(true);
  const [newRoleDescription, setNewRoleDescription] = useState('');

  const customRoles = room.roles.filter((r) => !r.builtin);

  const addRole = () => {
    const trimmed = newRoleName.trim();
    if (!trimmed) return;
    dispatch({
      type: 'addCustomRole',
      role: {
        id: crypto.randomUUID(),
        name: trimmed,
        alignment: newRoleAlignment,
        description: newRoleDescription.trim() || 'Custom Game Modifier role.',
        countsTowardWinTally: newRoleCounts,
      },
    });
    setNewRoleName('');
    setNewRoleDescription('');
  };

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
          <label className="ss-dialog-checkbox">
            <input
              type="checkbox"
              checked={room.settings.firstNightNoKill}
              onChange={(e) => dispatch({ type: 'updateSettings', settings: { firstNightNoKill: e.target.checked } })}
            />
            No kill allowed on the first night
          </label>
        </section>

        <section className="ss-dialog-section">
          <h3>Custom / modifier roles</h3>

          {customRoles.length === 0 ? (
            <p>No custom roles yet.</p>
          ) : (
            <ul className="ss-custom-role-list">
              {customRoles.map((r) => (
                <li key={r.id}>
                  <span>
                    {r.name} ({ALIGNMENT_LABELS[r.alignment]}
                    {r.countsTowardWinTally === false ? ', not counted toward the win check' : ''})
                  </span>
                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'removeCustomRole', roleId: r.id })}
                    aria-label={`Remove ${r.name}`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="ss-custom-role-form">
            <input
              type="text"
              placeholder="Role name"
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              aria-label="New role name"
            />
            <select
              aria-label="New role alignment"
              value={newRoleAlignment}
              onChange={(e) => setNewRoleAlignment(e.target.value as Alignment)}
            >
              {(Object.entries(ALIGNMENT_LABELS) as [Alignment, string][]).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <label className="ss-dialog-checkbox">
              <input type="checkbox" checked={newRoleCounts} onChange={(e) => setNewRoleCounts(e.target.checked)} />
              Counts toward the automatic win check
            </label>
            <input
              type="text"
              placeholder="Description (optional)"
              value={newRoleDescription}
              onChange={(e) => setNewRoleDescription(e.target.value)}
              aria-label="New role description"
            />
            <button type="button" onClick={addRole} disabled={!newRoleName.trim()}>
              Add role
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
