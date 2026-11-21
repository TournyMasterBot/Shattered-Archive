import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import { CombatStep } from './CombatStep';
import type { BuffRow } from '../../features/autoleveling/autoleveling-user-data';

jest.mock('../../features/autoleveling/autoleveling-user-data', () => ({
  getBuffOverlayOrNull: jest.fn().mockResolvedValue([]),
  getFightOverlayOrNull: jest.fn().mockResolvedValue([]),
  getLearnedCooldown: jest.fn().mockResolvedValue(null),
  setBuffOverlay: jest.fn().mockResolvedValue(undefined),
  setFightOverlay: jest.fn().mockResolvedValue(undefined),
  setPrefs: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../features/autoleveling/autoleveling-classes', () => ({
  getClassCatalog: jest.fn().mockResolvedValue([]),
  abilitiesForClass: jest.fn(() => []),
  classOffensiveAbilities: jest.fn(() => []),
  classByName: jest.fn(),
  COMBAT_SKILL_NAMES: ['bash', 'kick'],
}));

// L6 / SETTINGS-07 through the real control: switching a buff's recast mode must not lose the gates the player set on it.

const ROW: BuffRow = {
  label: 'Haste',
  cmd: "cast 'haste'",
  affect: 'haste',
  vitalsGate: { stat: 'mp', op: 'above', pct: 30 },
  onceKey: 'fight',
  combatState: 'out',
  enemyGate: { op: 'below', band: 50 },
  retryUntilSet: false,
};

async function renderWith(buffs: BuffRow[]) {
  const onPatch = jest.fn();
  render(
    <CombatStep
      {...({
        areaSlug: 'area-a',
        charName: null,
        charLevel: null,
        playerClass: null,
        initiationCommand: '',
        buffs,
        fightCommands: [],
        playerAlignment: 'neutral',
        onPatch,
      } as React.ComponentProps<typeof CombatStep>)}
    />,
  );
  await act(async () => {});
  return onPatch;
}

describe('switching a buff row recast mode keeps its gates', () => {
  it.each([
    ['every N ticks', 'refreshTicks'],
    ['every round', null],
  ] as const)('%s keeps the vitals gate, the fire limit, the combat state, the enemy gate and the retry switch', async (button, own) => {
    const onPatch = await renderWith([ROW]);
    fireEvent.click(screen.getByRole('button', { name: button }));

    const patched = onPatch.mock.calls.at(-1)?.[0] as { buffs: BuffRow[] };
    expect(patched.buffs).toHaveLength(1);
    expect(patched.buffs[0]).toMatchObject({
      label: 'Haste',
      cmd: "cast 'haste'",
      vitalsGate: ROW.vitalsGate,
      onceKey: 'fight',
      combatState: 'out',
      enemyGate: ROW.enemyGate,
      retryUntilSet: false,
    });
    expect(patched.buffs[0]).not.toHaveProperty('affect');
    if (own) expect(patched.buffs[0]).toHaveProperty(own);
  });
});
