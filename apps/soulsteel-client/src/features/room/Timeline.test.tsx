import { render, screen } from '@testing-library/react';

import { createRoom } from '../../domain/gameReducer.js';
import type { RoomState } from '../../domain/types.js';
import Timeline from './Timeline.js';

describe('Timeline', () => {
  it('shows the empty state', () => {
    render(<Timeline room={createRoom('r1', '2026-01-01T00:00:00.000Z')} />);
    expect(screen.getByText('Nothing has happened yet.')).toBeDefined();
  });

  it('orders a round\'s day entries before its night entries', () => {
    const room: RoomState = {
      ...createRoom('r1', '2026-01-01T00:00:00.000Z'),
      players: [{ id: 'p1', name: 'Ada', roleId: null, alive: false, eliminatedAt: { day: 1, phase: 'night', cause: 'assassinated' } }],
      timeline: [
        { id: 'e2', kind: 'night-elimination', day: 1, targetId: 'p1', protected: false },
        { id: 'e1', kind: 'day-execution', day: 1, targetId: null },
      ],
    };
    render(<Timeline room={room} />);

    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items[0]).toContain('Day 1');
    expect(items[1]).toContain('Night 1');
  });

  it('describes a protected assassination attempt distinctly from a successful one', () => {
    const room: RoomState = {
      ...createRoom('r1', '2026-01-01T00:00:00.000Z'),
      players: [{ id: 'p1', name: 'Ada', roleId: null, alive: true }],
      timeline: [{ id: 'e1', kind: 'night-elimination', day: 1, targetId: 'p1', protected: true }],
    };
    render(<Timeline room={room} />);
    expect(screen.getByText(/attacked but survived/)).toBeDefined();
  });
});
