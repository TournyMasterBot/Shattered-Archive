import { fireEvent, render, screen } from '@testing-library/react';

import { createRoom } from '../../domain/gameReducer.js';
import type { RoomState } from '../../domain/types.js';
import WinConditionBanner from './WinConditionBanner.js';

function roomWithWin(): RoomState {
  return {
    ...createRoom('r1', '2026-01-01T00:00:00.000Z'),
    players: [
      { id: 'a', name: 'Assassin', roleId: 'cultist-assassin', alive: true },
      { id: 'k1', name: 'Knight A', roleId: 'dark-knight', alive: false, eliminatedAt: { day: 1, phase: 'day', cause: 'executed' } },
    ],
  };
}

describe('WinConditionBanner', () => {
  it('renders nothing when there is no win condition', () => {
    const { container } = render(<WinConditionBanner room={createRoom('r1', '2026-01-01T00:00:00.000Z')} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the Assassins win banner once they outnumber living Dark Knights', () => {
    render(<WinConditionBanner room={roomWithWin()} />);
    expect(screen.getByText(/Assassins have won/)).toBeDefined();
  });

  it('is dismissible', () => {
    render(<WinConditionBanner room={roomWithWin()} />);
    fireEvent.click(screen.getByText('Dismiss'));
    expect(screen.queryByText(/Assassins have won/)).toBeNull();
  });
});
