import { act, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import PlayersTab from './PlayersTab';
import { DispatchEvent } from '../../features/event-emitter/event-dispatcher';
import { createActivityLog } from '../../features/simulacrumAdmin/activityLog';
import { COMMAND_CATALOG } from '../../features/simulacrumAdmin/commandCatalog';
import { createReplyCollector, type ReplyCollector } from '../../features/simulacrumAdmin/replyCollector';
import { createSender, type Sender } from '../../features/simulacrumAdmin/sender';
import { makeIndex } from '../../testing/worldIndexFixture';

let active: boolean;
let sent: string[];
let collector: ReplyCollector;
let sender: Sender;

beforeEach(() => {
  jest.useFakeTimers();
  active = true;
  sent = [];
  collector = createReplyCollector();
  sender = createSender({ isActive: () => active, collector, activity: createActivityLog(), dispatch: (cmd) => sent.push(cmd) });
});
afterEach(() => {
  collector.dispose();
  jest.useRealTimers();
});

const answer = async (text: string): Promise<void> => {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
    if (text) DispatchEvent('game:remote-server:raw', { type: 'raw', receivedTimestamp: 'x', payload: text });
    jest.advanceTimersByTime(text ? 600 : 4000);
  });
};
const flush = async (): Promise<void> => {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
};
const list = (): HTMLElement => screen.getByRole('listbox', { name: 'Player commands' });
const rows = (): HTMLElement[] => within(list()).queryAllByRole('option');
const row = (name: RegExp | string): HTMLElement => within(list()).getByRole('option', { name: typeof name === 'string' ? new RegExp(`^${name}`) : name });
const setTarget = (value: string): void => {
  fireEvent.change(screen.getByLabelText('Target'), { target: { value } });
};
const run = (): void => {
  fireEvent.click(screen.getByRole('button', { name: 'Run' }));
};
const preview = (): string => screen.getByLabelText('Line to send').textContent ?? '';

describe('PlayersTab: the command rows', () => {
  it('lists exactly the catalog forms that start with a player target, grouped (derived, not hand-listed)', () => {
    render(<PlayersTab sender={sender} />);
    const expected = COMMAND_CATALOG.flatMap((c) => c.syntax.forms.filter((f) => f.category !== undefined)).length;
    expect(rows()).toHaveLength(expected);
    for (const group of ['Inspect', 'Restrict', 'Punish', 'Restore', 'Move', 'Advanced']) {
      expect(within(list()).getByRole('group', { name: group })).toBeInTheDocument();
    }
    expect(within(within(list()).getByRole('group', { name: 'Inspect' })).getAllByRole('option').map((o) => o.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining('stat'), expect.stringContaining('snoop')]),
    );
    expect(within(within(list()).getByRole('group', { name: 'Restrict' })).getAllByRole('option')).toHaveLength(5);
  });

  it('names the form when a command has several, and marks the commands that ask first', () => {
    render(<PlayersTab sender={sender} />);
    expect(row('set')).toHaveTextContent('asks first');
    expect(row('flag: Flags on a mobile')).toBeInTheDocument();
    expect(row('freeze')).toHaveTextContent('asks first');
    expect(row('stat')).not.toHaveTextContent('asks first');
  });

  it('asks for a target before anything else', () => {
    render(<PlayersTab sender={sender} />);
    expect(screen.getByText('Type a target, then pick what to do to them.')).toBeInTheDocument();
  });
});

