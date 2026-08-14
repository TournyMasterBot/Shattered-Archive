import { useState } from 'react';

import type { RoomAction } from '../../domain/gameReducer.js';
import type { Alignment, RoomState } from '../../domain/types.js';
import RoleParchmentModal from './RoleParchmentModal.js';

interface RolesPanelProps {
  room: RoomState;
  dispatch: (action: RoomAction) => void;
}

const ALIGNMENT_LABELS: Record<Alignment, string> = {
  darkKnight: 'Dark Knight-aligned',
  assassin: 'Assassin-aligned',
  neutral: 'Neutral',
};

/**
 * The role catalog — built-ins plus any Disciple-added modifier roles — independent of player
 * assignment (that lives in `PlayerRoster`). Every role gets a parchment-commands icon here
 * regardless of whether anyone holds it yet, so a Herald can prepare role-reveal notes ahead of
 * assignment.
 */
export default function RolesPanel({ room, dispatch }: RolesPanelProps) {
  const [parchmentRoleId, setParchmentRoleId] = useState<string | null>(null);
  const [showCustomRoleForm, setShowCustomRoleForm] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleAlignment, setNewRoleAlignment] = useState<Alignment>('darkKnight');
  const [newRoleCounts, setNewRoleCounts] = useState(true);
  const [newRoleDescription, setNewRoleDescription] = useState('');

  const parchmentRole = room.roles.find((r) => r.id === parchmentRoleId) ?? null;

  const assignedCount = (roleId: string) => room.players.filter((p) => p.roleId === roleId).length;

  const resetCustomRoleForm = () => {
    setNewRoleName('');
    setNewRoleAlignment('darkKnight');
    setNewRoleCounts(true);
    setNewRoleDescription('');
  };

  const cancelCustomRole = () => {
    resetCustomRoleForm();
    setShowCustomRoleForm(false);
  };

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
    resetCustomRoleForm();
    setShowCustomRoleForm(false);
  };

  return (
    <section className="ss-roles" aria-label="Roles">
      <h2>Roles</h2>

      <ul className="ss-roles-catalog">
        {room.roles.map((role) => (
          <li key={role.id}>
            <div className="ss-role-catalog-row">
              <div className="ss-role-catalog-info">
                <span className="ss-role-catalog-name">{role.name}</span>
                <span className="ss-role-catalog-alignment">{ALIGNMENT_LABELS[role.alignment]}</span>
                {assignedCount(role.id) > 0 && (
                  <span className="ss-role-catalog-count">×{assignedCount(role.id)}</span>
                )}
              </div>
              <div className="ss-role-catalog-actions">
                <button
                  type="button"
                  className="ss-role-note-icon"
                  aria-label={`Role parchment commands for ${role.name}`}
                  title="Role parchment commands"
                  onClick={() => setParchmentRoleId(role.id)}
                >
                  📜
                </button>
                {!role.builtin && (
                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'removeCustomRole', roleId: role.id })}
                    aria-label={`Remove ${role.name}`}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
            <p className="ss-role-catalog-description">{role.description}</p>
          </li>
        ))}
      </ul>

      {showCustomRoleForm ? (
        <div className="ss-custom-role-form">
          <h3>Add a custom role</h3>
          <input
            type="text"
            placeholder="Role name"
            value={newRoleName}
            onChange={(e) => setNewRoleName(e.target.value)}
            aria-label="New role name"
            autoFocus
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
          <div className="ss-custom-role-form-actions">
            <button type="button" onClick={addRole} disabled={!newRoleName.trim()}>
              Add role
            </button>
            <button type="button" onClick={cancelCustomRole}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="ss-add-custom-role-toggle" onClick={() => setShowCustomRoleForm(true)}>
          + Add a custom role
        </button>
      )}

      {parchmentRole && <RoleParchmentModal role={parchmentRole} onClose={() => setParchmentRoleId(null)} />}
    </section>
  );
}
