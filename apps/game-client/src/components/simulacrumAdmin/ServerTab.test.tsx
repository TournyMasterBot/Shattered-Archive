import { act, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import ServerTab from './ServerTab';
import { DispatchEvent } from '../../features/event-emitter/event-dispatcher';
import { createActivityLog } from '../../features/simulacrumAdmin/activityLog';
import { commandsInGroup } from '../../features/simulacrumAdmin/commandCatalog';
import { createReplyCollector, type ReplyCollector } from '../../features/simulacrumAdmin/replyCollector';
import { createSender, type Sender } from '../../features/simulacrumAdmin/sender';
import { makeIndex } from '../../testing/worldIndexFixture';

let sent: string[];
let collector: ReplyCollector;
let sender: Sender;

beforeEach(() => {
  jest.useFakeTimers();
  sent = [];
  collector = createReplyCollector();
  sender = createSender({ isActive: () => true, collector, activity: createActivityLog(), dispatch: (cmd) => sent.push(cmd) });
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
const labels = (): string[] => screen.getAllByRole('region').map((r) => r.getAttribute('aria-label') ?? '');
const card = (name: string): HTMLElement => screen.getByRole('region', { name });
const open = (name: string): HTMLElement => {
  fireEvent.click(within(card(name)).getByRole('button', { name: new RegExp(`^${name}`) }));
  return card(name);
};
const run = (name: string): void => {
  fireEvent.click(within(card(name)).getByRole('button', { name: 'Run' }));
};
const preview = (name: string): string => within(card(name)).getByLabelText(`Line to send: ${name}`).textContent ?? '';
const tab = (props: Partial<React.ComponentProps<typeof ServerTab>> = {}) => (
  <ServerTab sender={sender} world={makeIndex()} onWorldNeeded={jest.fn()} {...props} />
);

describe('ServerTab: the cards come from the catalog', () => {
  it('has a card for every command of the server group and of the settings group, nothing hand-listed', () => {
    render(tab());
    const names = labels();
    const expected = [...commandsInGroup('server'), ...commandsInGroup('settings')].map((c) => c.name);
    expect([...names].sort()).toEqual([...expected].sort());
    expect(names).toEqual(expect.arrayContaining(['areload', 'copyover', 'reboot', 'shutdown', 'wizlock', 'newlock', 'ban', 'holylight', 'wiznet']));
  });

  it('puts the commands people reach for first, then the rest by name', () => {
    render(tab());
    const server = labels();
    expect(server.slice(0, 6)).toEqual(['areload', 'copyover', 'reboot', 'shutdown', 'wizlock', 'newlock']);
    const rest = server.slice(6, commandsInGroup('server').length);
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b)));
  });

  it('has a heading for each section and states what each card shows when opened: level, summary and asks-first', () => {
    render(tab());
    expect(screen.getByRole('heading', { name: 'Server' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'My immortal settings' })).toBeInTheDocument();
    const header = within(card('copyover')).getByRole('button');
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(header).toHaveTextContent('asks first');
    expect(header).toHaveTextContent('L59');
    expect(within(card('copyover')).queryByText(/Reboots the world/)).not.toBeInTheDocument();
    open('copyover');
    expect(header).toHaveAttribute('aria-expanded', 'true');
    expect(within(card('copyover')).getByText(/Reboots the world from disk/)).toBeInTheDocument();
    fireEvent.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(within(card('holylight')).getByRole('button')).not.toHaveTextContent('asks first');
  });
});