describe('PlayersTab: the target', () => {
  it('is validated like a character field: a space or a control character is refused', () => {
    render(<PlayersTab sender={sender} />);
    fireEvent.click(row('stat'));
    setTarget('Test char');
    expect(screen.getByRole('alert')).toHaveTextContent('One word only, no spaces.');
    expect(screen.getByLabelText('Target')).toHaveAttribute('aria-invalid', 'true');
    setTarget('Testchar');
    expect(screen.getByRole('alert')).toHaveTextContent('Control characters are not allowed.');
    setTarget('Testchar');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(preview()).toBe('stat Testchar');
  });

  it('is required, reported after the first Run and nothing is sent', async () => {
    render(<PlayersTab sender={sender} />);
    fireEvent.click(row('stat'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(preview()).toBe('…');
    run();
    await flush();
    expect(screen.getByRole('alert')).toHaveTextContent('Character is required.');
    expect(screen.getByText(/Not sent: Character is required\./)).toBeInTheDocument();
    expect(sent).toEqual([]);
  });

  it('fills the line of the selected command from the target', () => {
    render(<PlayersTab sender={sender} />);
    setTarget('Testchar');
    fireEvent.click(row('stat'));
    expect(preview()).toBe('stat Testchar');
    fireEvent.click(row('noshout'));
    expect(preview()).toBe('noshout Testchar');
    setTarget('Other');
    expect(preview()).toBe('noshout Other');
  });
});

describe('PlayersTab: running (E21)', () => {
  it('runs stat with the target filled in and shows the game’s reply as done', async () => {
    render(<PlayersTab sender={sender} />);
    setTarget('Testchar');
    fireEvent.click(row('stat'));
    run();
    await flush();
    expect(sent).toEqual(['stat Testchar']);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await answer('Name: Testchar\n\rLevel: 5\n\r');
    expect(screen.getByText('Done: the game answered as expected')).toBeInTheDocument();
    expect(screen.getByText(/Level: 5/)).toBeInTheDocument();
  });

  it.each(['freeze', 'deny'])('%s asks for confirmation and sends nothing until it is given', async (name) => {
    render(<PlayersTab sender={sender} />);
    setTarget('Testchar');
    fireEvent.click(row(name));
    run();
    await flush();
    const dialog = screen.getByRole('alertdialog', { name: 'Confirm command' });
    expect(dialog).toHaveTextContent(`${name} Testchar`);
    expect(sent).toEqual([]);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send it' }));
    await flush();
    expect(sent).toEqual([`${name} Testchar`]);
  });

  it('cancelling the question sends nothing', async () => {
    render(<PlayersTab sender={sender} />);
    setTarget('Testchar');
    fireEvent.click(row('freeze'));
    run();
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await flush();
    expect(sent).toEqual([]);
    expect(screen.getByText('Cancelled: nothing was sent.')).toBeInTheDocument();
  });

  it('asks before a transfer to everyone, however the target was typed', async () => {
    render(<PlayersTab sender={sender} />);
    setTarget(' ALL ');
    fireEvent.click(row('transfer'));
    fireEvent.change(screen.getByLabelText(/^Destination/), { target: { value: '3001' } });
    run();
    await flush();
    expect(screen.getByRole('alertdialog')).toHaveTextContent('every player on the server');
    expect(sent).toEqual([]);
  });

  it('moves one player to a typed destination without asking', async () => {
    render(<PlayersTab sender={sender} />);
    setTarget('Testchar');
    fireEvent.click(row('transfer'));
    fireEvent.change(screen.getByLabelText(/^Destination/), { target: { value: '3001' } });
    expect(preview()).toBe('transfer Testchar 3001');
    run();
    await flush();
    expect(sent).toEqual(['transfer Testchar 3001']);
    await answer('Ok.\n\r');
    expect(screen.getByText('Done: the game answered as expected')).toBeInTheDocument();
  });

  it('shows only the remaining fields of a command, and its error once Run was pressed', async () => {
    render(<PlayersTab sender={sender} />);
    setTarget('Testchar');
    fireEvent.click(row('qpoints'));
    expect(screen.queryByLabelText('Character')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Mode')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Mode'), { target: { value: 'add' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: 'lots' } });
    expect(screen.getByRole('alert')).toHaveTextContent('A whole number.');
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '5' } });
    expect(preview()).toBe('qpoints Testchar add 5');
  });

  it('keeps each command’s typed values when switching between commands', () => {
    render(<PlayersTab sender={sender} />);
    setTarget('Testchar');
    fireEvent.click(row('pardon'));
    fireEvent.change(screen.getByLabelText('Flag'), { target: { value: 'thief' } });
    fireEvent.click(row('stat'));
    fireEvent.click(row('pardon'));
    expect(preview()).toBe('pardon Testchar thief');
  });

  it('shows the game’s refusal as refused', async () => {
    render(<PlayersTab sender={sender} />);
    setTarget('Nobody');
    fireEvent.click(row('stat'));
    run();
    await flush();
    await answer("They aren't here.\n\r");
    expect(screen.getByText(/Refused by the game \(They aren't here\.\)/)).toBeInTheDocument();
    expect(screen.queryByText(/Done:/)).not.toBeInTheDocument();
  });

  it('does not carry the previous reply to another target or another command', async () => {
    render(<PlayersTab sender={sender} />);
    setTarget('Testchar');
    fireEvent.click(row('stat'));
    run();
    await flush();
    await answer('Name: Testchar\n\r');
    expect(screen.getByText('Done: the game answered as expected')).toBeInTheDocument();
    setTarget('Other');
    expect(screen.queryByText('Done: the game answered as expected')).not.toBeInTheDocument();
    setTarget('Testchar');
    expect(screen.getByText('Done: the game answered as expected')).toBeInTheDocument();
    fireEvent.click(row('snoop'));
    expect(screen.queryByText('Done: the game answered as expected')).not.toBeInTheDocument();
  });

  it('says nothing was sent when the connection is gone', async () => {
    active = false;
    render(<PlayersTab sender={sender} />);
    setTarget('Testchar');
    fireEvent.click(row('stat'));
    run();
    await flush();
    expect(screen.getByText('Not connected to the simulacrum: nothing was sent.')).toBeInTheDocument();
    expect(sent).toEqual([]);
  });

  it('answers an open question "no" when the tab is removed', async () => {
    const { unmount } = render(<PlayersTab sender={sender} />);
    setTarget('Testchar');
    fireEvent.click(row('freeze'));
    run();
    await flush();
    unmount();
    await flush();
    expect(sent).toEqual([]);
  });
});

describe('PlayersTab: recent targets (memory only)', () => {
  const sendTo = async (name: string): Promise<void> => {
    setTarget(name);
    run();
    await flush();
    await answer('Name: x\n\r');
  };

  it('offers the targets that were used, newest first and without duplicates, and a click fills the target', async () => {
    render(<PlayersTab sender={sender} />);
    expect(screen.queryByRole('group', { name: 'Recent targets' })).not.toBeInTheDocument();
    fireEvent.click(row('stat'));
    await sendTo('Alpha');
    await sendTo('Bravo');
    await sendTo('Alpha');
    const recent = within(screen.getByRole('group', { name: 'Recent targets' })).getAllByRole('button');
    expect(recent.map((b) => b.textContent)).toEqual(['Alpha', 'Bravo']);
    expect(recent[0]).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(recent[1]);
    expect(screen.getByLabelText('Target')).toHaveValue('Bravo');
    expect(preview()).toBe('stat Bravo');
  });

  it('keeps no more than eight', async () => {
    render(<PlayersTab sender={sender} />);
    fireEvent.click(row('stat'));
    for (let i = 1; i <= 10; i++) await sendTo(`Name${String.fromCharCode(96 + i)}`);
    const recent = within(screen.getByRole('group', { name: 'Recent targets' })).getAllByRole('button');
    expect(recent).toHaveLength(8);
    expect(recent[0]).toHaveTextContent('Namej');
  });

  it('does not add a target for a send that did not happen', async () => {
    render(<PlayersTab sender={sender} />);
    fireEvent.click(row('freeze'));
    setTarget('Testchar');
    run();
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await flush();
    expect(screen.queryByRole('group', { name: 'Recent targets' })).not.toBeInTheDocument();
  });

  it('writes nothing to browser storage', async () => {
    const setItem = jest.spyOn(Storage.prototype, 'setItem');
    render(<PlayersTab sender={sender} />);
    fireEvent.click(row('stat'));
    await sendTo('Alpha');
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});

describe('PlayersTab: hidden', () => {
  it('draws nothing while another tab shows, and keeps the target and selection', () => {
    const { rerender, container } = render(<PlayersTab sender={sender} visible />);
    setTarget('Testchar');
    fireEvent.click(row('stat'));
    rerender(<PlayersTab sender={sender} visible={false} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<PlayersTab sender={sender} visible />);
    expect(screen.getByLabelText('Target')).toHaveValue('Testchar');
    expect(preview()).toBe('stat Testchar');
  });
});

describe('PlayersTab: the destination of transfer comes from the world picker', () => {
  const openPicker = (): void => {
    fireEvent.click(screen.getByRole('button', { name: 'Pick from the world…' }));
  };
  const pickGreatHall = (): void => {
    fireEvent.click(within(screen.getByRole('list', { name: 'Areas' })).getByRole('button', { name: /Alpha Keep/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Pick room 3001 The Great Hall' }));
  };

  it('offers the picker only where there is a destination, and only when the world index is given', () => {
    const { unmount } = render(<PlayersTab sender={sender} world={makeIndex()} />);
    setTarget('Testchar');
    fireEvent.click(row('stat'));
    expect(screen.queryByRole('button', { name: 'Pick from the world…' })).not.toBeInTheDocument();
    fireEvent.click(row('transfer'));
    expect(screen.getByRole('button', { name: 'Pick from the world…' })).toBeInTheDocument();
    unmount();

    render(<PlayersTab sender={sender} />);
    setTarget('Testchar');
    fireEvent.click(row('transfer'));
    expect(screen.queryByRole('button', { name: 'Pick from the world…' })).not.toBeInTheDocument();
  });

  it('tells the window the world is needed when the picker is first opened, and shows the picker', () => {
    const onWorldNeeded = jest.fn();
    render(<PlayersTab sender={sender} world={makeIndex()} onWorldNeeded={onWorldNeeded} />);
    setTarget('Testchar');
    fireEvent.click(row('transfer'));
    expect(onWorldNeeded).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Filter areas')).not.toBeInTheDocument();
    openPicker();
    expect(onWorldNeeded).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Filter areas')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close the room picker' }));
    expect(screen.queryByLabelText('Filter areas')).not.toBeInTheDocument();
  });

  it('works without an onWorldNeeded callback', () => {
    render(<PlayersTab sender={sender} world={makeIndex()} />);
    setTarget('Testchar');
    fireEvent.click(row('transfer'));
    openPicker();
    expect(screen.getByLabelText('Filter areas')).toBeInTheDocument();
  });

  it('fills the destination with the picked vnum, names the room, closes the picker, and sends that vnum', async () => {
    render(<PlayersTab sender={sender} world={makeIndex()} />);
    setTarget('Testchar');
    fireEvent.click(row('transfer'));
    openPicker();
    pickGreatHall();
    expect(screen.queryByLabelText('Filter areas')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Destination/)).toHaveValue('3001');
    expect(screen.getByText('Destination: 3001 The Great Hall (Alpha Keep)')).toBeInTheDocument();
    expect(preview()).toBe('transfer Testchar 3001');
    run();
    await flush();
    expect(sent).toEqual(['transfer Testchar 3001']);
  });

  it('forgets the picked room’s name once the destination is typed by hand, and uses the file when an area has no name', () => {
    const index = makeIndex({
      areas: { status: 'ready', data: [{ file: 'plain.are', rooms: 1 }], at: 1 },
      rooms: { 'plain.are': { status: 'ready', data: [{ vnum: 10, name: 'Only Room' }], at: 1 } },
    });
    render(<PlayersTab sender={sender} world={index} />);
    setTarget('Testchar');
    fireEvent.click(row('transfer'));
    openPicker();
    fireEvent.click(within(screen.getByRole('list', { name: 'Areas' })).getByRole('button', { name: /plain\.are/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Pick room 10 Only Room' }));
    expect(screen.getByText('Destination: 10 Only Room (plain.are)')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Destination/), { target: { value: '3001' } });
    expect(screen.queryByText(/^Destination: /)).not.toBeInTheDocument();
    expect(preview()).toBe('transfer Testchar 3001');
  });

  it('transfer all still asks, whatever the picked destination', async () => {
    render(<PlayersTab sender={sender} world={makeIndex()} />);
    setTarget('all');
    fireEvent.click(row('transfer'));
    openPicker();
    pickGreatHall();
    run();
    await flush();
    expect(screen.getByRole('alertdialog')).toHaveTextContent('every player on the server');
    expect(sent).toEqual([]);
  });
});

describe('PlayersTab: a target shared with the window', () => {
  it('shows the shared target and reports each change instead of keeping its own', () => {
    const onTargetChange = jest.fn();
    const { rerender } = render(<PlayersTab sender={sender} target="Sharedchar" onTargetChange={onTargetChange} />);
    expect(screen.getByLabelText('Target')).toHaveValue('Sharedchar');
    fireEvent.click(row('stat'));
    expect(preview()).toBe('stat Sharedchar');
    setTarget('Another');
    expect(onTargetChange).toHaveBeenCalledWith('Another');
    expect(screen.getByLabelText('Target')).toHaveValue('Sharedchar'); // controlled: the window decides
    rerender(<PlayersTab sender={sender} target="Another" onTargetChange={onTargetChange} />);
    expect(preview()).toBe('stat Another');
  });
});
