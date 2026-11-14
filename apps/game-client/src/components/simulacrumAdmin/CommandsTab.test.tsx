import { act, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import CommandsTab from './CommandsTab';
import { DispatchEvent } from '../../features/event-emitter/event-dispatcher';
import { createActivityLog } from '../../features/simulacrumAdmin/activityLog';
import { COMMAND_CATALOG, GROUP_ORDER } from '../../features/simulacrumAdmin/commandCatalog';
import { createReplyCollector, type ReplyCollector } from '../../features/simulacrumAdmin/replyCollector';
import { createSender, type Sender } from '../../features/simulacrumAdmin/sender';

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

/** The game answers, then goes quiet. */
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
const commandList = (): HTMLElement => screen.getByRole('listbox', { name: 'Commands' });
const options = (): HTMLElement[] => within(commandList()).queryAllByRole('option');
const option = (name: string): HTMLElement => within(commandList()).getByRole('option', { name: new RegExp(`^${name}\\b`) });
const pick = (name: string): void => {
  fireEvent.click(option(name));
};
const type = (label: RegExp | string, value: string): void => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
};
const run = (): void => {
  fireEvent.click(screen.getByRole('button', { name: 'Run' }));
};
const preview = (): string => screen.getByLabelText('Line to send').textContent ?? '';

