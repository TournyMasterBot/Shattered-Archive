import { fireEvent, render, screen } from '@testing-library/react';

import { createRoom } from '../../domain/gameReducer.js';
import type { RoomAction } from '../../domain/gameReducer.js';
import RoomSettingsDialog from './RoomSettingsDialog.js';

describe('RoomSettingsDialog', () => {
  it('dispatches updateSettings when a timer value changes', () => {
    const dispatch = jest.fn<void, [RoomAction]>();
    render(<RoomSettingsDialog room={createRoom('r1', '2026-01-01T00:00:00.000Z')} dispatch={dispatch} onClose={jest.fn()} />);

    fireEvent.change(screen.getByLabelText('Discuss (seconds)'), { target: { value: '240' } });
    expect(dispatch).toHaveBeenCalledWith({ type: 'updateSettings', settings: { discussTimerSeconds: 240 } });
  });

  it('adds a custom role with the chosen alignment and tally flag', () => {
    const dispatch = jest.fn<void, [RoomAction]>();
    render(<RoomSettingsDialog room={createRoom('r1', '2026-01-01T00:00:00.000Z')} dispatch={dispatch} onClose={jest.fn()} />);

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
  });

  it('closes when clicking the backdrop but not the dialog itself', () => {
    const onClose = jest.fn();
    render(<RoomSettingsDialog room={createRoom('r1', '2026-01-01T00:00:00.000Z')} dispatch={jest.fn()} onClose={onClose} />);

    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('presentation'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
