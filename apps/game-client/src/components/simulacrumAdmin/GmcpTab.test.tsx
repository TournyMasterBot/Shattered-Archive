import { act, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import GmcpTab from './GmcpTab';
import { MAX_DETAIL_CHARS, MAX_ROWS, detailText } from '../../features/simulacrumAdmin/gmcpView';
import { DispatchEvent } from '../../features/event-emitter/event-dispatcher';
import { createGmcpCapture, type GmcpCapture, type GmcpEntry } from '../../features/simulacrumAdmin/gmcpCapture';

const send = (payload: string): void => {
  act(() => {
    DispatchEvent('game:remote-server:gmcp', { type: 'gmcp', receivedTimestamp: '2026-11-07T10:20:30.000Z', payload });
  });
};

const CHAR_DATA = JSON.stringify({
  hp: 1, max_hp: 1, mana: 1, max_mana: 1, move: 1, max_move: 1, gold: 0, silver: 0, wimpy: 0,
  str: 1, max_str: 1, int: 1, max_int: 1, wis: 1, max_wis: 1, dex: 1, max_dex: 1, con: 1, max_con: 1,
  stance: 'Defensive', language: 'Common', tnl: 1, carry_weight: 1, can_carry_weight: 1,
  is_afk: false, is_quiet: false, is_flying: false, is_riding: false, is_fighting: false,
});

let capture: GmcpCapture;
beforeEach(() => {
  capture = createGmcpCapture({ isActive: () => true });
});
afterEach(() => capture.dispose());

const list = (): HTMLElement => screen.getByRole('list', { name: 'GMCP messages' });
const rows = (): HTMLElement[] => within(list()).getAllByRole('button');

describe('GmcpTab: the message list', () => {
  it('says so when nothing has arrived', () => {
    render(<GmcpTab capture={capture} />);
    expect(screen.getByRole('status')).toHaveTextContent('No GMCP received yet.');
    expect(screen.getByText('Select a message to read it.')).toBeInTheDocument();
  });

  it('lists each message as it arrives, newest first, with package, size and no badges for a DSL package', () => {
    render(<GmcpTab capture={capture} />);
    send('tick {"time":"9:00pm"}');
    send('room_data {"room":"x","sector":"city","exits":[]}');
    const [newest, older] = rows();
    expect(newest).toHaveTextContent('room_data');
    expect(older).toHaveTextContent('tick');
    expect(older).toHaveTextContent(String('tick {"time":"9:00pm"}'.length));
    expect(newest).not.toHaveTextContent('not a DSL package');
    expect(screen.getByRole('status')).toHaveTextContent('2 kept, 2 match.');
  });

  it('badges a parse error and a package DSL does not send (E23)', () => {
    render(<GmcpTab capture={capture} />);
    send('tick {oops');
    send('weather {"sky":"clear"}');
    send('');
    const [empty, weather, tick] = rows();
    expect(tick).toHaveTextContent('invalid JSON');
    expect(weather).toHaveTextContent('not a DSL package');
    expect(empty).toHaveTextContent('(empty)');
    expect(empty).toHaveTextContent('empty message');
    expect(empty).not.toHaveTextContent('not a DSL package');
  });

  it('shows the received time as it came when it is not a date, and names an empty message in its detail', () => {
    render(<GmcpTab capture={capture} />);
    act(() => {
      DispatchEvent('game:remote-server:gmcp', { type: 'gmcp', receivedTimestamp: 'not a date', payload: '' });
    });
    expect(rows()[0]).toHaveTextContent('not a date');
    fireEvent.click(rows()[0]);
    expect(within(screen.getByLabelText('Selected message')).getByText('(empty)')).toBeInTheDocument();
  });

  it('filters by package from the packages seen', () => {
    render(<GmcpTab capture={capture} />);
    send('tick {"time":"9:00pm"}');
    send('room_data {"room":"x","sector":"city","exits":[]}');
    send('tick {"time":"9:30pm"}');
    const select = screen.getByLabelText('Package') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['', 'room_data', 'tick']);
    fireEvent.change(select, { target: { value: 'tick' } });
    expect(rows()).toHaveLength(2);
    expect(screen.getByRole('status')).toHaveTextContent('3 kept, 2 match.');
  });

  it('searches the raw text, ignoring case, and combines with the package filter', () => {
    render(<GmcpTab capture={capture} />);
    send('room_data {"room":"Market Square","sector":"city","exits":[]}');
    send('room_data {"room":"Dark Cave","sector":"inside","exits":[]}');
    send('tick {"time":"9:00pm"}');
    fireEvent.change(screen.getByLabelText('Search the messages'), { target: { value: 'market' } });
    expect(rows()).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Package'), { target: { value: 'tick' } });
    expect(within(list()).queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByRole('status')).toHaveTextContent('3 kept, 0 match.');
  });

  it('draws at most MAX_ROWS of the newest matches and says how many there are (E16)', () => {
    render(<GmcpTab capture={capture} />);
    act(() => {
      for (let i = 0; i < MAX_ROWS + 25; i++) DispatchEvent('game:remote-server:gmcp', { type: 'gmcp', payload: `m${i} {}` });
    });
    expect(rows()).toHaveLength(MAX_ROWS);
    expect(rows()[0]).toHaveTextContent(`m${MAX_ROWS + 24}`);
    expect(screen.getByRole('status')).toHaveTextContent(`${MAX_ROWS + 25} kept, ${MAX_ROWS + 25} match, newest ${MAX_ROWS} shown. Narrow the filter to see more.`);
  });

  it('pauses and resumes: paused messages are not kept, and the notice says so', () => {
    render(<GmcpTab capture={capture} />);
    send('a {}');
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByText(/Paused: new messages are not being kept/)).toBeInTheDocument();
    send('b {}');
    expect(rows()).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(screen.queryByText(/Paused:/)).toBeNull();
    send('c {}');
    expect(rows().map((r) => r.textContent)).toEqual([expect.stringContaining('c'), expect.stringContaining('a')]);
  });

  it('clears everything, and the Clear button is disabled when there is nothing to clear', () => {
    render(<GmcpTab capture={capture} />);
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
    send('a {}');
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByRole('status')).toHaveTextContent('No GMCP received yet.');
  });

  it('goes back to the empty detail message when Clear removes the selected message', () => {
    render(<GmcpTab capture={capture} />);
    send('tick {"time":"9:00pm"}');
    fireEvent.click(rows()[0]);
    expect(screen.getByLabelText('Selected message')).toHaveTextContent('"time": "9:00pm"');
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText('Select a message to read it.')).toBeInTheDocument();
  });
});

