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

  it('dispatches updateSettings when the Darkshield-blocks-Umbraseer house rule is toggled', () => {
    const dispatch = jest.fn<void, [RoomAction]>();
    render(<RoomSettingsDialog room={createRoom('r1', '2026-01-01T00:00:00.000Z')} dispatch={dispatch} onClose={jest.fn()} />);

    fireEvent.click(screen.getByLabelText('Darkshield blocks Umbraseer'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'updateSettings', settings: { darkshieldBlocksUmbraseer: true } });
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
