import { act, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';

import { CombatStep } from './CombatStep';
import { classOffensiveAbilities, getClassCatalog } from '../../features/autoleveling/autoleveling-classes';
import {
  getBuffOverlayOrNull,
  getFightOverlayOrNull,
  getLearnedCooldown,
} from '../../features/autoleveling/autoleveling-user-data';

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
  classByName: jest.fn((cs: { name: string }[], n: string) => cs.find((c) => c.name.toLowerCase() === n.trim().toLowerCase())),
  COMBAT_SKILL_NAMES: ['bash', 'kick'],
}));

// The buff cards and fight-command rows of the Combat step: every control edits exactly its own field of exactly its own row, the
// recast-gate switch rebuilds the row without losing what belongs to it, and the pickers add the right rows.

type StepProps = React.ComponentProps<typeof CombatStep>;

const props = (over: Partial<StepProps> = {}): StepProps =>
  ({
    areaSlug: 'area-a',
    charName: null,
    charLevel: 30,
    playerClass: 'Cleric',
    initiationCommand: '',
    buffs: [],
    fightCommands: [],
    playerAlignment: 'neutral',
    onPatch: jest.fn(),
    ...over,
  }) as StepProps;

async function mount(over: Partial<StepProps> = {}) {
  const onPatch = jest.fn();
  const utils = render(<CombatStep {...props({ onPatch, ...over })} />);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return { onPatch, ...utils };
}

const lastPatch = (onPatch: jest.Mock) => onPatch.mock.calls[onPatch.mock.calls.length - 1][0];
const ability = (name: string, type: 'skill' | 'spell' | 'song', level: number) => ({ name, type, level, groups: [] as string[] });

const SANC = { label: 'Sanctuary', cmd: "cast 'sanctuary'", affect: 'sanctuary', inCombatCmd: 'quaff x', holdNearLevel: true };
const ARMOR = { label: 'Armor', cmd: "cast 'armor'", affect: 'armor' };
const BERSERK = { label: 'Berserk', cmd: 'berserk', refreshTicks: 6 };
const EVERY = { label: 'Every', cmd: 'bless' };

beforeEach(() => {
  jest.mocked(getClassCatalog).mockResolvedValue([]);
  jest.mocked(getBuffOverlayOrNull).mockResolvedValue([]);
  jest.mocked(getFightOverlayOrNull).mockResolvedValue([]);
  jest.mocked(getLearnedCooldown).mockResolvedValue(null);
  jest.mocked(classOffensiveAbilities).mockImplementation((() => []) as never);
  jest.requireMock('../../features/autoleveling/autoleveling-classes').abilitiesForClass.mockImplementation(() => []);
});