describe('GmcpTab: the detail pane and copying', () => {
  it('pretty-prints a parsed message and marks the selected row', () => {
    render(<GmcpTab capture={capture} />);
    send('add_affect {"n":"bless","d":12,"m":1,"lc":"hit roll","t":0}');
    fireEvent.click(rows()[0]);
    expect(rows()[0]).toHaveAttribute('aria-pressed', 'true');
    const detail = screen.getByLabelText('Selected message');
    expect(detail).toHaveTextContent('"n": "bless"');
    expect(detail).toHaveTextContent('"lc": "hit roll"');
  });

  it('shows the raw text and the reason for a message it could not parse', () => {
    render(<GmcpTab capture={capture} />);
    send('tick {oops');
    fireEvent.click(rows()[0]);
    const detail = screen.getByLabelText('Selected message');
    expect(detail).toHaveTextContent('tick {oops');
    expect(detail).toHaveTextContent('invalid JSON');
  });

  it('cuts a very long message in the detail pane but copies all of it', async () => {
    const copyText = jest.fn().mockResolvedValue(undefined);
    render(<GmcpTab capture={capture} copyText={copyText} />);
    const big = `affect_data {"affects":[],"pad":"${'x'.repeat(MAX_DETAIL_CHARS + 500)}"}`;
    send(big);
    fireEvent.click(rows()[0]);
    expect(screen.getByLabelText('Selected message')).toHaveTextContent('Shown cut at 64 KB');
    fireEvent.click(screen.getByRole('button', { name: 'Copy message' }));
    expect(copyText).toHaveBeenCalledWith(big);
    expect(await screen.findByText(/Copied the message\./)).toBeInTheDocument();
  });

  it('copies exactly the shown messages, oldest first, one per line', async () => {
    const copyText = jest.fn().mockResolvedValue(undefined);
    render(<GmcpTab capture={capture} copyText={copyText} />);
    send('a {"n":1}');
    send('b {"n":2}');
    send('a {"n":3}');
    fireEvent.change(screen.getByLabelText('Package'), { target: { value: 'a' } });
    fireEvent.click(screen.getByRole('button', { name: 'Copy shown' }));
    expect(copyText).toHaveBeenCalledWith('a {"n":1}\na {"n":3}');
    expect(await screen.findByText(/Copied the shown messages\./)).toBeInTheDocument();
  });

  it('disables Copy shown when nothing is shown', () => {
    render(<GmcpTab capture={capture} />);
    expect(screen.getByRole('button', { name: 'Copy shown' })).toBeDisabled();
  });

  it('says so when the clipboard refuses', async () => {
    const copyText = jest.fn().mockRejectedValue(new Error('denied'));
    render(<GmcpTab capture={capture} copyText={copyText} />);
    send('a {}');
    fireEvent.click(screen.getByRole('button', { name: 'Copy shown' }));
    expect(await screen.findByText(/Could not copy/)).toBeInTheDocument();
  });

  it('uses the browser clipboard by default', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<GmcpTab capture={capture} />);
    send('a {}');
    fireEvent.click(screen.getByRole('button', { name: 'Copy shown' }));
    expect(writeText).toHaveBeenCalledWith('a {}');
    await screen.findByText(/Copied the shown messages/);
  });

  describe('detailText', () => {
    const entry = (over: Partial<GmcpEntry>): GmcpEntry => ({ id: 1, receivedAt: 'x', pkg: 'p', size: 0, raw: '', ...over });
    it('indents parsed data, uses the raw text otherwise, and cuts at the limit', () => {
      expect(detailText(entry({ raw: 'p {"a":1}', data: { a: 1 } }))).toEqual({ text: '{\n  "a": 1\n}', truncated: false });
      expect(detailText(entry({ raw: 'p {oops' }))).toEqual({ text: 'p {oops', truncated: false });
      const long = detailText(entry({ raw: 'x'.repeat(MAX_DETAIL_CHARS + 1) }));
      expect(long.truncated).toBe(true);
      expect(long.text).toHaveLength(MAX_DETAIL_CHARS);
    });
  });
});

