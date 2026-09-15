import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CompactVitalsRow } from './CompactVitalsRow';

jest.mock('../../hooks/useLayoutShell', () => ({
  useStatusBlockViewModel: () => ({
    remaining: '4:12',
    vitals: { hp: 402, hpMax: 402, mp: 233, mpMax: 233, stamina: 140, staminaMax: 140 },
    hpPct: 100,
    mpPct: 100,
    staPct: 100,
  }),
}));

jest.mock('../../hooks/useOpponentStatus', () => ({
  useOpponentStatus: () => ({
    enemyUi: { lastSeenTs: 0, label: 'Enemy', pct: 0, statusText: '' },
    isEnemyActive: false,
    damageChunk: null,
  }),
}));

describe('CompactVitalsRow', () => {
  it('shows legible X / Y text for HP, Mana, and Move', () => {
    render(<CompactVitalsRow />);

    expect(screen.getByText('402 / 402')).toBeInTheDocument(); // HP
    expect(screen.getByText('233 / 233')).toBeInTheDocument(); // Mana
    expect(screen.getByText('140 / 140')).toBeInTheDocument(); // Move (Stamina, relabeled)
  });

  it('labels the third gauge MOVE, not Stam', () => {
    render(<CompactVitalsRow />);
    expect(screen.getByText('MOVE')).toBeInTheDocument();
    expect(screen.queryByText('Stam')).toBeNull();
  });

  it('does not render an enemy row when no opponent is active', () => {
    render(<CompactVitalsRow />);
    expect(screen.queryByText(/enemy/i)).toBeNull();
  });
});
