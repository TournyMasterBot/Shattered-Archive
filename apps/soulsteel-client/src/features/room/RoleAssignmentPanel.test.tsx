import { fireEvent, render, screen } from '@testing-library/react';

import { createRoom } from '../../domain/gameReducer.js';
import type { RoomAction } from '../../domain/gameReducer.js';
import type { RoomState } from '../../domain/types.js';
import RoleAssignmentPanel from './RoleAssignmentPanel.js';

describe('RoleAssignmentPanel', () => {
  it('shows the recommended distribution for the current player count', () => {
    const room: RoomState = {
      ...createRoom('r1', '2026-01-01T00:00:00.000Z'),
      players: [
        { id: 'p1', name: 'A', roleId: null, alive: true },
        { id: 'p2', name: 'B', roleId: null, alive: true },
        { id: 'p3', name: 'C', roleId: null, alive: true },
        { id: 'p4', name: 'D', roleId: null, alive: true },
        { id: 'p5', name: 'E', roleId: null, alive: true },
      ],
    };
    render(<RoleAssignmentPanel room={room} dispatch={jest.fn()} />);
    expect(screen.getByText(/Suggested for 5 players/)).toBeDefined();
    expect(screen.getByText(/1 Assassin,/)).toBeDefined();
  });

  it('dispatches assignRole when a role is selected', () => {
    const room: RoomState = {
      ...createRoom('r1', '2026-01-01T00:00:00.000Z'),
      players: [{ id: 'p1', name: 'Ada', roleId: null, alive: true }],
    };
    const dispatch = jest.fn<void, [RoomAction]>();
    render(<RoleAssignmentPanel room={room} dispatch={dispatch} />);

    fireEvent.change(screen.getByLabelText('Role for Ada'), { target: { value: 'cultist-assassin' } });
    expect(dispatch).toHaveBeenCalledWith({ type: 'assignRole', playerId: 'p1', roleId: 'cultist-assassin' });
  });

  it('shows the add-players prompt with no roster yet', () => {
    render(<RoleAssignmentPanel room={createRoom('r1', '2026-01-01T00:00:00.000Z')} dispatch={jest.fn()} />);
    expect(screen.getByText('Add players first.')).toBeDefined();
  });
});
