import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import {
  applyAction,
  buildMatch,
  createRng,
  legalActions,
  type Action,
  type ArmyRoster,
  type MoveAction,
} from '@shatteredarchive/kingdom-tactics-engine';

import { providers } from '../../state/providers';
import { Arena } from './Arena';

const warrior = (side: number): ArmyRoster => ({
  side,
  picks: [{ raceKey: 'Human', classKey: 'Warrior' }],
});

const duel = () => buildMatch('duel', [warrior(0), warrior(1)], providers, { seed: 1 });

const legalFor = (state: Parameters<typeof legalActions>[0]) => (id: string) =>
  legalActions(state, state.activeSide, providers).filter(
    (a) => a.type !== 'end-turn' && 'tokenId' in a && a.tokenId === id,
  );

afterEach(cleanup);

describe('Arena', () => {
  it('renders one gridcell per board tile', () => {
    const state = duel();
    render(<Arena state={state} controllableSide={0} legalActionsFor={() => []} onAct={() => {}} />);
    expect(screen.getAllByRole('gridcell')).toHaveLength(state.board.width * state.board.height);
  });

  it('selecting a friendly unit highlights legal moves; clicking one emits a move', () => {
    const state = duel();
    const legalFor = (id: string) =>
      legalActions(state, 0, providers).filter((a) => a.type !== 'end-turn' && 'tokenId' in a && a.tokenId === id);
    const acts: Action[] = [];
    render(
      <Arena state={state} controllableSide={0} legalActionsFor={legalFor} onAct={(a) => acts.push(a)} />,
    );

    const s0 = state.tokens.find((t) => t.side === 0)!;
    fireEvent.click(screen.getByLabelText(new RegExp(`\\(${s0.pos.x},${s0.pos.y}\\)`)));

    const moveCells = document.querySelectorAll('.kt-cell--move');
    expect(moveCells.length).toBeGreaterThan(0);

    fireEvent.click(moveCells[0] as HTMLElement);
    expect(acts.some((a) => a.type === 'move')).toBe(true);
  });

  it('emits end-turn from the control', () => {
    const acts: Action[] = [];
    render(<Arena state={duel()} controllableSide={0} legalActionsFor={() => []} onAct={(a) => acts.push(a)} />);
    fireEvent.click(screen.getByRole('button', { name: 'End turn' }));
    expect(acts).toEqual([{ type: 'end-turn', side: 0 }]);
  });

  it('shows stance controls for a selected friendly unit and emits a set-stance action', () => {
    const state = duel();
    const acts: Action[] = [];
    render(
      <Arena state={state} controllableSide={0} legalActionsFor={legalFor(state)} onAct={(a) => acts.push(a)} />,
    );
    // No stance panel until a unit is selected.
    expect(screen.queryByRole('group', { name: 'Unit stance' })).toBeNull();

    const s0 = state.tokens.find((t) => t.side === 0)!;
    fireEvent.click(screen.getByLabelText(new RegExp(`\\(${s0.pos.x},${s0.pos.y}\\)`)));

    // General stances are offered; the current (Normal) is disabled.
    expect(screen.getByRole('group', { name: 'Unit stance' })).toBeTruthy();
    const offensive = screen.getByRole('button', { name: 'Set stance Offensive' }) as HTMLButtonElement;
    expect((screen.getByRole('button', { name: 'Set stance Normal' }) as HTMLButtonElement).disabled).toBe(true);
    // A Warrior does NOT see the Brewmaster-only stances.
    expect(screen.queryByRole('button', { name: 'Set stance Drunken Monkey' })).toBeNull();

    fireEvent.click(offensive);
    expect(acts).toContainEqual({ type: 'set-stance', tokenId: s0.instanceId, stance: 'offensive' });
  });

  it('is display-only when not interactive (no End turn control)', () => {
    render(
      <Arena state={duel()} controllableSide={0} legalActionsFor={() => []} onAct={() => {}} interactive={false} />,
    );
    expect(screen.queryByRole('button', { name: 'End turn' })).toBeNull();
  });

  it('once a unit is activated, other units are locked and the active one is marked', () => {
    // Two side-0 units; activate the first with a legal move.
    const start = buildMatch(
      'skirmish',
      [
        { side: 0, picks: [{ raceKey: 'Human', classKey: 'Warrior' }, { raceKey: 'Human', classKey: 'Warrior' }] },
        warrior(1),
      ],
      providers,
      { seed: 1 },
    );
    const firstMove = legalActions(start, 0, providers).find(
      (a): a is MoveAction => a.type === 'move' && a.tokenId === 's0-u0',
    )!;
    const activated = applyAction(start, firstMove, createRng(1), providers);
    expect(activated.activatedTokenId).toBe('s0-u0');

    render(<Arena state={activated} controllableSide={0} legalActionsFor={legalFor(activated)} onAct={() => {}} />);

    // The activated unit's cell is marked.
    expect(document.querySelectorAll('.kt-cell--activated')).toHaveLength(1);

    // Clicking the locked unit selects nothing → no move highlights appear.
    const locked = activated.tokens.find((t) => t.instanceId === 's0-u1')!;
    fireEvent.click(screen.getByLabelText(new RegExp(`\\(${locked.pos.x},${locked.pos.y}\\)`)));
    expect(document.querySelectorAll('.kt-cell--move')).toHaveLength(0);
  });
});
