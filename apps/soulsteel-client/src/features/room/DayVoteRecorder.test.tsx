import { fireEvent, render, screen } from '@testing-library/react';

import { createRoom } from '../../domain/gameReducer.js';
import type { RoomAction } from '../../domain/gameReducer.js';
import type { RoomState } from '../../domain/types.js';
import DayVoteRecorder from './DayVoteRecorder.js';

function dayRoom(): RoomState {
  return {
    ...createRoom('r1', '2026-01-01T00:00:00.000Z'),
    players: [
      { id: 'a', name: 'Ada', roleId: null, alive: true },
      { id: 'b', name: 'Bram', roleId: null, alive: true },
      { id: 'c', name: 'Cass', roleId: null, alive: true },
    ],
  };
}

describe('DayVoteRecorder', () => {
  it('requires a strict majority (>50%) before offering execution', () => {
    const dispatch = jest.fn<void, [RoomAction]>();
    render(<DayVoteRecorder room={dayRoom()} dispatch={dispatch} />);

    // 1 of 3 votes is not a majority (needs 2).
    fireEvent.change(screen.getByLabelText('Votes for Ada'), { target: { value: '1' } });
    expect(screen.getByText('Record — no majority')).toBeDefined();

    fireEvent.change(screen.getByLabelText('Votes for Ada'), { target: { value: '2' } });
    expect(screen.getByText('Execute Ada')).toBeDefined();
  });

  it('dispatches the vote tally and the execution together on confirm', () => {
    const dispatch = jest.fn<void, [RoomAction]>();
    render(<DayVoteRecorder room={dayRoom()} dispatch={dispatch} />);

    fireEvent.change(screen.getByLabelText('Votes for Ada'), { target: { value: '2' } });
    fireEvent.click(screen.getByText('Execute Ada'));

    expect(dispatch).toHaveBeenCalledWith({ type: 'recordVoteTally', tally: { a: 2 } });
    expect(dispatch).toHaveBeenCalledWith({ type: 'executePlayer', targetId: 'a', note: undefined });
  });

  it('shows the resolved outcome instead of the form once the day has already been executed', () => {
    const room: RoomState = {
      ...dayRoom(),
      timeline: [{ id: 'e1', kind: 'day-execution', day: 1, targetId: null }],
    };
    render(<DayVoteRecorder room={room} dispatch={jest.fn()} />);
    expect(screen.getByText('No majority was reached — no one was executed.')).toBeDefined();
    expect(screen.queryByLabelText('Votes for Ada')).toBeNull();
  });
});
