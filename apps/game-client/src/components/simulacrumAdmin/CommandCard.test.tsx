import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import CommandCard from './CommandCard';
import { DispatchEvent } from '../../features/event-emitter/event-dispatcher';
import { createActivityLog } from '../../features/simulacrumAdmin/activityLog';
import { findCatalogCommand, type CatalogCommand } from '../../features/simulacrumAdmin/commandCatalog';
import { createReplyCollector, type ReplyCollector } from '../../features/simulacrumAdmin/replyCollector';
import { createSender, type Sender } from '../../features/simulacrumAdmin/sender';

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

const cmd = (name: string): CatalogCommand => {
  const found = findCatalogCommand(name);
  if (!found) throw new Error(`no command ${name}`);
  return found;
};
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
const open = (): void => {
  fireEvent.click(screen.getAllByRole('button')[0]);
};
const run = (): void => {
  fireEvent.click(screen.getByRole('button', { name: /^(Run|Waiting for the game…)$/ }));
};
const preview = (name: string): string => screen.getByLabelText(`Line to send: ${name}`).textContent ?? '';

describe('CommandCard: the header', () => {
  it('is collapsed at first and shows the name, asks-first and the level', () => {
    render(<CommandCard command={cmd('freeze')} sender={sender} />);
    const header = screen.getByRole('button', { name: /^freeze/ });
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(header).toHaveTextContent('asks first');
    expect(header).toHaveTextContent('L56');
    expect(screen.queryByText(/Toggles a player frozen/)).not.toBeInTheDocument();
  });

  it('does not say asks-first for a command that does not ask', () => {
    render(<CommandCard command={cmd('holylight')} sender={sender} />);
    expect(screen.getByRole('button', { name: /^holylight/ })).not.toHaveTextContent('asks first');
  });

  it('opens and closes on click, showing the summary when open', () => {
    render(<CommandCard command={cmd('freeze')} sender={sender} />);
    open();
    expect(screen.getByRole('button', { name: /^freeze/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/Toggles a player frozen/)).toBeInTheDocument();
    open();
    expect(screen.queryByText(/Toggles a player frozen/)).not.toBeInTheDocument();
  });
});

describe('CommandCard: forms and fields', () => {
  it('has no form choice for a command with one form', () => {
    render(<CommandCard command={cmd('freeze')} sender={sender} />);
    open();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  it('offers a radio per form, previews the selected form’s line and keeps typed values per form', () => {
    render(<CommandCard command={cmd('ban')} sender={sender} />);
    open();
    expect(screen.getAllByRole('radio').map((r) => r.parentElement?.textContent)).toEqual(['List bans', 'Ban a site']);
    expect(preview('ban')).toBe('ban');
    fireEvent.click(screen.getByRole('radio', { name: 'Ban a site' }));
    fireEvent.change(screen.getByLabelText('Site'), { target: { value: 'bad.example' } });
    expect(preview('ban')).toBe('ban bad.example');
    fireEvent.click(screen.getByRole('radio', { name: 'List bans' }));
    expect(preview('ban')).toBe('ban');
    fireEvent.click(screen.getByRole('radio', { name: 'Ban a site' }));
    expect(screen.getByLabelText('Site')).toHaveValue('bad.example');
  });

  it('shows a field error once a bad value is typed and keeps the preview unbuilt', () => {
    render(<CommandCard command={cmd('areload')} sender={sender} />);
    open();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Area file'), { target: { value: 'midgaard' } });
    expect(screen.getByRole('alert')).toHaveTextContent('ending in .are');
    expect(preview('areload')).toBe('…');
    fireEvent.change(screen.getByLabelText('Area file'), { target: { value: 'midgaard.are' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(preview('areload')).toBe('areload midgaard.are');
  });

  it('reports a missing required value only after Run, sends nothing, and forgets the nagging when the form changes', async () => {
    render(<CommandCard command={cmd('ban')} sender={sender} />);
    open();
    fireEvent.click(screen.getByRole('radio', { name: 'Ban a site' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    run();
    await flush();
    expect(screen.getByRole('alert')).toHaveTextContent('Site is required.');
    expect(screen.getByText(/Not sent: Site is required\./)).toBeInTheDocument();
    expect(sent).toEqual([]);
    fireEvent.click(screen.getByRole('radio', { name: 'List bans' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the values the choicesFor hook supplies as a select, still checked by the builder', () => {
    render(<CommandCard command={cmd('areload')} sender={sender} choicesFor={() => ['alpha.are', 'beta.are']} />);
    open();
    const select = screen.getByLabelText('Area file');
    expect(select.tagName).toBe('SELECT');
    expect(Array.from(select.querySelectorAll('option')).map((o) => o.textContent)).toEqual(['Choose…', 'alpha.are', 'beta.are']);
    fireEvent.change(select, { target: { value: 'beta.are' } });
    expect(preview('areload')).toBe('areload beta.are');
  });

  it('keeps a plain input when choicesFor has nothing for the field', () => {
    render(<CommandCard command={cmd('areload')} sender={sender} choicesFor={() => undefined} />);
    open();
    expect(screen.getByLabelText('Area file').tagName).toBe('INPUT');
  });

  it('shows the extra content under the fields', () => {
    render(<CommandCard command={cmd('areload')} sender={sender} extra={<span>Load the list first</span>} />);
    open();
    expect(screen.getByText('Load the list first')).toBeInTheDocument();
  });
});

describe('CommandCard: running', () => {
  it('runs a command that does not ask at once, shows the working label and then the game’s answer as done', async () => {
    render(<CommandCard command={cmd('holylight')} sender={sender} />);
    open();
    run();
    await flush();
    expect(sent).toEqual(['holylight']);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Waiting for the game…' })).toBeDisabled();
    await answer('Holy light mode on.\n\r');
    expect(screen.getByText('Done: the game answered as expected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run' })).toBeEnabled();
  });

  it('asks first for a destructive command, keeps Run disabled meanwhile, and sends only after Send it', async () => {
    render(<CommandCard command={cmd('freeze')} sender={sender} />);
    open();
    fireEvent.change(screen.getByLabelText('Character'), { target: { value: 'Testchar' } });
    run();
    await flush();
    expect(screen.getByRole('alertdialog')).toHaveTextContent('freeze Testchar');
    expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled();
    expect(sent).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Send it' }));
    await flush();
    expect(sent).toEqual(['freeze Testchar']);
    await answer('FREEZE set.\n\r');
    expect(screen.getByText('Done: the game answered as expected')).toBeInTheDocument();
  });

  it('sends nothing when the question is cancelled and says so', async () => {
    render(<CommandCard command={cmd('shutdown')} sender={sender} />);
    open();
    run();
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await flush();
    expect(sent).toEqual([]);
    expect(screen.getByText('Cancelled: nothing was sent.')).toBeInTheDocument();
  });

  it('shows a refusal as refused and never as done', async () => {
    render(<CommandCard command={cmd('holylight')} sender={sender} />);
    open();
    run();
    await flush();
    await answer('Huh?\n\r');
    expect(screen.getByText('Refused by the game (Huh?)')).toBeInTheDocument();
    expect(screen.queryByText(/Done:/)).not.toBeInTheDocument();
  });

  it('shows the answer only beside the form it belongs to', async () => {
    render(<CommandCard command={cmd('copyover')} sender={sender} />);
    open();
    run(); // the first form, "What copyover does"
    await flush();
    await answer("Type 'copyover confirm' to proceed.\n\r");
    expect(screen.getByText('Done: the game answered as expected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Copyover now' }));
    expect(screen.queryByText('Done: the game answered as expected')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'What copyover does' }));
    expect(screen.getByText('Done: the game answered as expected')).toBeInTheDocument();
  });

  it('answers an open question "no" when the card is removed', async () => {
    const { unmount } = render(<CommandCard command={cmd('shutdown')} sender={sender} />);
    open();
    run();
    await flush();
    unmount();
    await flush();
    expect(sent).toEqual([]);
  });
});
