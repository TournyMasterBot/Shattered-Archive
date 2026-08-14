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

  it('describes a blocked Umbraseer check with the true result, when the house rule triggers', () => {
    const base = createRoom('r1', '2026-01-01T00:00:00.000Z');
    const room: RoomState = {
      ...base,
      settings: { ...base.settings, darkshieldBlocksUmbraseer: true },
      players: [
        { id: 'seer', name: 'Seer', roleId: 'umbraseer', alive: true },
        { id: 'cultist', name: 'Cultist', roleId: 'cultist-assassin', alive: true },
      ],
      timeline: [
        { id: 'e1', kind: 'night-protect', day: 1, protectorId: 'shield', targetId: 'cultist' },
        {
          id: 'e2',
          kind: 'night-check',
          day: 1,
          checkerId: 'seer',
          targetId: 'cultist',
          result: 'assassin',
          roleName: 'Cultist Assassin',
        },
      ],
    };
    render(<Timeline room={room} />);
    expect(screen.getByText(/Umbral forces block your sight/)).toBeDefined();
    expect(screen.getByText(/actually Cultist Assassin/)).toBeDefined();
  });

  it('flags a manual Herald status change with an Admin tag and describes it distinctly', () => {
    const room: RoomState = {
      ...createRoom('r1', '2026-01-01T00:00:00.000Z'),
      players: [{ id: 'p1', name: 'Ada', roleId: null, alive: false }],
      timeline: [{ id: 'e1', kind: 'admin-status-change', day: 1, phase: 'day', targetId: 'p1', alive: false }],
    };
    render(<Timeline room={room} />);
    expect(screen.getByText('Admin')).toBeDefined();
    expect(screen.getByText(/Ada was manually marked DEAD by the Herald\./)).toBeDefined();
  });

  it('uses an admin entry\'s own phase field for ordering, not a kind-name prefix guess', () => {
    const room: RoomState = {
      ...createRoom('r1', '2026-01-01T00:00:00.000Z'),
      players: [{ id: 'p1', name: 'Ada', roleId: null, alive: true }],
      timeline: [
        { id: 'e2', kind: 'admin-status-change', day: 1, phase: 'night', targetId: 'p1', alive: true },
        { id: 'e1', kind: 'day-execution', day: 1, targetId: null },
      ],
    };
    render(<Timeline room={room} />);
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items[0]).toContain('Day 1');
    expect(items[1]).toContain('Night 1');
  });
});
