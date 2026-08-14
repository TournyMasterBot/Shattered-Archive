import { recommendedDistribution } from '../../domain/recommendedDistribution.js';
import type { RoomAction } from '../../domain/gameReducer.js';
import type { RoomState } from '../../domain/types.js';

interface RoleAssignmentPanelProps {
  room: RoomState;
  dispatch: (action: RoomAction) => void;
}

export default function RoleAssignmentPanel({ room, dispatch }: RoleAssignmentPanelProps) {
  const distribution = recommendedDistribution(room.players.length);

  return (
    <section className="ss-roles" aria-label="Role assignment">
      <h2>Roles</h2>

      <p className="ss-roles-hint">
        Suggested for {room.players.length} players: {distribution.umbraseer ? '1 Umbraseer, ' : ''}
        {distribution.darkshield ? '1 Darkshield, ' : ''}
        {distribution.assassins} Assassin{distribution.assassins === 1 ? '' : 's'}, {distribution.darkKnights} Dark
        Knight{distribution.darkKnights === 1 ? '' : 's'}.
      </p>

      {room.players.length === 0 ? (
        <p className="ss-roles-empty">Add players first.</p>
      ) : (
        <ul className="ss-roles-list">
          {room.players.map((p) => (
            <li key={p.id}>
              <span>{p.name}</span>
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
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
