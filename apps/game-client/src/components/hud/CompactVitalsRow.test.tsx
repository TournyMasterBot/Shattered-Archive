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

const HIDDEN_LEVEL_PROGRESS = { visible: false, pct: 0, level: null, tnl: null };
let mockLevelProgress: { visible: boolean; pct: number; level: number | null; tnl: number | null } =
  HIDDEN_LEVEL_PROGRESS;
jest.mock('../../hooks/useLevelProgress', () => ({
  useLevelProgress: () => mockLevelProgress,
}));

describe('CompactVitalsRow', () => {
  beforeEach(() => {
    mockAncillary = BASE_ANCILLARY;
    mockHasSanctuary = false;
    mockLevelProgress = HIDDEN_LEVEL_PROGRESS;
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

  describe('EXP (leveling) gauge', () => {
    it('is not rendered when level progress is hidden (max level or data not known yet)', () => {
      render(<CompactVitalsRow />);
      expect(screen.queryByText('EXP')).toBeNull();
      expect(document.querySelector('.sa-hud-vitals-fill-exp')).toBeNull();
    });

    it('renders next to the other gauges with the percent filled', () => {
      mockLevelProgress = { visible: true, pct: 62.4, level: 42, tnl: 1234 };
      render(<CompactVitalsRow />);

      expect(screen.getByText('EXP')).toBeInTheDocument();
      expect(screen.getByText('62%')).toBeInTheDocument();

      const fill = document.querySelector('.sa-hud-vitals-fill-exp') as HTMLElement;
      expect(fill).not.toBeNull();
      expect(fill.style.width).toBe('62.4%');
    });

    it('puts the exact exp-to-level and level in a tooltip', () => {
      mockLevelProgress = { visible: true, pct: 10, level: 42, tnl: 1234567 };
      render(<CompactVitalsRow />);

      expect(screen.getByTitle('Level 42 — 1,234,567 exp to next level')).toBeInTheDocument();
    });

    it('does not disturb the existing HP / Mana / MOVE gauges', () => {
      mockLevelProgress = { visible: true, pct: 10, level: 42, tnl: 500 };
      render(<CompactVitalsRow />);

      expect(screen.getByText('402 / 402')).toBeInTheDocument();
      expect(screen.getByText('233 / 233')).toBeInTheDocument();
      expect(screen.getByText('140 / 140')).toBeInTheDocument();
    });
  });
});