describe('GmcpTab: parity with DSL', () => {
  const GOOD_ROOM = 'room_data {"room":"x","sector":"city","exits":["N"]}';
  const open = (): void => {
    fireEvent.click(screen.getByRole('button', { name: 'Parity with DSL' }));
  };

  it('lists all seven DSL packages as not seen when nothing has arrived, with a hint for login_data', () => {
    render(<GmcpTab capture={capture} />);
    open();
    const cards = screen.getAllByRole('listitem').filter((li) => li.getAttribute('data-status'));
    expect(cards.map((c) => c.querySelector('strong')?.textContent)).toEqual([
      'login_data', 'char_data', 'room_data', 'tick', 'add_affect', 'remove_affect', 'affect_data',
    ]);
    expect(cards.every((c) => c.getAttribute('data-status') === 'not-seen')).toBe(true);
    expect(screen.getByText(/Sent once, at login/)).toBeInTheDocument();
    expect(screen.getByText(/0 messages checked/)).toBeInTheDocument();
  });

  it('says a package matches DSL when every message has the DSL shape', () => {
    render(<GmcpTab capture={capture} />);
    send(GOOD_ROOM);
    send('char_data ' + CHAR_DATA);
    open();
    const room = screen.getByText('room_data').closest('li') as HTMLElement;
    expect(room).toHaveAttribute('data-status', 'match');
    expect(room).toHaveTextContent('Matches DSL');
    expect(room).toHaveTextContent('1 seen');
    expect(screen.getByText(/2 messages checked/)).toBeInTheDocument();
  });

  it('lists each difference with its severity, path, the value, and how many messages had it', () => {
    render(<GmcpTab capture={capture} />);
    send('room_data {"room":"x","sector":"water swim","exits":["N"]}');
    send('room_data {"room":"y","sector":"water swim","exits":["N"]}');
    open();
    const room = screen.getByText('room_data').closest('li') as HTMLElement;
    expect(room).toHaveAttribute('data-status', 'differs');
    const finding = within(room).getByText('sector').closest('li') as HTMLElement;
    expect(finding).toHaveAttribute('data-severity', 'warn');
    expect(finding).toHaveTextContent('Difference');
    expect(finding).toHaveTextContent('not a value DSL sends for this field');
    expect(finding).toHaveTextContent('water swim');
    expect(finding).toHaveTextContent('×2');
  });

  it('shows noted differences as a note, not a failure', () => {
    render(<GmcpTab capture={capture} />);
    send('char_data ' + JSON.stringify({ ...JSON.parse(CHAR_DATA), language: 'elven' }));
    open();
    const card = screen.getByText('char_data').closest('li') as HTMLElement;
    expect(card).toHaveAttribute('data-status', 'noted');
    expect(card).toHaveTextContent('Matches DSL, with noted differences');
    expect(within(card).getByText('Note')).toBeInTheDocument();
  });

  it('shows a missing field as an error', () => {
    render(<GmcpTab capture={capture} />);
    send('tick {}');
    open();
    const card = screen.getByText('tick').closest('li') as HTMLElement;
    const finding = within(card).getByText('time').closest('li') as HTMLElement;
    expect(finding).toHaveAttribute('data-severity', 'error');
    expect(finding).toHaveTextContent('DSL always sends this field');
  });

  it('lists packages DSL does not send, and says how many messages could not be parsed', () => {
    render(<GmcpTab capture={capture} />);
    send('weather {"a":1}');
    send('weather {"a":2}');
    send('tick {oops');
    open();
    const unknown = screen.getByText('Packages DSL does not send').closest('div[data-status]') as HTMLElement;
    expect(unknown).toHaveTextContent('weather');
    expect(unknown).toHaveTextContent('×2');
    expect(screen.getByText(/1 DSL-package message\(s\) could not be parsed/)).toBeInTheDocument();
  });

  it('updates as messages arrive while the Parity view is open, and goes back to the messages', () => {
    render(<GmcpTab capture={capture} />);
    open();
    expect(screen.getByText('tick').closest('li')).toHaveAttribute('data-status', 'not-seen');
    send('tick {"time":"9:00pm"}');
    expect(screen.getByText('tick').closest('li')).toHaveAttribute('data-status', 'match');
    fireEvent.click(screen.getByRole('button', { name: 'Messages' }));
    expect(rows()).toHaveLength(1);
  });

  it('labels a payload that is not an object at the message level, and an empty package name as (empty)', () => {
    render(<GmcpTab capture={capture} />);
    send('tick 5');
    send('');
    open();
    const tick = screen.getByText('tick').closest('li') as HTMLElement;
    const finding = within(tick).getByText('(message)').closest('li') as HTMLElement;
    expect(finding).toHaveAttribute('data-severity', 'error');
    expect(finding).toHaveTextContent('the payload is number, not a JSON object');
    const unknown = screen.getByText('Packages DSL does not send').closest('div[data-status]') as HTMLElement;
    expect(unknown).toHaveTextContent('(empty)');
  });

  it('uses a singular "message" for one checked message', () => {
    render(<GmcpTab capture={capture} />);
    send(GOOD_ROOM);
    open();
    expect(screen.getByText(/1 message checked/)).toBeInTheDocument();
  });
});

