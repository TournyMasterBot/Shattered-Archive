import { fireEvent, render, screen } from '@testing-library/react';

import { createRoom } from '../../domain/gameReducer.js';
import type { RoomAction } from '../../domain/gameReducer.js';
import type { RoomState } from '../../domain/types.js';
import NightActionLog from './NightActionLog.js';

function nightRoom(): RoomState {
  return {
    ...createRoom('r1', '2026-01-01T00:00:00.000Z'),
    phase: 'night',
    players: [
      { id: 'shield', name: 'Shield', roleId: 'darkshield', alive: true },
      { id: 'target', name: 'Target', roleId: 'dark-knight', alive: true },
    ],
  };
}

describe('NightActionLog', () => {
  it('renders nothing during the day', () => {
    const { container } = render(
      <NightActionLog room={{ ...nightRoom(), phase: 'day' }} dispatch={jest.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('dispatches recordNightProtect when a target is confirmed', () => {
    const dispatch = jest.fn<void, [RoomAction]>();
    render(<NightActionLog room={nightRoom()} dispatch={dispatch} />);

    fireEvent.change(screen.getByLabelText("Darkshield's protection"), { target: { value: 'target' } });
    fireEvent.click(screen.getByText('Confirm'));

    expect(dispatch).toHaveBeenCalledWith({ type: 'recordNightProtect', protectorId: 'shield', targetId: 'target' });
  });

  it('locks the row to a read-only recorded state once an action is recorded for the night', () => {
    const room: RoomState = {
      ...nightRoom(),
      timeline: [{ id: 'e1', kind: 'night-protect', day: 1, protectorId: 'shield', targetId: 'target' }],
    };
    render(<NightActionLog room={room} dispatch={jest.fn()} />);

    expect(screen.getByText('Protecting Target')).toBeDefined();
    expect(screen.queryByLabelText("Darkshield's protection")).toBeNull();
    expect(screen.getByText('Change')).toBeDefined();
  });

  it('re-opens the select when "Change" is clicked', () => {
    const room: RoomState = {
      ...nightRoom(),
      timeline: [{ id: 'e1', kind: 'night-protect', day: 1, protectorId: 'shield', targetId: 'target' }],
    };
    render(<NightActionLog room={room} dispatch={jest.fn()} />);

    fireEvent.click(screen.getByText('Change'));
    expect(screen.getByLabelText("Darkshield's protection")).toBeDefined();
  });

  function darkshieldBlockScenario(darkshieldBlocksUmbraseer: boolean): RoomState {
    const base = createRoom('r1', '2026-01-01T00:00:00.000Z');
    return {
      ...base,
      phase: 'night',
      settings: { ...base.settings, darkshieldBlocksUmbraseer },
      players: [
        { id: 'seer', name: 'Seer', roleId: 'umbraseer', alive: true },
        { id: 'shield', name: 'Shield', roleId: 'darkshield', alive: true },
        { id: 'cultist', name: 'Cultist', roleId: 'cultist-assassin', alive: true },
      ],
      timeline: [
        { id: 'e1', kind: 'night-protect', day: 1, protectorId: 'shield', targetId: 'cultist' },
        { id: 'e2', kind: 'night-check', day: 1, checkerId: 'seer', targetId: 'cultist', result: 'assassin' },
      ],
    };
  }

  it('shows the blocked message (with the true result for the Herald) when the house rule triggers', () => {
    render(<NightActionLog room={darkshieldBlockScenario(true)} dispatch={jest.fn()} />);
    expect(screen.getByText(/Umbral forces block your sight/)).toBeDefined();
    expect(screen.getByText(/actually an Assassin/)).toBeDefined();
  });

  it('shows the true result when the house rule is off, even if the Darkshield protected the Assassin', () => {
    render(<NightActionLog room={darkshieldBlockScenario(false)} dispatch={jest.fn()} />);
    expect(screen.getByText('Cultist: an Assassin')).toBeDefined();
  });
});
