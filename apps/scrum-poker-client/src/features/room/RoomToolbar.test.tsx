import { fireEvent, render, screen } from '@testing-library/react';

import { DEFAULT_SETTINGS } from '@shatteredarchive/scrum-poker-core';
import type { RoomSettings } from '@shatteredarchive/scrum-poker-core';

import RoomToolbar from './RoomToolbar.js';

function renderToolbar(overrides: {
  settings?: Partial<RoomSettings>;
  isHost?: boolean;
  revealed?: boolean;
  onClearUsers?: () => void;
  onReset?: () => void;
  onSetRevealed?: (revealed: boolean) => void;
}) {
  const props = {
    revealed: overrides.revealed ?? false,
    settings: { ...DEFAULT_SETTINGS, ...overrides.settings },
    isHost: overrides.isHost ?? false,
    disabled: false,
    onSetRevealed: overrides.onSetRevealed ?? jest.fn(),
    onReset: overrides.onReset ?? jest.fn(),
    onClearUsers: overrides.onClearUsers ?? jest.fn(),
    onOpenSettings: jest.fn(),
  };
  render(<RoomToolbar {...props} />);
  return props;
}

describe('RoomToolbar', () => {
  it('toggles between showing and hiding estimates', () => {
    const { onSetRevealed } = renderToolbar({ revealed: false });
    fireEvent.click(screen.getByText('Show estimates'));
    expect(onSetRevealed).toHaveBeenCalledWith(true);
  });

  it('labels the reveal button by what it will do next', () => {
    renderToolbar({ revealed: true });
    expect(screen.getByText('Hide estimates')).toBeDefined();
  });

  it('disables restricted controls for a guest rather than hiding them', () => {
    renderToolbar({ isHost: false, settings: { allowGuestsToReveal: false, allowGuestsToReset: false } });

    const reveal = screen.getByText('Show estimates') as HTMLButtonElement;
    const reset = screen.getByText('Reset estimates') as HTMLButtonElement;
    expect(reveal.disabled).toBe(true);
    expect(reset.disabled).toBe(true);
    expect(reveal.title).toContain('restricted');
    // Still permitted, so still live.
    expect((screen.getByText('Clear all users') as HTMLButtonElement).disabled).toBe(false);
  });

  it('gives the host every control regardless of the guest permissions', () => {
    renderToolbar({
      isHost: true,
      settings: { allowGuestsToReveal: false, allowGuestsToReset: false, allowGuestsToClearUsers: false },
    });

    for (const label of ['Show estimates', 'Reset estimates', 'Clear all users', 'Room settings']) {
      expect((screen.getByText(label) as HTMLButtonElement).disabled).toBe(false);
    }
  });

  it('locks room settings to the host', () => {
    renderToolbar({ isHost: false });
    const settings = screen.getByText('Room settings') as HTMLButtonElement;
    expect(settings.disabled).toBe(true);
    expect(settings.title).toContain('created this room');
  });

  it('confirms before clearing users, and cancelling does nothing', () => {
    const { onClearUsers } = renderToolbar({});

    fireEvent.click(screen.getByText('Clear all users'));
    expect(screen.getByText(/Clear everyone from the room\?/)).toBeDefined();

    fireEvent.click(screen.getByText('Cancel'));
    expect(onClearUsers).not.toHaveBeenCalled();
    expect(screen.getByText('Show estimates')).toBeDefined();
  });

  it('clears once confirmed', () => {
    const { onClearUsers } = renderToolbar({});

    fireEvent.click(screen.getByText('Clear all users'));
    // The confirm banner's own button, not the toolbar one it replaced.
    fireEvent.click(screen.getAllByText('Clear all users')[0]!);

    expect(onClearUsers).toHaveBeenCalledTimes(1);
  });

  it('does not confirm the trivially-undoable actions', () => {
    const { onReset } = renderToolbar({});
    fireEvent.click(screen.getByText('Reset estimates'));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
