import { act, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';

import { CombatStep } from './CombatStep';
import { ReviewStep } from './ReviewStep';
import { emptyDraft } from './useWizardDraft';
import { bandLabel } from '../../features/autoleveling/autoleveling-enemy-condition';
import type { BuffRow, FightRow } from '../../features/autoleveling/autoleveling-user-data';

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

// The new row options in the Combat step (live findings 2026-11-14, items 2, 8, 9, 12): where a row may be sent from, the enemy's
// condition, the retry switch, and the notice for a command that still has something to fill in. Each control writes its field and
// clears it again (a cleared option is ABSENT from the row, not stored as nothing: SETTINGS-01).

const BUFF: BuffRow = { label: 'Bless', cmd: "cast 'bless'", affect: 'bless' };
const FIGHT: FightRow = { cmd: 'kick', cooldownSec: 2 };

async function renderStep(over: { buffs?: BuffRow[]; fightCommands?: FightRow[] } = {}) {
  const onPatch = jest.fn();
  render(
    <CombatStep
      {...({
        areaSlug: 'area-a',
        charName: null,
        charLevel: null,
        playerClass: 'Warrior',
        initiationCommand: '',
        buffs: [],
        fightCommands: [],
        playerAlignment: 'neutral',
        onPatch,
        ...over,
      } as React.ComponentProps<typeof CombatStep>)}
    />,
  );
  await act(async () => {});
  return onPatch;
}

const last = (onPatch: jest.Mock, key: 'buffs' | 'fightCommands') => (onPatch.mock.calls.filter((c) => key in c[0]).at(-1)?.[0] as Record<string, any[]>)[key];

describe('combat state of a buff row (L8)', () => {
  it('writes "only out of combat" and "only in combat", and "any time" removes the field', async () => {
    const onPatch = await renderStep({ buffs: [BUFF] });
    fireEvent.click(screen.getByRole('button', { name: 'only out of combat' }));
    expect(last(onPatch, 'buffs')[0].combatState).toBe('out');
    fireEvent.click(screen.getByRole('button', { name: 'only in combat' }));
    expect(last(onPatch, 'buffs')[0].combatState).toBe('in');
  });

  it('shows the current choice as pressed, and any time clears it', async () => {
    const onPatch = await renderStep({ buffs: [{ ...BUFF, combatState: 'out' }] });
    expect(screen.getByRole('button', { name: 'only out of combat' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'any time' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'any time' }));
    expect(last(onPatch, 'buffs')[0]).not.toHaveProperty('combatState');
  });
});

describe('enemy condition gate of a buff row (L12)', () => {
  it('starts as "below" the 50% phrase, can be switched to above and to another phrase, and unchecking removes it', async () => {
    const onPatch = await renderStep({ buffs: [BUFF] });
    fireEvent.click(screen.getByLabelText('Enable enemy condition gate for buff 1'));
    expect(last(onPatch, 'buffs')[0].enemyGate).toEqual({ op: 'below', band: 50 });
  });

  it('edits an existing gate: direction and phrase', async () => {
    const onPatch = await renderStep({ buffs: [{ ...BUFF, enemyGate: { op: 'below', band: 50 } }] });
    fireEvent.click(within(screen.getByRole('group', { name: 'Enemy condition direction for buff 1' })).getByRole('button', { name: 'above' }));
    expect(last(onPatch, 'buffs')[0].enemyGate).toEqual({ op: 'above', band: 50 });
    fireEvent.change(screen.getByLabelText('Enemy condition for buff 1'), { target: { value: '30' } });
    expect(last(onPatch, 'buffs')[0].enemyGate).toEqual({ op: 'below', band: 30 });
  });

  it('unchecking removes the gate from the row', async () => {
    const onPatch = await renderStep({ buffs: [{ ...BUFF, enemyGate: { op: 'above', band: 15 } }] });
    fireEvent.click(screen.getByLabelText('Enable enemy condition gate for buff 1'));
    expect(last(onPatch, 'buffs')[0]).not.toHaveProperty('enemyGate');
  });

  it('offers the seven phrases, each with its approximate percent after it, best condition first', async () => {
    await renderStep({ buffs: [{ ...BUFF, enemyGate: { op: 'below', band: 50 } }] });
    const options = within(screen.getByLabelText('Enemy condition for buff 1')).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([100, 90, 75, 50, 30, 15, 0].map((b) => bandLabel(b as 100)));
    expect(options.every((o) => /\(about \d+%\)$/.test(o.textContent ?? ''))).toBe(true);
  });
});

describe('retry switch of an affect buff (item 2)', () => {
  it('is on by default; unchecking stores false, checking again removes the field (SETTINGS-01)', async () => {
    const onPatch = await renderStep({ buffs: [BUFF] });
    const box = screen.getByLabelText('Retry until the affect shows for buff 1');
    expect(box).toBeChecked();
    fireEvent.click(box);
    expect(last(onPatch, 'buffs')[0].retryUntilSet).toBe(false);
  });

  it('shows as off for a row that has it switched off, and switching on removes the field', async () => {
    const onPatch = await renderStep({ buffs: [{ ...BUFF, retryUntilSet: false }] });
    const box = screen.getByLabelText('Retry until the affect shows for buff 1');
    expect(box).not.toBeChecked();
    fireEvent.click(box);
    expect(last(onPatch, 'buffs')[0]).not.toHaveProperty('retryUntilSet');
  });

  it('is only offered on a buff that is checked by its affect', async () => {
    await renderStep({ buffs: [{ label: 'Berserk', cmd: 'berserk', refreshTicks: 6 }] });
    expect(screen.queryByLabelText('Retry until the affect shows for buff 1')).toBeNull();
  });
});

describe('fight rows carry the same options', () => {
  it('combat state and enemy gate are written to the fight list', async () => {
    const onPatch = await renderStep({ fightCommands: [FIGHT] });
    fireEvent.click(screen.getByRole('button', { name: 'only in combat' }));
    expect(last(onPatch, 'fightCommands')[0]).toMatchObject({ cmd: 'kick', combatState: 'in' });
    fireEvent.click(screen.getByLabelText('Enable enemy condition gate for fight command 1'));
    expect(last(onPatch, 'fightCommands')[0].enemyGate).toEqual({ op: 'below', band: 50 });
  });

  it('a fight row has no retry switch', async () => {
    await renderStep({ fightCommands: [FIGHT] });
    expect(screen.queryByLabelText(/Retry until the affect shows/)).toBeNull();
  });
});

describe('a command that still has something to fill in is flagged (CMDTPL-01, L3, L4)', () => {
  it('flags a buff in-combat command with a <placeholder>, and the buff command itself', async () => {
    await renderStep({ buffs: [{ ...BUFF, inCombatCmd: 'quaff <potion>' }, { label: 'x', cmd: 'cast y {oops}', refreshTicks: 3 }] });
    const notes = screen.getAllByRole('note').map((n) => n.textContent);
    expect(notes.some((t) => t?.includes('"quaff <potion>" still has <potion> to fill in'))).toBe(true);
    expect(notes.some((t) => t?.includes('still has {oops} to fill in'))).toBe(true);
  });

  it('flags a fight command with a placeholder', async () => {
    await renderStep({ fightCommands: [{ cmd: "cast 'x' <who>", cooldownSec: 0 }] });
    expect(screen.getByRole('note')).toHaveTextContent('still has <who> to fill in');
  });

  it('does not flag {name} (filled with the kill keyword), a complete item command or a colour code', async () => {
    await renderStep({
      buffs: [{ ...BUFF, inCombatCmd: 'quaff haste' }],
      fightCommands: [{ cmd: "cast 'fire' {name}", cooldownSec: 0 }, { cmd: 'say {Rhello', cooldownSec: 0 }],
    });
    expect(screen.queryAllByRole('note')).toEqual([]);
  });
});

describe('the Review step puts the new options in words', () => {
  const AREA = { slug: 'a', areaName: 'A', continent: 'C', areaId: 'A', levelRange: [1, 2], startRoom: '', speedwalkToStart: '', requiredActions: [], dirs: ['n'], notes: '', isExcellentLevelingArea: false, recommendedTargets: [] };

  it('lists combat state, enemy condition and a switched-off retry on buffs and fight commands', () => {
    render(
      <ReviewStep
        draft={{
          ...emptyDraft(),
          area: AREA as never,
          buffs: [{ ...BUFF, combatState: 'out', retryUntilSet: false }],
          fightCommands: [{ ...FIGHT, enemyGate: { op: 'above', band: 30 }, combatState: 'in' }],
        }}
        onPatch={jest.fn()}
      />,
    );
    const buffs = screen.getByText('Pre-round buffs', { selector: 'dt' }).closest('div') as HTMLElement;
    expect(buffs).toHaveTextContent('only out of combat');
    expect(buffs).toHaveTextContent('no retry');
    const fights = screen.getByText('Fight commands', { selector: 'dt' }).closest('div') as HTMLElement;
    expect(fights).toHaveTextContent('only in combat');
    expect(fights).toHaveTextContent('only when the enemy is above "has some big nasty wounds and scratches (about 30%)"');
  });

  it('says nothing extra for a row without the options', () => {
    render(<ReviewStep draft={{ ...emptyDraft(), area: AREA as never, buffs: [BUFF], fightCommands: [FIGHT] }} onPatch={jest.fn()} />);
    expect(screen.getByText('Fight commands', { selector: 'dt' }).closest('div')).not.toHaveTextContent('only');
  });
});
