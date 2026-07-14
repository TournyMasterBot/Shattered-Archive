import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { buildMatch, type ArmyRoster } from '@shatteredarchive/kingdom-tactics-engine';

import { providers } from '../../state/providers';
import { NavProvider } from '../../state/nav';
import { OnlineMatchScreen } from './OnlineMatchScreen';
import type { WebSocketLike } from './kt-socket';

class FakeSocket implements WebSocketLike {
  sent: string[] = [];
  closed = false;
  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;

  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.closed = true;
    this.onclose?.(undefined);
  }
  emitOpen(): void {
    this.onopen?.(undefined);
  }
  emitFrame(msg: unknown): void {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
  parsedSent(): unknown[] {
    return this.sent.map((s) => JSON.parse(s));
  }
}

const warrior = (side: number): ArmyRoster => ({
  side,
  picks: [{ raceKey: 'Human', classKey: 'Warrior' }],
});
const duel = () => buildMatch('duel', [warrior(0), warrior(1)], providers, { seed: 1 });

function renderScreen() {
  const sockets: FakeSocket[] = [];
  const factory = () => {
    const s = new FakeSocket();
    sockets.push(s);
    return s;
  };
  render(
    <NavProvider>
      <OnlineMatchScreen socketFactory={factory} />
    </NavProvider>,
  );
  return { sockets, last: () => sockets[sockets.length - 1] };
}

afterEach(cleanup);

describe('OnlineMatchScreen', () => {
  it('shows a connect form and sends join on connect+open', () => {
    const { last } = renderScreen();
    expect(screen.getByRole('button', { name: 'Connect' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    act(() => last().emitOpen());
    expect(last().parsedSent()).toContainEqual({ type: 'join', matchId: 'duel-1', side: undefined });
  });

  it('renders the arena from a joined snapshot and submits a move on click', () => {
    const { last } = renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    const state = duel();
    act(() => {
      last().emitOpen();
      last().emitFrame({ type: 'joined', matchId: 'duel-1', side: 0, state, protocol: 1 });
    });

    // Arena rendered: one gridcell per tile.
    expect(screen.getAllByRole('gridcell')).toHaveLength(state.board.width * state.board.height);

    // Select a friendly unit, then click a highlighted move.
    const s0 = state.tokens.find((t) => t.side === 0)!;
    fireEvent.click(screen.getByLabelText(new RegExp(`\\(${s0.pos.x},${s0.pos.y}\\)`)));
    const moveCells = document.querySelectorAll('.kt-cell--move');
    expect(moveCells.length).toBeGreaterThan(0);
    fireEvent.click(moveCells[0] as HTMLElement);

    expect(last().parsedSent().some((m) => (m as { type: string }).type === 'action')).toBe(true);
  });

  it('shows a winner banner on an over frame', () => {
    const { last } = renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    const state = duel();
    act(() => {
      last().emitOpen();
      last().emitFrame({ type: 'joined', matchId: 'duel-1', side: 0, state, protocol: 1 });
      last().emitFrame({ type: 'over', matchId: 'duel-1', state, winner: 0 });
    });
    expect(screen.getByRole('heading', { name: 'Victory!' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Leave' })).toBeTruthy();
  });
});
