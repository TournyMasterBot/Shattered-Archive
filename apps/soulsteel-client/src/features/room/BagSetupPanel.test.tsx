import { fireEvent, render, screen } from '@testing-library/react';

import { createRoom } from '../../domain/gameReducer.js';
import type { RoomAction } from '../../domain/gameReducer.js';
import type { RoomState } from '../../domain/types.js';
import BagSetupPanel from './BagSetupPanel.js';

describe('BagSetupPanel', () => {
  it('shows a hint and no rows when no bags are set up', () => {
    render(<BagSetupPanel room={createRoom('r1', '2026-01-01T00:00:00.000Z')} dispatch={jest.fn()} />);
    expect(screen.getByText('Set a bag count to map roles into numbered bags.')).toBeDefined();
  });

  it('dispatches setBagCount from the number-of-bags input', () => {
    const dispatch = jest.fn<void, [RoomAction]>();
    render(<BagSetupPanel room={createRoom('r1', '2026-01-01T00:00:00.000Z')} dispatch={dispatch} />);

    fireEvent.change(screen.getByLabelText('Number of bags'), { target: { value: '3' } });
    expect(dispatch).toHaveBeenCalledWith({ type: 'setBagCount', count: 3 });
  });

  it('dispatches setBagContainerKeyword from the keyword input', () => {
    const dispatch = jest.fn<void, [RoomAction]>();
    render(<BagSetupPanel room={createRoom('r1', '2026-01-01T00:00:00.000Z')} dispatch={dispatch} />);

    fireEvent.change(screen.getByLabelText('Bag container keyword'), { target: { value: 'pouch' } });
    expect(dispatch).toHaveBeenCalledWith({ type: 'setBagContainerKeyword', keyword: 'pouch' });
  });

  it('lists a row per bag and dispatches assignBagRole on role selection', () => {
    const dispatch = jest.fn<void, [RoomAction]>();
    const room: RoomState = {
      ...createRoom('r1', '2026-01-01T00:00:00.000Z'),
      bags: [
        { number: 1, roleId: null },
        { number: 2, roleId: 'umbraseer' },
      ],
    };
    render(<BagSetupPanel room={room} dispatch={dispatch} />);

    expect(screen.getByText('Bag 1')).toBeDefined();
    expect(screen.getByText('Bag 2')).toBeDefined();

    fireEvent.change(screen.getByLabelText('Role for bag 1'), { target: { value: 'cultist-assassin' } });
    expect(dispatch).toHaveBeenCalledWith({ type: 'assignBagRole', number: 1, roleId: 'cultist-assassin' });
  });

  it('disables the parchment icon for an unassigned bag, and opens it for an assigned one', () => {
    const room: RoomState = {
      ...createRoom('r1', '2026-01-01T00:00:00.000Z'),
      bagContainerKeyword: 'sack',
      bags: [
        { number: 1, roleId: null },
        { number: 2, roleId: 'umbraseer' },
      ],
    };
    render(<BagSetupPanel room={room} dispatch={jest.fn()} />);

    expect((screen.getByLabelText('Parchment commands for bag 1') as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByLabelText('Parchment commands for bag 2'));
    const textarea = screen.getByLabelText('Role parchment commands') as HTMLTextAreaElement;
    expect(textarea.value.split('\n').at(-1)).toBe('put parch 2.sack');
  });

  it('dispatches setMasterBagKeyword from the master bag keyword input', () => {
    const dispatch = jest.fn<void, [RoomAction]>();
    render(<BagSetupPanel room={createRoom('r1', '2026-01-01T00:00:00.000Z')} dispatch={dispatch} />);

    fireEvent.change(screen.getByLabelText('Master bag keyword'), { target: { value: 'coffer' } });
    expect(dispatch).toHaveBeenCalledWith({ type: 'setMasterBagKeyword', keyword: 'coffer' });
  });

  it('dispatches setCommandDelayMs from the command delay input', () => {
    const dispatch = jest.fn<void, [RoomAction]>();
    render(<BagSetupPanel room={createRoom('r1', '2026-01-01T00:00:00.000Z')} dispatch={dispatch} />);

    fireEvent.change(screen.getByLabelText('Command delay in milliseconds'), { target: { value: '500' } });
    expect(dispatch).toHaveBeenCalledWith({ type: 'setCommandDelayMs', delayMs: 500 });
  });

  it("uses the room's configured command delay when generating the alias script", () => {
    const room: RoomState = {
      ...createRoom('r1', '2026-01-01T00:00:00.000Z'),
      bagContainerKeyword: 'sack',
      masterBagKeyword: 'chest',
      commandDelayMs: 1000,
      bags: [{ number: 1, roleId: 'umbraseer' }],
    };
    render(<BagSetupPanel room={room} dispatch={jest.fn()} />);

    fireEvent.click(screen.getByText('📜 Use as alias'));
    fireEvent.click(screen.getByRole('tab', { name: 'JavaScript' }));
    const textarea = screen.getByLabelText('JavaScript source') as HTMLTextAreaElement;
    expect(textarea.value).toContain('doAfter(1000, "world",');
    expect(textarea.value).not.toContain('doAfter(350, "world",');
  });

  it('disables the compiled-setup button until at least one bag is stuffed', () => {
    const room: RoomState = {
      ...createRoom('r1', '2026-01-01T00:00:00.000Z'),
      bags: [{ number: 1, roleId: null }],
    };
    render(<BagSetupPanel room={room} dispatch={jest.fn()} />);
    expect((screen.getByText('📜 Compiled setup commands') as HTMLButtonElement).disabled).toBe(true);
  });

  it('opens the compiled setup dialog with every stuffed bag plus the master-bag consolidation lines', () => {
    const room: RoomState = {
      ...createRoom('r1', '2026-01-01T00:00:00.000Z'),
      bagContainerKeyword: 'sack',
      masterBagKeyword: 'chest',
      bags: [
        { number: 1, roleId: 'umbraseer' },
        { number: 2, roleId: 'darkshield' },
      ],
    };
    render(<BagSetupPanel room={room} dispatch={jest.fn()} />);

    fireEvent.click(screen.getByText('📜 Compiled setup commands'));
    const textarea = screen.getByLabelText('Compiled setup commands') as HTMLTextAreaElement;
    const lines = textarea.value.split('\n');

    expect(lines).toContain('put 1.sack chest');
    expect(lines).toContain('put 2.sack chest');
    // Consolidation is highest-to-lowest (see bagPlan.test.ts), so bag 1 goes in last.
    expect(lines.at(-1)).toBe('put 1.sack chest');
    expect(screen.getByText('Full game setup — 2 bags into the master bag')).toBeDefined();
  });

  it('the userscript template is available even with no bags stuffed, and shows the worked example by default', () => {
    render(<BagSetupPanel room={createRoom('r1', '2026-01-01T00:00:00.000Z')} dispatch={jest.fn()} />);

    const templateButton = screen.getByText('📜 Userscript template') as HTMLButtonElement;
    expect(templateButton.disabled).toBe(false);

    fireEvent.click(templateButton);
    const textarea = screen.getByLabelText('Text source') as HTMLTextAreaElement;
    expect(textarea.value.split('\n')).toContain('put 1.sack chest');
    expect(textarea.value).toContain('Example Role A');
  });

  it('shows this room\'s real compiled setup on the template, not the placeholder example, once a bag is stuffed', () => {
    const room: RoomState = {
      ...createRoom('r1', '2026-01-01T00:00:00.000Z'),
      bagContainerKeyword: 'pouch',
      masterBagKeyword: 'coffer',
      bags: [{ number: 1, roleId: 'umbraseer' }],
    };
    render(<BagSetupPanel room={room} dispatch={jest.fn()} />);

    fireEvent.click(screen.getByText('📜 Userscript template'));
    const textarea = screen.getByLabelText('Text source') as HTMLTextAreaElement;
    expect(textarea.value).not.toContain('Example Role A');
    expect(textarea.value.split('\n')).toContain('put 1.pouch coffer');
  });

  it('disables the alias-script button until at least one bag is stuffed, and generates it from the compiled commands', () => {
    const empty: RoomState = { ...createRoom('r1', '2026-01-01T00:00:00.000Z'), bags: [{ number: 1, roleId: null }] };
    const { unmount } = render(<BagSetupPanel room={empty} dispatch={jest.fn()} />);
    expect((screen.getByText('📜 Use as alias') as HTMLButtonElement).disabled).toBe(true);
    unmount();

    const stuffed: RoomState = {
      ...createRoom('r1', '2026-01-01T00:00:00.000Z'),
      bagContainerKeyword: 'sack',
      masterBagKeyword: 'chest',
      bags: [{ number: 1, roleId: 'umbraseer' }],
    };
    render(<BagSetupPanel room={stuffed} dispatch={jest.fn()} />);
    fireEvent.click(screen.getByText('📜 Use as alias'));

    fireEvent.click(screen.getByRole('tab', { name: 'JavaScript' }));
    const textarea = screen.getByLabelText('JavaScript source') as HTMLTextAreaElement;
    expect(textarea.value).toContain('doAfter(0, "world", "dip quill ink");');
    expect(textarea.value).toContain('put parch 1.sack");');
    expect(textarea.value).toContain('chest');
  });
});
