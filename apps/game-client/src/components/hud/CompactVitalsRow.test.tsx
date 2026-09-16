import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CompactVitalsRow } from './CompactVitalsRow';

const BASE_ANCILLARY = {
  carryWeight: null,
  carryWeightMax: null,
  carryWeightPct: null,
  isQuiet: false,
  isFlying: false,
  isRiding: false,
  isFighting: false,
  language: null,
};

let mockAncillary = BASE_ANCILLARY;
jest.mock('../../hooks/useLayoutShell', () => ({
  useStatusBlockViewModel: () => ({
    remaining: '4:12',
    vitals: { hp: 402, hpMax: 402, mp: 233, mpMax: 233, stamina: 140, staminaMax: 140 },
    hpPct: 100,
    mpPct: 100,
    staPct: 100,
    get ancillary() {
      return mockAncillary;
    },
  }),
}));

jest.mock('../../hooks/useOpponentStatus', () => ({
  useOpponentStatus: () => ({
    enemyUi: { lastSeenTs: 0, label: 'Enemy', pct: 0, statusText: '' },
    isEnemyActive: false,
    damageChunk: null,
  }),
}));

let mockHasSanctuary = false;
jest.mock('../../hooks/useSanctuaryActive', () => ({
  useSanctuaryActive: () => ({
    get hasSanctuary() {
      return mockHasSanctuary;
    },
  }),
}));

describe('CompactVitalsRow', () => {
  beforeEach(() => {
    mockAncillary = BASE_ANCILLARY;
    mockHasSanctuary = false;
  });

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

  it('shows the next-tick countdown', () => {
    render(<CompactVitalsRow />);
    expect(screen.getByTitle('Next tick')).toHaveTextContent('4:12');
  });

  it('shows no status row when nothing is notable', () => {
    render(<CompactVitalsRow />);
    expect(screen.queryByTitle('Flying')).toBeNull();
    expect(screen.queryByTitle('Quiet (deafened)')).toBeNull();
  });

  it('shows status pieces when the character has notable ancillary state', () => {
    mockAncillary = { ...BASE_ANCILLARY, isFlying: true, isQuiet: true };
    render(<CompactVitalsRow />);
    expect(screen.getByTitle('Flying')).toHaveTextContent('🪽');
    expect(screen.getByTitle('Quiet (deafened)')).toHaveTextContent('🔇');
  });

  it('does not mark the HP track as sanctuary-active by default', () => {
    render(<CompactVitalsRow />);
    const hpFill = document.querySelector('.sa-hud-vitals-fill-hp');
    expect(hpFill?.parentElement).toHaveAttribute('data-sanctuary', 'false');
  });

  it('marks the HP track as sanctuary-active when the buff is up', () => {
    mockHasSanctuary = true;
    render(<CompactVitalsRow />);
    const hpFill = document.querySelector('.sa-hud-vitals-fill-hp');
    expect(hpFill?.parentElement).toHaveAttribute('data-sanctuary', 'true');
  });
});