describe('buff cards', () => {
  it('adds an empty affect-gated buff', async () => {
    const { onPatch } = await mount({ buffs: [ARMOR] as never });
    fireEvent.click(screen.getByRole('button', { name: '+ add buff' }));
    expect(lastPatch(onPatch)).toEqual({ buffs: [ARMOR, { label: '', cmd: '', affect: '' }] });
  });

  it('edits the label, the command, the affect name and the in-combat action of its own row only', async () => {
    const { onPatch } = await mount({ buffs: [ARMOR, SANC] as never });
    fireEvent.change(screen.getAllByPlaceholderText(/^label/)[1], { target: { value: 'Sanc!' } });
    expect(lastPatch(onPatch).buffs).toEqual([ARMOR, { ...SANC, label: 'Sanc!' }]);
    fireEvent.change(screen.getAllByPlaceholderText(/^command/)[0], { target: { value: 'cast arm' } });
    expect(lastPatch(onPatch).buffs).toEqual([{ ...ARMOR, cmd: 'cast arm' }, SANC]);
    fireEvent.change(screen.getByLabelText('Affect name for buff 1'), { target: { value: 'armour' } });
    expect(lastPatch(onPatch).buffs[0].affect).toBe('armour');
    fireEvent.change(screen.getByLabelText('In-combat action for buff 2'), { target: { value: 'brandish staff' } });
    expect(lastPatch(onPatch).buffs[1].inCombatCmd).toBe('brandish staff');
  });

  it('the hold-near-level checkbox sets and clears the flag', async () => {
    const { onPatch } = await mount({ buffs: [{ ...ARMOR, holdNearLevel: true }] as never });
    const box = screen.getByRole('checkbox', { name: /let fall near level-up/ });
    expect(box).toBeChecked();
    fireEvent.click(box);
    expect(lastPatch(onPatch).buffs[0].holdNearLevel).toBe(false);
  });

  it('switching the recast gate rebuilds the row: affect -> ticks drops the affect extras, keeps label, command and unverified', async () => {
    const { onPatch } = await mount({ buffs: [{ ...SANC, unverified: true }] as never });
    const group = screen.getByRole('group', { name: 'Recast gate for buff 1' });
    fireEvent.click(within(group).getByRole('button', { name: 'every N ticks' }));
    expect(lastPatch(onPatch).buffs[0]).toEqual({ label: 'Sanctuary', cmd: "cast 'sanctuary'", refreshTicks: 6, unverified: true });
  });

  it('ticks -> always keeps only label and command; always -> affect starts with an empty affect; affect -> affect keeps its extras', async () => {
    const ticks = await mount({ buffs: [BERSERK] as never });
    fireEvent.click(within(screen.getByRole('group', { name: 'Recast gate for buff 1' })).getByRole('button', { name: 'every round' }));
    expect(lastPatch(ticks.onPatch).buffs[0]).toEqual({ label: 'Berserk', cmd: 'berserk' });
    ticks.unmount();

    const always = await mount({ buffs: [EVERY] as never });
    fireEvent.click(within(screen.getByRole('group', { name: 'Recast gate for buff 1' })).getByRole('button', { name: 'affect drops' }));
    expect(lastPatch(always.onPatch).buffs[0]).toEqual({ label: 'Every', cmd: 'bless', affect: '' });
    always.unmount();

    const affect = await mount({ buffs: [SANC] as never });
    fireEvent.click(within(screen.getByRole('group', { name: 'Recast gate for buff 1' })).getByRole('button', { name: 'affect drops' }));
    expect(lastPatch(affect.onPatch).buffs[0]).toEqual(SANC);
  });

  it('a tick-gated buff edits its interval; a nonsense value falls back instead of breaking the row', async () => {
    const { onPatch } = await mount({ buffs: [BERSERK] as never });
    const input = screen.getByLabelText('Tick interval for buff 1');
    fireEvent.change(input, { target: { value: '9' } });
    expect(lastPatch(onPatch).buffs[0].refreshTicks).toBe(9);
    fireEvent.change(input, { target: { value: '0' } });
    expect(lastPatch(onPatch).buffs[0].refreshTicks).toBeGreaterThanOrEqual(1);
  });

  it('shows the unverified tag on a guessed row', async () => {
    await mount({ buffs: [{ ...ARMOR, unverified: true }] as never });
    expect(screen.getByText('unverified')).toBeInTheDocument();
  });

  it('reorders: the first row cannot move up, the last cannot move down, a move swaps neighbours', async () => {
    const { onPatch } = await mount({ buffs: [ARMOR, SANC] as never });
    expect(screen.getByRole('button', { name: 'Move buff 1 up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move buff 2 down' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Move buff 1 down' }));
    expect(lastPatch(onPatch).buffs).toEqual([SANC, ARMOR]);
  });

  it('removes only the chosen row', async () => {
    const { onPatch } = await mount({ buffs: [ARMOR, SANC] as never });
    fireEvent.click(screen.getByRole('button', { name: 'Remove buff 1' }));
    expect(lastPatch(onPatch).buffs).toEqual([SANC]);
  });

  it('the fire-limit and vitals gates edit the row: enable, change stat, direction and percentage (clamped), disable', async () => {
    const { onPatch, rerender } = await mount({ buffs: [ARMOR] as never });
    fireEvent.click(within(screen.getByRole('group', { name: 'Fire limit for buff 1' })).getByRole('button', { name: 'once per round' }));
    expect(lastPatch(onPatch).buffs[0].onceKey).toBe('round');
    fireEvent.click(within(screen.getByRole('group', { name: 'Fire limit for buff 1' })).getByRole('button', { name: 'once per fight' }));
    expect(lastPatch(onPatch).buffs[0].onceKey).toBe('fight');
    fireEvent.click(within(screen.getByRole('group', { name: 'Fire limit for buff 1' })).getByRole('button', { name: 'no limit' }));
    expect(lastPatch(onPatch).buffs[0].onceKey).toBeUndefined();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Enable vitals gate for buff 1' }));
    expect(lastPatch(onPatch).buffs[0].vitalsGate).toEqual({ stat: 'hp', op: 'below', pct: 50 });

    const gated = { ...ARMOR, vitalsGate: { stat: 'hp', op: 'below', pct: 50 } };
    rerender(<CombatStep {...props({ onPatch, buffs: [gated] as never })} />);
    fireEvent.change(screen.getByLabelText('Vitals gate stat for buff 1'), { target: { value: 'mp' } });
    expect(lastPatch(onPatch).buffs[0].vitalsGate).toEqual({ stat: 'mp', op: 'below', pct: 50 });
    fireEvent.click(within(screen.getByRole('group', { name: 'Vitals gate direction for buff 1' })).getByRole('button', { name: 'above' }));
    expect(lastPatch(onPatch).buffs[0].vitalsGate.op).toBe('above');
    fireEvent.click(within(screen.getByRole('group', { name: 'Vitals gate direction for buff 1' })).getByRole('button', { name: 'below' }));
    expect(lastPatch(onPatch).buffs[0].vitalsGate.op).toBe('below');
    fireEvent.change(screen.getByLabelText('Vitals gate percentage for buff 1'), { target: { value: '250' } });
    expect(lastPatch(onPatch).buffs[0].vitalsGate.pct).toBe(100);
    fireEvent.change(screen.getByLabelText('Vitals gate percentage for buff 1'), { target: { value: '-5' } });
    expect(lastPatch(onPatch).buffs[0].vitalsGate.pct).toBe(1);
    fireEvent.change(screen.getByLabelText('Vitals gate percentage for buff 1'), { target: { value: '' } });
    expect(lastPatch(onPatch).buffs[0].vitalsGate.pct).toBe(1); // empty reads as 0 -> clamped, never NaN

    rerender(<CombatStep {...props({ onPatch, buffs: [gated] as never })} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Enable vitals gate for buff 1' }));
    expect(lastPatch(onPatch).buffs[0].vitalsGate).toBeUndefined();
  });
});

describe('buff picker (class abilities)', () => {
  const abilities = [ability('Sanctuary', 'spell', 20), ability('Rage', 'skill', 5), ability('Chant', 'song', 7), ability('Mystery', 'spell', 9)];
  const pick = (label: RegExp) => {
    fireEvent.focus(screen.getByLabelText('Add buff from class abilities'));
    fireEvent.mouseDown(screen.getByRole('option', { name: label }));
  };
  beforeEach(() => {
    jest.mocked(getClassCatalog).mockResolvedValue([{ name: 'Cleric', isReclass: false, abilities }] as never);
    jest.requireMock('../../features/autoleveling/autoleveling-classes').abilitiesForClass.mockImplementation(() => abilities);
  });

  it('a catalog ability becomes the verified row; a duplicate is ignored', async () => {
    const { onPatch, rerender } = await mount();
    pick(/^Sanctuary/);
    expect(lastPatch(onPatch).buffs[0]).toMatchObject({ label: 'Sanctuary', cmd: "cast 'sanctuary'", affect: 'sanctuary' });
    onPatch.mockClear();
    rerender(<CombatStep {...props({ onPatch, buffs: [SANC] as never })} />);
    pick(/^Sanctuary/);
    expect(onPatch).not.toHaveBeenCalled();
  });

  it('an ability with no catalog entry becomes an UNVERIFIED guess: a skill tick-gated, a spell affect-gated', async () => {
    const skill = await mount();
    pick(/^Rage/);
    expect(lastPatch(skill.onPatch).buffs[0]).toEqual({ label: 'Rage', cmd: 'rage', refreshTicks: 6, unverified: true });
    skill.unmount();
    const spell = await mount();
    pick(/^Mystery/);
    expect(lastPatch(spell.onPatch).buffs[0]).toEqual({ label: 'Mystery', cmd: "cast 'mystery'", affect: 'mystery', unverified: true });
  });
});

describe('fight command rows', () => {
  const BASH = { cmd: 'bash', cooldownSec: 8 };
  const KICK = { cmd: 'kick', cooldownSec: 0 };

  it('adds an empty command with no cooldown', async () => {
    const { onPatch } = await mount({ fightCommands: [BASH] as never });
    fireEvent.click(screen.getByRole('button', { name: '+ add command' }));
    expect(lastPatch(onPatch)).toEqual({ fightCommands: [BASH, { cmd: '', cooldownSec: 0 }] });
  });

  it('edits the command and the cooldown of its own row; a bad cooldown becomes 0 and a negative one 0', async () => {
    const { onPatch } = await mount({ fightCommands: [BASH, KICK] as never });
    fireEvent.change(screen.getAllByPlaceholderText(/^command — e\.g\. bash/)[1], { target: { value: 'kick hard' } });
    expect(lastPatch(onPatch).fightCommands).toEqual([BASH, { ...KICK, cmd: 'kick hard' }]);
    fireEvent.change(screen.getByLabelText('Cooldown seconds for command 1'), { target: { value: '12' } });
    expect(lastPatch(onPatch).fightCommands[0].cooldownSec).toBe(12);
    fireEvent.change(screen.getByLabelText('Cooldown seconds for command 1'), { target: { value: '-3' } });
    expect(lastPatch(onPatch).fightCommands[0].cooldownSec).toBe(0);
    fireEvent.change(screen.getByLabelText('Cooldown seconds for command 1'), { target: { value: '' } });
    expect(lastPatch(onPatch).fightCommands[0].cooldownSec).toBe(0);
  });

  it('reorders and removes', async () => {
    const { onPatch } = await mount({ fightCommands: [BASH, KICK] as never });
    expect(screen.getByRole('button', { name: 'Move fight command 1 up' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Move fight command 1 down' }));
    expect(lastPatch(onPatch).fightCommands).toEqual([KICK, BASH]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove command 2' }));
    expect(lastPatch(onPatch).fightCommands).toEqual([BASH]);
  });

  it('the fire-limit and vitals gates edit the fight row', async () => {
    const { onPatch } = await mount({ fightCommands: [BASH] as never });
    fireEvent.click(within(screen.getByRole('group', { name: 'Fire limit for fight command 1' })).getByRole('button', { name: 'once per fight' }));
    expect(lastPatch(onPatch).fightCommands[0].onceKey).toBe('fight');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Enable vitals gate for fight command 1' }));
    expect(lastPatch(onPatch).fightCommands[0].vitalsGate).toEqual({ stat: 'hp', op: 'below', pct: 50 });
  });

  it('says so when there are none, and needs a class before it offers abilities', async () => {
    await mount({ fightCommands: [], playerClass: null });
    expect(screen.getByText(/Pick your class above/)).toBeInTheDocument();
  });
});

describe('fight picker (class offensive abilities)', () => {
  const offense = [ability('Harm', 'spell', 23), ability('Bash', 'skill', 1)];
  const pick = (label: RegExp) => {
    fireEvent.focus(screen.getByLabelText('Add fight ability'));
    fireEvent.mouseDown(screen.getByRole('option', { name: label }));
  };
  beforeEach(() => {
    jest.mocked(getClassCatalog).mockResolvedValue([{ name: 'Cleric', isReclass: false, abilities: offense }] as never);
    jest.mocked(classOffensiveAbilities).mockImplementation((() => offense) as never);
  });

  it('adds a skill as its bare name and a spell as a cast, with a cooldown the engine already learned', async () => {
    jest.mocked(getLearnedCooldown).mockImplementation(async (cmd: string) => (cmd === 'bash' ? 8 : null));
    const skill = await mount();
    pick(/^Bash/);
    await act(async () => {
      await Promise.resolve();
    });
    expect(lastPatch(skill.onPatch).fightCommands).toEqual([{ cmd: 'bash', cooldownSec: 8 }]);
    skill.unmount();

    const spell = await mount();
    pick(/^Harm/);
    await act(async () => {
      await Promise.resolve();
    });
    expect(lastPatch(spell.onPatch).fightCommands).toEqual([{ cmd: "cast 'harm' {name}", cooldownSec: 0 }]);
  });

  it('ignores an ability already in the list', async () => {
    const { onPatch } = await mount({ fightCommands: [{ cmd: 'bash', cooldownSec: 0 }] as never });
    pick(/^Bash/);
    await act(async () => {
      await Promise.resolve();
    });
    expect(onPatch).not.toHaveBeenCalled();
  });
});

describe('class change and level controls', () => {
  it('the engage command box and the alignment buttons patch the draft', async () => {
    const { onPatch } = await mount();
    fireEvent.change(screen.getByPlaceholderText('kill {name}'), { target: { value: 'k {name}' } });
    expect(onPatch).toHaveBeenCalledWith({ initiationCommand: 'k {name}' });
    fireEvent.click(screen.getByRole('button', { name: 'Evil' }));
    expect(onPatch).toHaveBeenCalledWith({ playerAlignment: 'evil' });
  });

  it('shows the level and name when known, and a dash when not', async () => {
    const known = await mount({ charLevel: 42, charName: 'Tester' });
    expect(screen.getByText(/42 · Tester/)).toBeInTheDocument();
    known.unmount();
    await mount({ charLevel: null });
    expect(screen.getByText('—', { selector: 'span' })).toBeInTheDocument();
  });
});
