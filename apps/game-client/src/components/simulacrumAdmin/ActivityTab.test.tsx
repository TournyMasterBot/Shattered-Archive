import { act, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import ActivityTab from './ActivityTab';
import { ACTIVITY_CAP, createActivityLog, type ActivityLog, type NewActivityEntry } from '../../features/simulacrumAdmin/activityLog';

let log: ActivityLog;
beforeEach(() => {
  log = createActivityLog();
});

const entry = (over: Partial<NewActivityEntry> = {}): NewActivityEntry => ({
  at: '2026-11-07T10:20:30.000Z',
  line: 'stat Testchar',
  verdict: 'accepted',
  reason: 'Name: Testchar',
  replyLines: ['Name: Testchar', 'Level: 5'],
  rawReply: 'Name: Testchar\n\rLevel: 5\n\r',
  ...over,
});
const add = (over?: Partial<NewActivityEntry>): void => {
  act(() => {
    log.add(entry(over));
  });
};
const items = (): HTMLElement[] => within(screen.getByRole('list', { name: 'Sent commands' })).queryAllByRole('listitem');

describe('ActivityTab', () => {
  it('says so when nothing was sent', () => {
    render(<ActivityTab activity={log} />);
    expect(screen.getByRole('status')).toHaveTextContent('Nothing sent yet.');
    expect(items()).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
  });

  it('lists what was sent newest first with the time, the verdict and the reply lines', () => {
    render(<ActivityTab activity={log} />);
    add({ line: 'goto 3001', verdict: 'refused', reason: 'No such location.', replyLines: ['No such location.'] });
    add({ line: 'holylight', verdict: 'unknown', reason: undefined, replyLines: [] });
    add({ line: 'stat Testchar' });
    const [newest, middle, oldest] = items();
    expect(newest).toHaveTextContent('stat Testchar');
    expect(newest).toHaveTextContent('Done');
    expect(newest).toHaveTextContent('Level: 5');
    expect(newest).toHaveAttribute('data-verdict', 'accepted');
    expect(middle).toHaveTextContent('Unknown');
    expect(middle).toHaveTextContent('The game sent no text.');
    expect(oldest).toHaveTextContent('Refused');
    expect(oldest).toHaveTextContent('No such location.');
    expect(screen.getByRole('status')).toHaveTextContent('3 of 3 shown, newest first.');
  });

  it('shows the time as a clock, and the raw text when the time cannot be read', () => {
    render(<ActivityTab activity={log} />);
    add({ at: 'not a time' });
    expect(items()[0]).toHaveTextContent('not a time');
  });

  it('filters by verdict and says how many are shown', () => {
    render(<ActivityTab activity={log} />);
    add({ line: 'one', verdict: 'accepted' });
    add({ line: 'two', verdict: 'refused', reason: 'Huh?' });
    add({ line: 'three', verdict: 'refused', reason: 'Huh?' });
    fireEvent.change(screen.getByLabelText('Verdict'), { target: { value: 'refused' } });
    expect(items().map((i) => i.textContent)).toEqual([expect.stringContaining('three'), expect.stringContaining('two')]);
    expect(screen.getByRole('status')).toHaveTextContent('2 of 3 shown');
    fireEvent.change(screen.getByLabelText('Verdict'), { target: { value: 'unknown' } });
    expect(items()).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('Verdict'), { target: { value: '' } });
    expect(items()).toHaveLength(3);
  });

  it('clears the list', () => {
    render(<ActivityTab activity={log} />);
    add();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(items()).toHaveLength(0);
    expect(screen.getByRole('status')).toHaveTextContent('Nothing sent yet.');
  });

  it('keeps no more than 200 entries and shows the newest', () => {
    render(<ActivityTab activity={log} />);
    act(() => {
      for (let i = 1; i <= ACTIVITY_CAP + 5; i++) log.add(entry({ line: `look ${i}` }));
    });
    expect(items()).toHaveLength(ACTIVITY_CAP);
    expect(items()[0]).toHaveTextContent(`look ${ACTIVITY_CAP + 5}`);
    expect(items()[ACTIVITY_CAP - 1]).toHaveTextContent('look 6');
  });

  it('copies the raw reply, not the display text', async () => {
    const copyText = jest.fn(() => Promise.resolve());
    render(<ActivityTab activity={log} copyText={copyText} />);
    add({ rawReply: '\u001b[31mred\u001b[0m\n\r', replyLines: ['red'] });
    fireEvent.click(screen.getByRole('button', { name: 'Copy raw reply of stat Testchar' }));
    expect(copyText).toHaveBeenCalledWith('\u001b[31mred\u001b[0m\n\r');
    expect(await screen.findByText(/Copied the raw reply\./)).toBeInTheDocument();
  });

  it('says so when the copy is refused', async () => {
    render(<ActivityTab activity={log} copyText={() => Promise.reject(new Error('denied'))} />);
    add();
    fireEvent.click(screen.getByRole('button', { name: /Copy raw reply/ }));
    expect(await screen.findByText(/Could not copy\./)).toBeInTheDocument();
  });

  it('copies with the browser clipboard by default', async () => {
    const writeText = jest.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<ActivityTab activity={log} />);
    add();
    fireEvent.click(screen.getByRole('button', { name: /Copy raw reply/ }));
    expect(writeText).toHaveBeenCalledWith('Name: Testchar\n\rLevel: 5\n\r');
    expect(await screen.findByText(/Copied the raw reply\./)).toBeInTheDocument();
  });

  it('draws nothing while hidden and keeps its filter', () => {
    const { rerender, container } = render(<ActivityTab activity={log} visible />);
    add({ verdict: 'refused', reason: 'Huh?' });
    fireEvent.change(screen.getByLabelText('Verdict'), { target: { value: 'refused' } });
    rerender(<ActivityTab activity={log} visible={false} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<ActivityTab activity={log} visible />);
    expect(screen.getByLabelText('Verdict')).toHaveValue('refused');
    expect(items()).toHaveLength(1);
  });
});
