import { fireEvent, render, screen } from '@testing-library/react';

import { DEFAULT_SETTINGS } from '@shatteredarchive/scrum-poker-core';

import RoomSettingsDialog from './RoomSettingsDialog.js';

describe('RoomSettingsDialog', () => {
  it('sends the edited name, deck and toggles in one patch', () => {
    const onSave = jest.fn();
    render(<RoomSettingsDialog settings={DEFAULT_SETTINGS} onSave={onSave} onClose={jest.fn()} />);

    fireEvent.change(screen.getByLabelText('Room name'), { target: { value: 'Platform Team' } });
    fireEvent.change(screen.getByLabelText('Estimate cards'), { target: { value: 'S, M, L' } });
    fireEvent.click(screen.getByText('Show the median after reveal'));
    fireEvent.click(screen.getByText('Save settings'));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ friendlyName: 'Platform Team', deck: ['S', 'M', 'L'], showMedian: false }),
    );
  });

  it('blocks saving an invalid deck and shows the same message the server would', () => {
    const onSave = jest.fn();
    render(<RoomSettingsDialog settings={DEFAULT_SETTINGS} onSave={onSave} onClose={jest.fn()} />);

    fireEvent.change(screen.getByLabelText('Estimate cards'), { target: { value: 'only' } });

    expect(screen.getByText('A deck needs at least 2 cards.')).toBeDefined();
    expect((screen.getByText('Save settings') as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByText('Save settings'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('closes without saving on cancel', () => {
    const onSave = jest.fn();
    const onClose = jest.fn();
    render(<RoomSettingsDialog settings={DEFAULT_SETTINGS} onSave={onSave} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText('Room name'), { target: { value: 'Discarded' } });
    fireEvent.click(screen.getByText('Cancel'));

    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});
