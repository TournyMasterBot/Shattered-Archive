import { act, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import WorldTab from './WorldTab';
import { DispatchEvent } from '../../features/event-emitter/event-dispatcher';
import { createActivityLog } from '../../features/simulacrumAdmin/activityLog';
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
const pickRoom = (): void => {
  fireEvent.click(within(screen.getByRole('list', { name: 'Areas' })).getByRole('button', { name: /Alpha Keep/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Pick room 3001 The Great Hall' }));
};
const press = (name: RegExp | string): void => {
  fireEvent.click(screen.getByRole('button', { name }));
};

describe('WorldTab: before a room is picked', () => {
  it('shows the picker and no actions', () => {
    render(<WorldTab sender={sender} index={makeIndex()} target="" />);
    expect(screen.getByLabelText('Filter areas')).toBeInTheDocument();
    expect(screen.queryByLabelText('Picked room')).not.toBeInTheDocument();
  });

  it('shows the offline state of the index, so the tab is usable without the vhost (E8)', () => {
    render(<WorldTab sender={sender} index={makeIndex({ areas: { status: 'offline', message: 'could not be reached' } })} target="" />);
    expect(screen.getByRole('alert')).toHaveTextContent('could not be reached');
  });
});

describe('WorldTab: actions on the picked room', () => {
  it('shows the room, its number and its area', () => {
    render(<WorldTab sender={sender} index={makeIndex()} target="" />);
    pickRoom();
    const card = screen.getByLabelText('Picked room');
    expect(card).toHaveTextContent('3001 The Great Hall');
    expect(card).toHaveTextContent('Alpha Keep');
  });

  it('names the area by its file when it has no name', () => {
    const index = makeIndex({
      areas: { status: 'ready', data: [{ file: 'plain.are', rooms: 1 }], at: 1 },
      rooms: { 'plain.are': { status: 'ready', data: [{ vnum: 10, name: 'Only Room' }], at: 1 } },
    });
    render(<WorldTab sender={sender} index={index} target="" />);
    fireEvent.click(within(screen.getByRole('list', { name: 'Areas' })).getByRole('button', { name: /plain\.are/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Pick room 10 Only Room' }));
    expect(screen.getByLabelText('Picked room')).toHaveTextContent('plain.are');
  });

  it('goto sends the exact line and shows the game’s reply as done', async () => {
    render(<WorldTab sender={sender} index={makeIndex()} target="" />);
    pickRoom();
    press(/^Go there \(goto 3001\)$/);
    await flush();
    expect(sent).toEqual(['goto 3001']);
    await answer('The Great Hall\n\rA vast hall.\n\r');
    expect(screen.getByText('goto 3001')).toBeInTheDocument();
    expect(screen.getByText('Done: the game answered as expected')).toBeInTheDocument();
  });

  it('violate sends its own line', async () => {
    render(<WorldTab sender={sender} index={makeIndex()} target="" />);
    pickRoom();
    press(/violate 3001/);
    await flush();
    expect(sent).toEqual(['violate 3001']);
  });

  it('at sends the room and the typed command', async () => {
    render(<WorldTab sender={sender} index={makeIndex()} target="" />);
    pickRoom();
    fireEvent.change(screen.getByLabelText('Run a command there'), { target: { value: 'look' } });
    press(/^Run \(at 3001/);
    await flush();
    expect(sent).toEqual(['at 3001 look']);
  });

  it('at refuses an empty command in words and sends nothing', async () => {
    render(<WorldTab sender={sender} index={makeIndex()} target="" />);
    pickRoom();
    press(/^Run \(at 3001/);
    await flush();
    expect(sent).toEqual([]);
    expect(screen.getByText(/Not sent: Command is required\./)).toBeInTheDocument();
  });

  it('at asks first when the typed command is itself destructive', async () => {
    render(<WorldTab sender={sender} index={makeIndex()} target="" />);
    pickRoom();
    fireEvent.change(screen.getByLabelText('Run a command there'), { target: { value: 'purge' } });
    press(/^Run \(at 3001/);
    await flush();
    expect(screen.getByRole('alertdialog')).toHaveTextContent('destructive command');
    expect(sent).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await flush();
    expect(sent).toEqual([]);
  });
});

describe('WorldTab: bringing the Players tab’s target (E21)', () => {
  it('cannot bring anyone until a target is set, and says where to set it', () => {
    render(<WorldTab sender={sender} index={makeIndex()} target="  " />);
    pickRoom();
    expect(screen.getByRole('button', { name: /^Bring the target here/ })).toBeDisabled();
  });

  it('sends transfer with the target and the vnum, without asking, for one player', async () => {
    render(<WorldTab sender={sender} index={makeIndex()} target=" Testchar " />);
    pickRoom();
    press('Bring Testchar here (transfer Testchar 3001)');
    await flush();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(sent).toEqual(['transfer Testchar 3001']);
    await answer('Ok.\n\r');
    expect(screen.getByText('Done: the game answered as expected')).toBeInTheDocument();
  });

  it('asks first when the target is all, naming every player, and sends only after confirmation', async () => {
    render(<WorldTab sender={sender} index={makeIndex()} target="all" />);
    pickRoom();
    press(/^Bring all here/);
    await flush();
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('every player on the server');
    expect(dialog).toHaveTextContent('transfer all 3001');
    expect(screen.getByRole('button', { name: /^Go there \(goto/ })).toBeDisabled();
    expect(sent).toEqual([]);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send it' }));
    await flush();
    expect(sent).toEqual(['transfer all 3001']);
  });
});

describe('WorldTab: a room the game does not know (E10)', () => {
  it('shows the refusal as refused and offers a refresh of the room list, which reloads the index', async () => {
    const index = makeIndex();
    render(<WorldTab sender={sender} index={index} target="" />);
    pickRoom();
    press(/^Go there \(goto/);
    await flush();
    await answer('No such location.\n\r');
    expect(screen.getByText('Refused by the game (No such location.)')).toBeInTheDocument();
    expect(screen.queryByText(/Done:/)).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('may be out of date');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh the room list' }));
    expect(index.refresh).toHaveBeenCalledTimes(1);
  });

  it('does not suggest a refresh for another refusal or for a success', async () => {
    render(<WorldTab sender={sender} index={makeIndex()} target="" />);
    pickRoom();
    press(/^Go there \(goto/);
    await flush();
    await answer('That room is private right now.\n\r');
    expect(screen.getByText(/Refused by the game/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Refresh the room list' })).not.toBeInTheDocument();
  });

  it('does not suggest a refresh when the refusal has no reason line', async () => {
    const stub: Sender = {
      ...sender,
      run: jest.fn(async () => ({
        status: 'sent' as const,
        entry: { id: 1, at: 'x', line: 'goto 3001', verdict: 'refused' as const, replyLines: [], rawReply: '' },
      })),
    };
    render(<WorldTab sender={stub} index={makeIndex()} target="" />);
    pickRoom();
    press(/^Go there \(goto/);
    await flush();
    expect(screen.getByText('Refused by the game')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Refresh the room list' })).not.toBeInTheDocument();
  });
});

describe('WorldTab: hidden and removed', () => {
  it('draws nothing while another tab shows and keeps the picked room', () => {
    const index = makeIndex();
    const { rerender, container } = render(<WorldTab sender={sender} index={index} target="" visible />);
    pickRoom();
    rerender(<WorldTab sender={sender} index={index} target="" visible={false} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<WorldTab sender={sender} index={index} target="" visible />);
    expect(screen.getByLabelText('Picked room')).toHaveTextContent('3001 The Great Hall');
  });

  it('answers an open question "no" when the tab is removed', async () => {
    const { unmount } = render(<WorldTab sender={sender} index={makeIndex()} target="all" />);
    pickRoom();
    press(/^Bring all here/);
    await flush();
    unmount();
    await flush();
    expect(sent).toEqual([]);
  });
});
