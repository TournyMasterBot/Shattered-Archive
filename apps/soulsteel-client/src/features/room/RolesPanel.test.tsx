import { fireEvent, render, screen } from '@testing-library/react';

import { createRoom } from '../../domain/gameReducer.js';
import type { RoomAction } from '../../domain/gameReducer.js';
import type { RoomState } from '../../domain/types.js';
import RolesPanel from './RolesPanel.js';

describe('RolesPanel', () => {
  it('shows the four built-in roles even with no players yet', () => {
    render(<RolesPanel room={createRoom('r1', '2026-01-01T00:00:00.000Z')} dispatch={jest.fn()} />);
    for (const name of ['Umbraseer', 'Darkshield', 'Dark Knight', 'Cultist Assassin']) {
      expect(screen.getByText(name)).toBeDefined();
    }
  });

  it('opens the role parchment modal for a role that has no players assigned yet', () => {
    render(<RolesPanel room={createRoom('r1', '2026-01-01T00:00:00.000Z')} dispatch={jest.fn()} />);
    fireEvent.click(screen.getByLabelText('Role parchment commands for Umbraseer'));
    expect(screen.getByRole('dialog', { name: 'Role parchment commands for Umbraseer' })).toBeDefined();
  });

  it('shows an assigned-count badge only once a player holds the role', () => {
    const room: RoomState = {
      ...createRoom('r1', '2026-01-01T00:00:00.000Z'),
      players: [{ id: 'p1', name: 'Ada', roleId: 'umbraseer', alive: true }],
    };
    render(<RolesPanel room={room} dispatch={jest.fn()} />);
    expect(screen.getByText('×1')).toBeDefined();
    expect(screen.queryByText('×0')).toBeNull();
  });

  it('keeps the custom-role form collapsed behind a toggle by default', () => {
    render(<RolesPanel room={createRoom('r1', '2026-01-01T00:00:00.000Z')} dispatch={jest.fn()} />);
    expect(screen.queryByLabelText('New role name')).toBeNull();
    expect(screen.getByText('+ Add a custom role')).toBeDefined();
  });

  it('expands the form on toggle, and Cancel collapses it again without adding anything', () => {
    const dispatch = jest.fn<void, [RoomAction]>();
    render(<RolesPanel room={createRoom('r1', '2026-01-01T00:00:00.000Z')} dispatch={dispatch} />);

    fireEvent.click(screen.getByText('+ Add a custom role'));
    expect(screen.getByLabelText('New role name')).toBeDefined();

    fireEvent.change(screen.getByLabelText('New role name'), { target: { value: 'Half-typed' } });
    fireEvent.click(screen.getByText('Cancel'));

    expect(dispatch).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('New role name')).toBeNull();
    expect(screen.getByText('+ Add a custom role')).toBeDefined();
  });

  it('adds a custom role with the chosen alignment and tally flag, then collapses the form', () => {
    const dispatch = jest.fn<void, [RoomAction]>();
    render(<RolesPanel room={createRoom('r1', '2026-01-01T00:00:00.000Z')} dispatch={dispatch} />);

    fireEvent.click(screen.getByText('+ Add a custom role'));
    fireEvent.change(screen.getByLabelText('New role name'), { target: { value: 'Cultist Minion' } });
    fireEvent.change(screen.getByLabelText('New role alignment'), { target: { value: 'assassin' } });
    fireEvent.click(screen.getByLabelText('Counts toward the automatic win check'));
    fireEvent.click(screen.getByText('Add role'));

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'addCustomRole',
        role: expect.objectContaining({ name: 'Cultist Minion', alignment: 'assassin', countsTowardWinTally: false }),
      }),
    );
    expect(screen.queryByLabelText('New role name')).toBeNull();
  });

  it('can remove a custom role but not a built-in one', () => {
    const dispatch = jest.fn<void, [RoomAction]>();
    const room: RoomState = {
      ...createRoom('r1', '2026-01-01T00:00:00.000Z'),
      roles: [
        ...createRoom('r1', '2026-01-01T00:00:00.000Z').roles,
        { id: 'custom-1', name: 'Pilferer', alignment: 'darkKnight', builtin: false, description: 'Steals a role.' },
      ],
    };
    render(<RolesPanel room={room} dispatch={dispatch} />);

    expect(screen.queryByLabelText('Remove Umbraseer')).toBeNull();
    fireEvent.click(screen.getByLabelText('Remove Pilferer'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'removeCustomRole', roleId: 'custom-1' });
  });
});
