import { fireEvent, render, screen } from '@testing-library/react';

import { createRoom } from '../../domain/gameReducer.js';
import type { RoomAction } from '../../domain/gameReducer.js';
import type { RoomState } from '../../domain/types.js';
import PlayerRoster from './PlayerRoster.js';

function renderRoster(room: RoomState, dispatch: (action: RoomAction) => void = jest.fn()) {
  render(<PlayerRoster room={room} dispatch={dispatch} />);
  return dispatch;
}

describe('PlayerRoster', () => {
  it('shows the empty state with no players', () => {
    renderRoster(createRoom('r1', '2026-01-01T00:00:00.000Z'));
    expect(screen.getByText('Add players to begin.')).toBeDefined();
  });

  it('dispatches addPlayer with the trimmed name and clears the input', () => {
    const dispatch = jest.fn();
    renderRoster(createRoom('r1', '2026-01-01T00:00:00.000Z'), dispatch);

    const input = screen.getByPlaceholderText('Player name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '  Ada  ' } });
    fireEvent.click(screen.getByText('Add'));

    expect(dispatch).toHaveBeenCalledWith({ type: 'addPlayer', name: 'Ada' });
  });

  it('does not dispatch for a blank name', () => {
    const dispatch = jest.fn();
    renderRoster(createRoom('r1', '2026-01-01T00:00:00.000Z'), dispatch);
    expect((screen.getByText('Add') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows an alive/dead status per player and lets the Herald remove one', () => {
    const room: RoomState = {
      ...createRoom('r1', '2026-01-01T00:00:00.000Z'),
      players: [
        { id: 'p1', name: 'Ada', roleId: null, alive: true },
        { id: 'p2', name: 'Grace', roleId: null, alive: false, eliminatedAt: { day: 1, phase: 'night', cause: 'assassinated' } },
      ],
    };
    const dispatch = jest.fn();
    renderRoster(room, dispatch);

    expect(screen.getByText('Alive')).toBeDefined();
    expect(screen.getByText('Dead — assassinated (Day 1)')).toBeDefined();

    fireEvent.click(screen.getByLabelText('Remove Ada'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'removePlayer', playerId: 'p1' });
  });
});