describe('GmcpTab: hidden while another tab shows', () => {
  it('draws nothing but keeps its filter and selection, which come back when it is shown again', () => {
    const { rerender } = render(<GmcpTab capture={capture} visible />);
    send('tick {"time":"9:00pm"}');
    send('room_data {"room":"x","sector":"city","exits":[]}');
    fireEvent.change(screen.getByLabelText('Search the messages'), { target: { value: 'tick' } });
    fireEvent.click(rows()[0]);

    rerender(<GmcpTab capture={capture} visible={false} />);
    expect(screen.queryByRole('list', { name: 'GMCP messages' })).toBeNull();
    send('tick {"time":"9:30pm"}'); // arrives while hidden

    rerender(<GmcpTab capture={capture} visible />);
    expect((screen.getByLabelText('Search the messages') as HTMLInputElement).value).toBe('tick');
    expect(rows()).toHaveLength(2); // both tick messages, the one that arrived while hidden included
    expect(screen.getByLabelText('Selected message')).toHaveTextContent('"time": "9:00pm"'); // the selection survived
  });

  it('removes its subscription when it unmounts: later messages do not touch it', () => {
    const { unmount } = render(<GmcpTab capture={capture} />);
    unmount();
    expect(() => send('tick {"time":"9:00pm"}')).not.toThrow();
    expect(capture.getEntries()).toHaveLength(1);
  });
});