describe('CommandsTab: the list', () => {
  it('shows every catalog command under its group', () => {
    render(<CommandsTab sender={sender} />);
    expect(options()).toHaveLength(COMMAND_CATALOG.length);
    for (const group of GROUP_ORDER) {
      const inGroup = COMMAND_CATALOG.filter((c) => c.syntax.group === group);
      const region = screen.getByRole('group', { name: new RegExp(`^${group === 'settings' ? 'My settings' : group}$`, 'i') });
      expect(within(region).getAllByRole('option')).toHaveLength(inGroup.length);
    }
  });

  it('marks the commands that ask first and shows each level', () => {
    render(<CommandsTab sender={sender} />);
    expect(option('freeze')).toHaveTextContent('asks first');
    expect(option('freeze')).toHaveTextContent('L56');
    expect(option('stat')).not.toHaveTextContent('asks first');
    expect(option('stat')).toHaveTextContent('L52');
  });

  it('narrows by name, by alias and by words in the summary, and says so when nothing matches', () => {
    render(<CommandsTab sender={sender} />);
    fireEvent.change(screen.getByLabelText('Filter commands'), { target: { value: 'fre' } });
    expect(options().map((o) => o.textContent)).toEqual([expect.stringContaining('freeze')]);
    fireEvent.change(screen.getByLabelText('Filter commands'), { target: { value: 'teleport' } });
    expect(option('transfer')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Filter commands'), { target: { value: 'quest points' } });
    expect(option('qpoints')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Filter commands'), { target: { value: 'zzzz' } });
    expect(options()).toHaveLength(0);
    expect(screen.getByText('No command matches.')).toBeInTheDocument();
  });

  it('narrows by level', () => {
    render(<CommandsTab sender={sender} />);
    fireEvent.change(screen.getByLabelText('Filter by level'), { target: { value: '52' } });
    const shown = options();
    expect(shown.length).toBe(COMMAND_CATALOG.filter((c) => c.level <= 52).length);
    for (const o of shown) expect(o).toHaveTextContent('L52');
    fireEvent.change(screen.getByLabelText('Filter by level'), { target: { value: '' } });
    expect(options()).toHaveLength(COMMAND_CATALOG.length);
  });
});

describe('CommandsTab: the form', () => {
  it('asks to pick a command first', () => {
    render(<CommandsTab sender={sender} />);
    expect(screen.getByText(/Pick a command/)).toBeInTheDocument();
  });

  it('shows the summary, level and aliases of the selected command', () => {
    render(<CommandsTab sender={sender} />);
    pick('transfer');
    const form = screen.getByLabelText('Command form');
    expect(form).toHaveTextContent('Level 55');
    expect(form).toHaveTextContent('also teleport');
    expect(form).toHaveTextContent('Moves a player to a room');
  });

  it('offers each form of a command as a radio and shows that form’s fields', () => {
    render(<CommandsTab sender={sender} />);
    pick('load');
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.parentElement?.textContent)).toEqual(['Load a mobile', 'Load an object']);
    expect(screen.queryByLabelText(/^Level/)).not.toBeInTheDocument();
    fireEvent.click(radios[1]);
    expect(screen.getByLabelText(/^Level/)).toBeInTheDocument();
    expect(screen.getByLabelText('Object vnum')).toBeInTheDocument();
  });

  it('updates the line to send as the fields change, and keeps typed values when switching command and back', () => {
    render(<CommandsTab sender={sender} />);
    pick('transfer');
    expect(preview()).toBe('…');
    type('Character or all', 'Testchar');
    expect(preview()).toBe('transfer Testchar');
    type(/Destination/, '3001');
    expect(preview()).toBe('transfer Testchar 3001');
    pick('stat');
    expect(preview()).toBe('…');
    pick('transfer');
    expect(preview()).toBe('transfer Testchar 3001');
  });

  it('shows a choice field as a select and builds from it', () => {
    render(<CommandsTab sender={sender} />);
    pick('pardon');
    type('Character', 'Testchar');
    const flag = screen.getByLabelText('Flag');
    expect(within(flag).getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose…', 'killer', 'thief']);
    fireEvent.change(flag, { target: { value: 'thief' } });
    expect(preview()).toBe('pardon Testchar thief');
  });

  it('marks an optional choice as none', () => {
    render(<CommandsTab sender={sender} />);
    pick('gmcp');
    expect(screen.getByLabelText(/^Mode/)).toHaveDisplayValue('(none)');
    expect(preview()).toBe('gmcp');
  });

  it('shows the field error for a bad value as soon as something is typed, and keeps the preview unbuilt', () => {
    render(<CommandsTab sender={sender} />);
    pick('advance');
    type('Character', 'Testchar');
    type(/^Level$/, 'ten');
    expect(screen.getByRole('alert')).toHaveTextContent('A whole number.');
    expect(screen.getByLabelText(/^Level$/)).toHaveAttribute('aria-invalid', 'true');
    expect(preview()).toBe('…');
    type(/^Level$/, '10');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(preview()).toBe('advance Testchar 10');
  });

  it('does not nag about a required field before the first Run, then does', async () => {
    render(<CommandsTab sender={sender} />);
    pick('stat');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    run();
    await flush();
    expect(screen.getByRole('alert')).toHaveTextContent('Character is required.');
    expect(screen.getByText(/Not sent: Character is required\./)).toBeInTheDocument();
    expect(sent).toEqual([]);
  });
});

describe('CommandsTab: running (ADMIN-03, E21)', () => {
  it('runs a non-destructive command at once, sends the exact line and shows the game’s reply as done', async () => {
    render(<CommandsTab sender={sender} />);
    pick('stat');
    type('Character', 'Testchar');
    run();
    await flush();
    expect(sent).toEqual(['stat Testchar']);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Waiting for the game…' })).toBeDisabled();
    await answer('Name: Testchar\n\rLevel: 5\n\r');
    expect(screen.getByText('Done: the game answered as expected')).toBeInTheDocument();
    expect(screen.getByText(/Level: 5/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run' })).toBeEnabled();
  });

  it('asks first for a destructive command, naming what is at stake, and sends nothing until confirmed', async () => {
    render(<CommandsTab sender={sender} />);
    pick('freeze');
    type('Character', 'Testchar');
    run();
    await flush();
    const dialog = screen.getByRole('alertdialog', { name: 'Confirm command' });
    expect(dialog).toHaveTextContent('cannot be undone from this panel');
    expect(dialog).toHaveTextContent('freeze Testchar');
    expect(sent).toEqual([]);
    expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send it' }));
    await flush();
    expect(sent).toEqual(['freeze Testchar']);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await answer('FREEZE set.\n\r');
    expect(screen.getByText('Done: the game answered as expected')).toBeInTheDocument();
  });

  it('puts the keyboard focus on the confirmation so Enter confirms', async () => {
    render(<CommandsTab sender={sender} />);
    pick('freeze');
    type('Character', 'Testchar');
    run();
    await flush();
    expect(screen.getByRole('button', { name: 'Send it' })).toHaveFocus();
  });

  it('cancelling sends nothing and says so', async () => {
    render(<CommandsTab sender={sender} />);
    pick('freeze');
    type('Character', 'Testchar');
    run();
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await flush();
    expect(sent).toEqual([]);
    expect(screen.getByText('Cancelled: nothing was sent.')).toBeInTheDocument();
  });

  it('Escape in the confirmation cancels it and does not reach the window', async () => {
    const outer = jest.fn();
    render(
      <div onKeyDown={outer}>
        <CommandsTab sender={sender} />
      </div>,
    );
    pick('freeze');
    type('Character', 'Testchar');
    run();
    await flush();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Send it' }), { key: 'Escape' });
    await flush();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(sent).toEqual([]);
    expect(outer).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByLabelText('Filter commands'), { key: 'Escape' });
    expect(outer).toHaveBeenCalledTimes(1);
  });

  it('ignores other keys in the confirmation', async () => {
    render(<CommandsTab sender={sender} />);
    pick('freeze');
    type('Character', 'Testchar');
    run();
    await flush();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Send it' }), { key: 'a' });
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('asks for transfer all typed into the field, naming every player', async () => {
    render(<CommandsTab sender={sender} />);
    pick('transfer');
    type('Character or all', 'ALL');
    type(/Destination/, '3001');
    run();
    await flush();
    expect(screen.getByRole('alertdialog')).toHaveTextContent('every player on the server');
    expect(sent).toEqual([]);
  });

  it('shows the game’s refusal as refused with its words, never as done', async () => {
    render(<CommandsTab sender={sender} />);
    pick('goto');
    type(/^Room/, '99999');
    run();
    await flush();
    await answer('No such location.\n\r');
    expect(screen.getByText('Refused by the game (No such location.)')).toBeInTheDocument();
    expect(screen.queryByText(/Done:/)).not.toBeInTheDocument();
  });

  it('shows Huh? as refused', async () => {
    render(<CommandsTab sender={sender} />);
    pick('stat');
    type('Character', 'Testchar');
    run();
    await flush();
    await answer('Huh?\n\r');
    expect(screen.getByText('Refused by the game (Huh?)')).toBeInTheDocument();
  });

  it('shows silence as unknown, with a note that no text came', async () => {
    render(<CommandsTab sender={sender} />);
    pick('holylight');
    run();
    await flush();
    await answer('');
    expect(screen.getByText('No recognised answer from the game (unknown)')).toBeInTheDocument();
    expect(screen.getByText('The game sent no text.')).toBeInTheDocument();
  });

  it('shows an unrecognised reply as unknown and still prints it', async () => {
    render(<CommandsTab sender={sender} />);
    pick('holylight');
    run();
    await flush();
    await answer('Something strange happened.\n\r');
    expect(screen.getByText('No recognised answer from the game (unknown)')).toBeInTheDocument();
    expect(screen.getByText('Something strange happened.')).toBeInTheDocument();
  });

  it('refused with no reason line still reads as refused', async () => {
    render(<CommandsTab sender={sender} />);
    pick('stat');
    type('Character', 'Testchar');
    run();
    await flush();
    await answer("They aren't here.\n\r");
    expect(screen.getByText(/Refused by the game \(They aren't here\.\)/)).toBeInTheDocument();
  });

  it('says nothing was sent when the connection is gone', async () => {
    active = false;
    render(<CommandsTab sender={sender} />);
    pick('stat');
    type('Character', 'Testchar');
    run();
    await flush();
    expect(screen.getByText('Not connected to the simulacrum: nothing was sent.')).toBeInTheDocument();
    expect(sent).toEqual([]);
  });

  it('shows the result only beside the form it belongs to', async () => {
    render(<CommandsTab sender={sender} />);
    pick('stat');
    type('Character', 'Testchar');
    run();
    await flush();
    await answer('Name: Testchar\n\r');
    expect(screen.getByText('Done: the game answered as expected')).toBeInTheDocument();
    pick('transfer');
    expect(screen.queryByText('Done: the game answered as expected')).not.toBeInTheDocument();
    pick('stat');
    expect(screen.getByText('Done: the game answered as expected')).toBeInTheDocument();
  });

  it('answers an open question "no" when the tab is removed, so nothing is sent behind a closed window', async () => {
    const { unmount } = render(<CommandsTab sender={sender} />);
    pick('freeze');
    type('Character', 'Testchar');
    run();
    await flush();
    unmount();
    await flush();
    expect(sent).toEqual([]);
  });
});

describe('CommandsTab: a refusal that carries no line', () => {
  it('still reads as refused', async () => {
    const stub: Sender = {
      ...sender,
      run: jest.fn(async () => ({
        status: 'sent' as const,
        entry: { id: 1, at: 'x', line: 'stat Testchar', verdict: 'refused' as const, replyLines: [], rawReply: '' },
      })),
    };
    render(<CommandsTab sender={stub} />);
    pick('stat');
    type('Character', 'Testchar');
    run();
    await flush();
    expect(screen.getByText('Refused by the game')).toBeInTheDocument();
  });
});

describe('CommandsTab: what this character can run (S5)', () => {
  const refresh = (): void => {
    fireEvent.click(screen.getByRole('button', { name: 'Refresh available commands' }));
  };

  it('dims what wizhelp does not list and keeps it selectable, with a note', async () => {
    render(<CommandsTab sender={sender} />);
    refresh();
    await answer('stat        wizhelp     goto        \n\r');
    expect(screen.getByText('3 commands are available to this character; the others are dimmed.')).toBeInTheDocument();
    expect(option('stat')).toHaveAttribute('data-dimmed', 'false');
    expect(option('freeze')).toHaveAttribute('data-dimmed', 'true');
    pick('freeze');
    expect(screen.getByText(/does not list this command/)).toBeInTheDocument();
    expect(screen.getByLabelText('Character')).toBeEnabled();
    pick('stat');
    expect(screen.queryByText(/does not list this command/)).not.toBeInTheDocument();
  });

  it('counts an alias as available', async () => {
    render(<CommandsTab sender={sender} />);
    refresh();
    await answer('teleport    \n\r');
    expect(option('transfer')).toHaveAttribute('data-dimmed', 'false');
  });

  it('dims everything when the game answers Huh?', async () => {
    render(<CommandsTab sender={sender} />);
    refresh();
    await answer('Huh?\n\r');
    expect(screen.getByText('The game answered Huh?: this character can run none of these commands.')).toBeInTheDocument();
    expect(option('stat')).toHaveAttribute('data-dimmed', 'true');
  });

  it('changes nothing when the game does not answer', async () => {
    render(<CommandsTab sender={sender} />);
    refresh();
    await flush();
    expect(screen.getByRole('button', { name: 'Asking…' })).toBeDisabled();
    await answer('');
    expect(screen.getByText('The game did not answer: the list was not changed.')).toBeInTheDocument();
    expect(option('stat')).toHaveAttribute('data-dimmed', 'false');
  });

  it('dims nothing before any answer', () => {
    render(<CommandsTab sender={sender} />);
    for (const o of options()) expect(o).toHaveAttribute('data-dimmed', 'false');
  });
});

describe('CommandsTab: hidden', () => {
  it('draws nothing while another tab shows, and keeps the selection and typed values', () => {
    const { rerender, container } = render(<CommandsTab sender={sender} visible />);
    pick('stat');
    type('Character', 'Testchar');
    rerender(<CommandsTab sender={sender} visible={false} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<CommandsTab sender={sender} visible />);
    expect(preview()).toBe('stat Testchar');
  });
});
