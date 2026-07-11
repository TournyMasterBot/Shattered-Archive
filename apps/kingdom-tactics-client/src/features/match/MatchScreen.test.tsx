import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { buildMatch, type ArmyRoster } from '@shatteredarchive/kingdom-tactics-engine';

import { NavProvider, type MatchStartPayload } from '../../state/nav';
import { providers } from '../../state/providers';
import { MatchScreen, matchOutcome } from './MatchScreen';

const warrior = (side: number, n: number): ArmyRoster => ({
  side,
  name: side === 0 ? 'You' : 'Greedy AI',
  picks: Array.from({ length: n }, () => ({ raceKey: 'Human', classKey: 'Warrior' })),
});

const renderMatch = (payload?: MatchStartPayload) =>
  render(
    <NavProvider>
      <MatchScreen payload={payload} />
    </NavProvider>,
  );

afterEach(cleanup);

describe('matchOutcome', () => {
  it('maps a decided winner to the given side view', () => {
    const base = buildMatch('duel', [warrior(0, 1), warrior(1, 1)], providers, { seed: 1 });
    expect(matchOutcome(base, 0)).toBeNull();
    expect(matchOutcome({ ...base, status: 'decided', winner: 0 }, 0)).toBe('victory');
    expect(matchOutcome({ ...base, status: 'decided', winner: 1 }, 0)).toBe('defeat');
    expect(matchOutcome({ ...base, status: 'decided', winner: 'draw' }, 0)).toBe('draw');
  });
});

describe('MatchScreen', () => {
  it('renders the HUD for the default Quick Match', () => {
    renderMatch(); // falls back to QUICK_MATCH_SETUP
    expect(screen.getByText(/Turn 1/)).toBeTruthy();
    expect(screen.getByText('You: 2')).toBeTruthy();
    expect(screen.getByText('Greedy AI: 2')).toBeTruthy();
  });

  it('drives to a decided banner (idle human vs a stronger Greedy AI ⇒ Defeat)', () => {
    // Human fields one unit and only ends turns; the AI has two and routs it.
    renderMatch({ modeId: 'skirmish', seed: 3, rosters: [warrior(0, 1), warrior(1, 2)] });

    let guard = 0;
    while (screen.queryByRole('button', { name: 'End turn' }) && guard++ < 500) {
      fireEvent.click(screen.getByRole('button', { name: 'End turn' }));
    }

    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.getByText('Defeat')).toBeTruthy();
    // Rematch restores a playable board.
    fireEvent.click(screen.getByRole('button', { name: 'Rematch' }));
    expect(screen.getByRole('button', { name: 'End turn' })).toBeTruthy();
  });

  it('hot-seat runs two human seats with no AI', () => {
    const hotSeat: MatchStartPayload = {
      modeId: 'skirmish',
      seed: 1,
      hotSeat: true,
      rosters: [
        { side: 0, name: 'P1', picks: [{ raceKey: 'Human', classKey: 'Warrior' }] },
        { side: 1, name: 'P2', picks: [{ raceKey: 'Human', classKey: 'Warrior' }] },
      ],
    };
    renderMatch(hotSeat);
    expect(screen.getByText('Active: P1')).toBeTruthy();
    // Ending P1's turn hands control to P2 (no AI auto-plays it back to P1).
    fireEvent.click(screen.getByRole('button', { name: 'End turn' }));
    expect(screen.getByText('Active: P2')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'End turn' })).toBeTruthy();
  });
});