describe('ServerTab: copyover (E25)', () => {
  it('sends nothing before the confirmation and exactly "copyover confirm" after it', async () => {
    render(tab());
    open('copyover');
    fireEvent.click(within(card('copyover')).getByRole('radio', { name: 'Copyover now' }));
    expect(preview('copyover')).toBe('copyover confirm');
    run('copyover');
    await flush();
    const dialog = within(card('copyover')).getByRole('alertdialog', { name: 'Confirm command' });
    expect(dialog).toHaveTextContent('Every connected player sees a pause');
    expect(sent).toEqual([]);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send it' }));
    await flush();
    expect(sent).toEqual(['copyover confirm']);
    await answer('Copyover.\n\r');
    expect(within(card('copyover')).getByText('No recognised answer from the game (unknown)')).toBeInTheDocument();
  });

  it('cancelling sends nothing; the explanation form sends the bare word and never asks', async () => {
    render(tab());
    open('copyover');
    fireEvent.click(within(card('copyover')).getByRole('radio', { name: 'Copyover now' }));
    run('copyover');
    await flush();
    fireEvent.click(within(card('copyover')).getByRole('button', { name: 'Cancel' }));
    await flush();
    expect(sent).toEqual([]);
    expect(within(card('copyover')).getByText('Cancelled: nothing was sent.')).toBeInTheDocument();

    fireEvent.click(within(card('copyover')).getByRole('radio', { name: 'What copyover does' }));
    expect(preview('copyover')).toBe('copyover');
    run('copyover');
    await flush();
    expect(within(card('copyover')).queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(sent).toEqual(['copyover']);
    await answer("Players will see a brief pause. Type 'copyover confirm' to proceed.\n\r");
    expect(within(card('copyover')).getByText('Done: the game answered as expected')).toBeInTheDocument();
  });
});

describe('ServerTab: reboot, shutdown and the toggles', () => {
  it.each(['reboot', 'shutdown'])('%s is always the full word, asks first, and says what is at stake', async (name) => {
    render(tab());
    open(name);
    expect(preview(name)).toBe(name);
    run(name);
    await flush();
    expect(within(card(name)).getByRole('alertdialog')).toHaveTextContent('everyone is disconnected');
    expect(sent).toEqual([]);
    fireEvent.click(within(card(name)).getByRole('button', { name: 'Send it' }));
    await flush();
    expect(sent).toEqual([name]);
    expect(sent.join(' ')).not.toMatch(/reboo\b|shutdow\b/);
  });

  it('wizlock asks first and shows the game’s answer', async () => {
    render(tab());
    open('wizlock');
    run('wizlock');
    await flush();
    fireEvent.click(within(card('wizlock')).getByRole('button', { name: 'Send it' }));
    await flush();
    await answer('Game wizlocked.\n\r');
    expect(sent).toEqual(['wizlock']);
    expect(within(card('wizlock')).getByText('Done: the game answered as expected')).toBeInTheDocument();
  });

  it('shows a refusal as refused, never as done', async () => {
    render(tab());
    open('wizlock');
    run('wizlock');
    await flush();
    fireEvent.click(within(card('wizlock')).getByRole('button', { name: 'Send it' }));
    await flush();
    await answer('Huh?\n\r');
    expect(within(card('wizlock')).getByText('Refused by the game (Huh?)')).toBeInTheDocument();
    expect(within(card('wizlock')).queryByText(/Done:/)).not.toBeInTheDocument();
  });

  it('a setting that is not destructive runs at once', async () => {
    render(tab());
    open('holylight');
    run('holylight');
    await flush();
    expect(within(card('holylight')).queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(sent).toEqual(['holylight']);
    await answer('Holy light mode on.\n\r');
    expect(within(card('holylight')).getByText('Done: the game answered as expected')).toBeInTheDocument();
  });
});

describe('ServerTab: ban (E4)', () => {
  it('refuses an empty site in words after Run, and sends nothing', async () => {
    render(tab());
    open('ban');
    fireEvent.click(within(card('ban')).getByRole('radio', { name: 'Ban a site' }));
    expect(within(card('ban')).queryByRole('alert')).not.toBeInTheDocument();
    run('ban');
    await flush();
    expect(within(card('ban')).getByRole('alert')).toHaveTextContent('Site is required.');
    expect(within(card('ban')).getByText(/Not sent: Site is required\./)).toBeInTheDocument();
    expect(sent).toEqual([]);
  });

  it('asks first, naming the wildcard, for a site with a *; the listing form never asks', async () => {
    render(tab());
    open('ban');
    fireEvent.click(within(card('ban')).getByRole('radio', { name: 'Ban a site' }));
    fireEvent.change(within(card('ban')).getByLabelText('Site'), { target: { value: '*.example.org' } });
    expect(preview('ban')).toBe('ban *.example.org');
    run('ban');
    await flush();
    expect(within(card('ban')).getByRole('alertdialog')).toHaveTextContent('matches the wildcard');
    fireEvent.click(within(card('ban')).getByRole('button', { name: 'Cancel' }));
    await flush();
    expect(sent).toEqual([]);

    fireEvent.click(within(card('ban')).getByRole('radio', { name: 'List bans' }));
    run('ban');
    await flush();
    expect(sent).toEqual(['ban']);
  });
});

describe('ServerTab: areload offers the area files from the world index', () => {
  it('lists the readable area files and sends areload <file> after the confirmation', async () => {
    render(tab());
    open('areload');
    const select = within(card('areload')).getByLabelText('Area file');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose…', 'alpha.are', 'beta.are']);
    fireEvent.change(select, { target: { value: 'alpha.are' } });
    expect(preview('areload')).toBe('areload alpha.are');
    run('areload');
    await flush();
    expect(within(card('areload')).getByRole('alertdialog')).toHaveTextContent('areload alpha.are');
    expect(sent).toEqual([]);
    fireEvent.click(within(card('areload')).getByRole('button', { name: 'Send it' }));
    await flush();
    expect(sent).toEqual(['areload alpha.are']);
    await answer('Reloaded alpha.are in place: rooms 3 upd/0 new\n\r');
    expect(within(card('areload')).getByText('Done: the game answered as expected')).toBeInTheDocument();
  });

  it('while the list is not loaded it takes a typed file name, offers to load the list, and checks the name', async () => {
    const onWorldNeeded = jest.fn();
    render(tab({ world: makeIndex({ areas: { status: 'idle' } }), onWorldNeeded }));
    open('areload');
    fireEvent.click(within(card('areload')).getByRole('button', { name: 'Load the area list' }));
    expect(onWorldNeeded).toHaveBeenCalledTimes(1);
    expect(within(card('areload')).getByText('Or type the file name.')).toBeInTheDocument();
    const input = within(card('areload')).getByLabelText('Area file');
    fireEvent.change(input, { target: { value: 'midgaard' } });
    expect(within(card('areload')).getByRole('alert')).toHaveTextContent('ending in .are');
    fireEvent.change(input, { target: { value: 'midgaard.are' } });
    expect(preview('areload')).toBe('areload midgaard.are');
  });

  it('says the list is loading while it loads', () => {
    render(tab({ world: makeIndex({ areas: { status: 'loading' } }) }));
    open('areload');
    expect(within(card('areload')).getByText('Loading…')).toBeInTheDocument();
  });

  it('keeps the typed field when the index fails, and the other cards are unaffected', () => {
    render(tab({ world: makeIndex({ areas: { status: 'offline', message: 'down' } }) }));
    open('areload');
    expect(within(card('areload')).getByLabelText('Area file').tagName).toBe('INPUT');
    open('newlock');
    expect(preview('newlock')).toBe('newlock');
  });
});

describe('ServerTab: hidden and removed', () => {
  it('is hidden, not removed, while another tab shows, so what was opened and typed is kept', () => {
    const { rerender, container } = render(tab({ visible: true }));
    open('areload');
    fireEvent.change(within(card('areload')).getByLabelText('Area file'), { target: { value: 'beta.are' } });
    rerender(tab({ visible: false }));
    expect(container.firstElementChild).toHaveAttribute('hidden');
    expect(screen.queryAllByRole('region')).toHaveLength(0); // hidden content is not exposed
    rerender(tab({ visible: true }));
    expect(preview('areload')).toBe('areload beta.are');
  });

  it('answers an open question "no" when the tab is removed', async () => {
    const { unmount } = render(tab());
    open('shutdown');
    run('shutdown');
    await flush();
    unmount();
    await flush();
    expect(sent).toEqual([]);
  });
});
