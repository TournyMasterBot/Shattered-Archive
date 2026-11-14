import { act, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';

import { CombatStep } from './CombatStep';
import { classOffensiveAbilities, getClassCatalog } from '../../features/autoleveling/autoleveling-classes';
import {
  getBuffOverlayOrNull,
  getFightOverlayOrNull,
  getLearnedCooldown,
  setBuffOverlay,
  setFightOverlay,
  setPrefs,
} from '../../features/autoleveling/autoleveling-user-data';

jest.mock('../../features/autoleveling/autoleveling-user-data', () => ({
  getBuffOverlayOrNull: jest.fn().mockResolvedValue(null),
  getFightOverlayOrNull: jest.fn().mockResolvedValue(null),
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

// Choosing a class pre-fills its buffs and fight commands from the DSL data, but only where nothing was ever saved: a saved set -
// even one the player emptied - always wins, rows already in the draft are never replaced, and seeded rows are not written until the
// player first edits them. An unavailable class list is announced instead of silently showing five classes.

type StepProps = React.ComponentProps<typeof CombatStep>;

function stepProps(over: Partial<StepProps> = {}): StepProps {
  return {
    areaSlug: 'area-a',
    charName: null,
    charLevel: null,
    playerClass: null,
    initiationCommand: '',
    buffs: [],
    fightCommands: [],
    playerAlignment: 'neutral',
    onPatch: jest.fn(),
    ...over,
  } as StepProps;
}

const ability = (name: string, type: 'skill' | 'spell' | 'song', level: number) => ({ name, type, level, groups: [] as string[] });
const CLERIC = {
  name: 'Cleric',
  isReclass: false,
  abilities: [ability('Sanctuary', 'spell', 20), ability('Armor', 'spell', 2), ability('Fly', 'spell', 10), ability('Stone Skin', 'spell', 40)],
};
const MAGE = { name: 'Mage', isReclass: false, abilities: [ability('Armor', 'spell', 2)] };
const SANCTUARY = { label: 'Sanctuary', cmd: "cast 'sanctuary'", affect: 'sanctuary', inCombatCmd: 'quaff <potion>' };
const ARMOR = { label: 'Armor', cmd: "cast 'armor'", affect: 'armor' };
const STONE_SKIN = { label: 'Stone Skin', cmd: "cast 'stone skin'", affect: 'stone skin' };

const settle = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

async function mount(over: Partial<StepProps> = {}) {
  const onPatch = jest.fn();
  const utils = render(<CombatStep {...stepProps({ onPatch, ...over })} />);
  await settle();
  await settle();
  await settle();
  return { onPatch, ...utils };
}

const fightPatch = (onPatch: jest.Mock) => onPatch.mock.calls.map((c) => c[0]).find((p) => 'fightCommands' in p);

beforeEach(() => {
  jest.mocked(getClassCatalog).mockResolvedValue([CLERIC, MAGE] as never);
  jest.mocked(getBuffOverlayOrNull).mockResolvedValue(null);
  jest.mocked(getFightOverlayOrNull).mockResolvedValue(null);
  jest.mocked(getLearnedCooldown).mockResolvedValue(null);
  jest.mocked(classOffensiveAbilities).mockImplementation(((_cs: unknown, name: string) =>
    name === 'Cleric' ? [ability('Harm', 'spell', 23), ability('Bash', 'skill', 1)] : []) as never);
  jest.mocked(setBuffOverlay).mockClear();
  jest.mocked(setFightOverlay).mockClear();
  jest.mocked(setPrefs).mockClear();
});

describe('CombatStep class pre-fill', () => {
  it("pre-fills the remembered class's verified buffs and fight commands when nothing was ever saved (E19)", async () => {
    const { onPatch } = await mount({ playerClass: 'Cleric', charLevel: 30 });

    expect(onPatch).toHaveBeenCalledTimes(1);
    expect(onPatch).toHaveBeenCalledWith({
      buffs: [SANCTUARY, ARMOR, { ...STONE_SKIN, disabled: true }], // Stone Skin is L40: listed, paused
      fightCommands: [
        { cmd: "cast 'harm' {name}", cooldownSec: 0 },
        { cmd: 'bash', cooldownSec: 0 },
      ],
    });
  });

  it('writes none of it: seeded rows stay in the draft until the player edits them (E19)', async () => {
    jest.useFakeTimers();
    try {
      await mount({ playerClass: 'Cleric', charLevel: 30 });
      act(() => {
        jest.advanceTimersByTime(5000);
      });
      expect(setBuffOverlay).not.toHaveBeenCalled();
      expect(setFightOverlay).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('uses a cooldown the engine already learned for a default fight command', async () => {
    jest.mocked(getLearnedCooldown).mockImplementation(async (cmd: string) => (cmd === 'bash' ? 8 : null));
    const { onPatch } = await mount({ playerClass: 'Cleric', charLevel: 30 });
    expect(onPatch.mock.calls[0][0].fightCommands).toEqual([
      { cmd: "cast 'harm' {name}", cooldownSec: 0 },
      { cmd: 'bash', cooldownSec: 8 },
    ]);
  });

  it('with no known level there is no level cap (E10)', async () => {
    const { onPatch } = await mount({ playerClass: 'Cleric', charLevel: null });
    expect(onPatch.mock.calls[0][0].buffs).toEqual([SANCTUARY, ARMOR, STONE_SKIN]);
  });

  it('never replaces a saved set, including one the player emptied (E19)', async () => {
    jest.mocked(getBuffOverlayOrNull).mockResolvedValue([]); // saved as empty
    jest.mocked(getFightOverlayOrNull).mockResolvedValue([{ cmd: 'kick', cooldownSec: 2 }]);
    const { onPatch } = await mount({ playerClass: 'Cleric', charLevel: 30 });
    expect(onPatch).not.toHaveBeenCalled();
  });

  it('seeds only the half that was never saved', async () => {
    jest.mocked(getBuffOverlayOrNull).mockResolvedValue([]); // buffs saved (empty)
    const { onPatch } = await mount({ playerClass: 'Cleric', charLevel: 30 });
    expect(Object.keys(onPatch.mock.calls[0][0])).toEqual(['fightCommands']);
  });

  it('seeds only the buffs when only the fight list was saved', async () => {
    jest.mocked(getFightOverlayOrNull).mockResolvedValue([]);
    const { onPatch } = await mount({ playerClass: 'Cleric', charLevel: 30 });
    expect(Object.keys(onPatch.mock.calls[0][0])).toEqual(['buffs']);
  });

  it('never replaces rows already in the draft, even when nothing is stored', async () => {
    const { onPatch } = await mount({
      playerClass: 'Cleric',
      charLevel: 30,
      buffs: [ARMOR],
      fightCommands: [{ cmd: 'kick', cooldownSec: 1 }],
    });
    expect(onPatch).not.toHaveBeenCalled();
  });

  it('seeds nothing for a class the catalog does not know, or when no class is chosen', async () => {
    const unknown = await mount({ playerClass: 'Mystery' });
    expect(unknown.onPatch).not.toHaveBeenCalled();
    unknown.unmount();
    const none = await mount({ playerClass: null });
    expect(none.onPatch).not.toHaveBeenCalled();
  });

  it('a class with no abilities seeds empty lists without failing (E9)', async () => {
    jest.mocked(getClassCatalog).mockResolvedValue([{ name: 'Blank', isReclass: false, abilities: [] }] as never);
    const { onPatch } = await mount({ playerClass: 'Blank' });
    expect(onPatch).toHaveBeenCalledWith({ buffs: [], fightCommands: [] });
  });

  it('seeds once per area and class, not again when the level arrives later', async () => {
    const { onPatch, rerender } = await mount({ playerClass: 'Cleric', charLevel: null });
    expect(onPatch).toHaveBeenCalledTimes(1);
    rerender(<CombatStep {...stepProps({ onPatch, playerClass: 'Cleric', charLevel: 30 })} />);
    await settle();
    expect(onPatch).toHaveBeenCalledTimes(1);
  });

  it('does not patch after the step unmounts mid-load', async () => {
    let release: (v: unknown) => void = () => undefined;
    jest.mocked(getBuffOverlayOrNull).mockReturnValue(new Promise((resolve) => (release = resolve)) as never);
    const onPatch = jest.fn();
    const { unmount } = render(<CombatStep {...stepProps({ onPatch, playerClass: 'Cleric', charLevel: 30 })} />);
    await settle();
    unmount();
    await act(async () => release(null));
    await settle();
    expect(onPatch).not.toHaveBeenCalled();
  });

  it('drops a pending seed when the player picks another class meanwhile', async () => {
    let release: (v: unknown) => void = () => undefined;
    jest.mocked(getBuffOverlayOrNull).mockReturnValueOnce(new Promise((resolve) => (release = resolve)) as never);
    const { onPatch } = await mount({ playerClass: 'Cleric', charLevel: 30 });
    fireEvent.change(screen.getByLabelText('Class'), { target: { value: 'Mage' } });
    await settle();
    await settle();
    onPatch.mockClear();
    await act(async () => release(null)); // the Cleric seed finally answers: it must not land
    await settle();
    expect(onPatch).not.toHaveBeenCalled();
  });
});

describe('CombatStep choosing a class', () => {
  it('loads defaults for a class with nothing saved, remembers the pick, and the buffs follow the class', async () => {
    const { onPatch } = await mount({ playerClass: null });
    fireEvent.change(screen.getByLabelText('Class'), { target: { value: 'Cleric' } });
    await settle();
    await settle();

    expect(setPrefs).toHaveBeenCalledWith({ playerClass: 'Cleric' });
    expect(onPatch).toHaveBeenCalledWith({ playerClass: 'Cleric' });
    const patch = fightPatch(onPatch);
    expect(patch.fightCommands.map((f: { cmd: string }) => f.cmd)).toEqual(["cast 'harm' {name}", 'bash']);
    expect(patch.buffs.map((b: { label: string }) => b.label)).toEqual(['Sanctuary', 'Armor', 'Stone Skin']);
  });

  it('with a saved fight list and a saved buff list it uses exactly what was saved', async () => {
    jest.mocked(getFightOverlayOrNull).mockResolvedValue([{ cmd: 'kick', cooldownSec: 3 }]);
    jest.mocked(getBuffOverlayOrNull).mockResolvedValue([ARMOR]);
    const { onPatch } = await mount({ playerClass: null });
    fireEvent.change(screen.getByLabelText('Class'), { target: { value: 'Cleric' } });
    await settle();
    await settle();
    expect(fightPatch(onPatch)).toEqual({ fightCommands: [{ cmd: 'kick', cooldownSec: 3 }] });
  });

  it('with a saved EMPTY fight list for that class it stays empty (E19)', async () => {
    jest.mocked(getFightOverlayOrNull).mockResolvedValue([]);
    jest.mocked(getBuffOverlayOrNull).mockResolvedValue([ARMOR]);
    const { onPatch } = await mount({ playerClass: null });
    fireEvent.change(screen.getByLabelText('Class'), { target: { value: 'Mage' } });
    await settle();
    await settle();
    expect(fightPatch(onPatch)).toEqual({ fightCommands: [] });
  });

  it('with a saved buff list but no fight list for the class, the defaults fill only the fight commands', async () => {
    jest.mocked(getBuffOverlayOrNull).mockResolvedValue([ARMOR]);
    const { onPatch } = await mount({ playerClass: null });
    fireEvent.change(screen.getByLabelText('Class'), { target: { value: 'Cleric' } });
    await settle();
    await settle();
    expect(Object.keys(fightPatch(onPatch))).toEqual(['fightCommands']);
  });

  it('flipping the class twice quickly applies only the newest pick (E11)', async () => {
    const { onPatch } = await mount({ playerClass: null });
    fireEvent.change(screen.getByLabelText('Class'), { target: { value: 'Cleric' } });
    fireEvent.change(screen.getByLabelText('Class'), { target: { value: 'Mage' } });
    await settle();
    await settle();
    await settle();
    const patches = onPatch.mock.calls.map((c) => c[0]).filter((p) => 'fightCommands' in p);
    expect(patches).toHaveLength(1);
    expect(patches[0].fightCommands).toEqual([]); // Mage has no offensive abilities in this fixture
  });

  it('a newer pick also discards an older pick that is still waiting on the defaults', async () => {
    let release: (v: unknown) => void = () => undefined;
    jest.mocked(getLearnedCooldown).mockReturnValueOnce(new Promise((resolve) => (release = resolve)) as never);
    const { onPatch } = await mount({ playerClass: null });
    fireEvent.change(screen.getByLabelText('Class'), { target: { value: 'Cleric' } }); // waits on the learned cooldown
    await settle();
    fireEvent.change(screen.getByLabelText('Class'), { target: { value: 'Mage' } });
    await settle();
    await settle();
    await act(async () => release(null));
    await settle();
    const patches = onPatch.mock.calls.map((c) => c[0]).filter((p) => 'fightCommands' in p);
    expect(patches).toHaveLength(1);
  });

  it('clearing the class empties the fight list and seeds nothing', async () => {
    const { onPatch } = await mount({
      playerClass: 'Cleric',
      charLevel: 30,
      buffs: [ARMOR],
      fightCommands: [{ cmd: 'bash', cooldownSec: 0 }],
    });
    onPatch.mockClear();
    fireEvent.change(screen.getByLabelText('Class'), { target: { value: '' } });
    await settle();
    expect(onPatch).toHaveBeenCalledWith({ playerClass: null });
    expect(onPatch).toHaveBeenCalledWith({ fightCommands: [] });
  });

  it('a class the catalog does not list (the catalog changed) picks without failing', async () => {
    const { onPatch } = await mount({ playerClass: null });
    const select = screen.getByLabelText('Class') as HTMLSelectElement;
    const option = document.createElement('option');
    option.value = 'Ghost';
    option.textContent = 'Ghost';
    select.appendChild(option);
    fireEvent.change(select, { target: { value: 'Ghost' } });
    await settle();
    await settle();
    expect(fightPatch(onPatch)).toEqual({ fightCommands: [], buffs: [] });
  });
});

describe('CombatStep adding a class buff (shares its row builder with the pre-fill)', () => {
  const pick = (label: string) => {
    const input = screen.getByLabelText('Add buff from class abilities');
    fireEvent.focus(input);
    fireEvent.mouseDown(screen.getByRole('option', { name: new RegExp(`^${label}`) }));
  };

  it('adds the verified row for a class ability that is in the buff catalog, once', async () => {
    const { abilitiesForClass } = jest.requireMock('../../features/autoleveling/autoleveling-classes');
    abilitiesForClass.mockImplementation(() => [...CLERIC.abilities, ability('Berserk', 'skill', 18)]);
    jest.mocked(getBuffOverlayOrNull).mockResolvedValue([]); // saved: no pre-fill interferes
    jest.mocked(getFightOverlayOrNull).mockResolvedValue([]);
    const onPatch = jest.fn();
    const { rerender } = render(<CombatStep {...stepProps({ onPatch, playerClass: 'Cleric' })} />);
    await settle();
    await settle();

    pick('Sanctuary');
    expect(onPatch).toHaveBeenCalledWith({ buffs: [SANCTUARY] });

    rerender(<CombatStep {...stepProps({ onPatch, playerClass: 'Cleric', buffs: [SANCTUARY] })} />);
    onPatch.mockClear();
    pick('Sanctuary');
    expect(onPatch).not.toHaveBeenCalled(); // already there

    pick('Berserk');
    expect(onPatch).toHaveBeenCalledWith({
      buffs: [SANCTUARY, { label: 'Berserk', cmd: 'berserk', refreshTicks: 6 }],
    });
    abilitiesForClass.mockImplementation(() => []);
  });
});

// A buff the class does not have yet (or never gets) is shown with a warning while it still casts the verified spell; the player
// defines how to apply it (a potion, wand or staff) and the warning goes. A buff can be paused and resumed like a fight command.
describe('CombatStep buffs: ability warning and pause', () => {
  const STONE_PAUSED = { ...STONE_SKIN, disabled: true };
  const HASTE = { label: 'Haste', cmd: "cast 'haste'", affect: 'haste', holdNearLevel: true };

  beforeEach(() => {
    const { abilitiesForClass } = jest.requireMock('../../features/autoleveling/autoleveling-classes');
    abilitiesForClass.mockImplementation(() => CLERIC.abilities);
    jest.mocked(getBuffOverlayOrNull).mockResolvedValue([]);
    jest.mocked(getFightOverlayOrNull).mockResolvedValue([]);
  });
  afterEach(() => {
    jest.requireMock('../../features/autoleveling/autoleveling-classes').abilitiesForClass.mockImplementation(() => []);
  });

  const noteText = () => screen.queryByRole('note')?.textContent ?? null;

  it('warns that the class gets the ability later, and says how to apply it meanwhile', async () => {
    await mount({ playerClass: 'Cleric', charLevel: 30, buffs: [STONE_PAUSED] as never });
    expect(noteText()).toContain('You do not have Stone Skin as an ability yet: your class gets it at level 40');
    expect(noteText()).toContain('quaff a potion or use a wand or staff');
  });

  it('warns that the class never gets it when the class has no such ability', async () => {
    await mount({ playerClass: 'Cleric', charLevel: 30, buffs: [HASTE] as never });
    expect(noteText()).toContain('Your class does not get Haste as an ability');
  });

  it('shows no warning once the level is reached, when the level is unknown, or for an ability the class has', async () => {
    const reached = await mount({ playerClass: 'Cleric', charLevel: 40, buffs: [STONE_SKIN] as never });
    expect(noteText()).toBeNull();
    reached.unmount();
    const unknown = await mount({ playerClass: 'Cleric', charLevel: null, buffs: [STONE_PAUSED] as never });
    expect(noteText()).toBeNull();
    unknown.unmount();
    await mount({ playerClass: 'Cleric', charLevel: 5, buffs: [ARMOR] as never });
    expect(noteText()).toBeNull();
  });

  it('shows no warning once the player has defined another way to apply it (a potion, a wand)', async () => {
    await mount({ playerClass: 'Cleric', charLevel: 30, buffs: [{ ...STONE_PAUSED, cmd: 'quaff stone-skin-potion' }] as never });
    expect(noteText()).toBeNull();
  });

  it('never warns about a row that is not a catalog buff, or when no class is chosen or the catalog is unavailable', async () => {
    const custom = await mount({ playerClass: 'Cleric', charLevel: 30, buffs: [{ label: 'My thing', cmd: 'zap wand' }] as never });
    expect(noteText()).toBeNull();
    custom.unmount();
    const noClass = await mount({ playerClass: null, charLevel: 30, buffs: [STONE_PAUSED] as never });
    expect(noteText()).toBeNull();
    noClass.unmount();
    jest.mocked(getClassCatalog).mockResolvedValue([]);
    await mount({ playerClass: 'Cleric', charLevel: 30, buffs: [STONE_PAUSED] as never });
    expect(noteText()).toBeNull();
  });

  it('shows a paused buff with a paused tag and Resume, and resume drops the flag entirely', async () => {
    const { onPatch } = await mount({ playerClass: 'Cleric', charLevel: 30, buffs: [STONE_PAUSED, ARMOR] as never });

    expect(screen.getByText('paused')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause buff 2' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Resume buff 1' }));

    const sent = onPatch.mock.calls[0][0].buffs;
    expect(sent).toEqual([STONE_SKIN, ARMOR]);
    expect('disabled' in sent[0]).toBe(false);
  });

  it('pause marks only that buff disabled and keeps its command and gate', async () => {
    const { onPatch } = await mount({ playerClass: 'Cleric', charLevel: 30, buffs: [SANCTUARY, ARMOR] as never });
    fireEvent.click(screen.getByRole('button', { name: 'Pause buff 2' }));
    expect(onPatch).toHaveBeenCalledWith({ buffs: [SANCTUARY, { ...ARMOR, disabled: true }] });
  });

  it('changing a paused buff\'s recast gate keeps it paused', async () => {
    const { onPatch } = await mount({ playerClass: 'Cleric', charLevel: 30, buffs: [STONE_PAUSED] as never });
    fireEvent.click(within(screen.getByRole('group', { name: 'Recast gate for buff 1' })).getByRole('button', { name: 'every N ticks' }));
    expect(onPatch.mock.calls[0][0].buffs[0]).toMatchObject({ label: 'Stone Skin', disabled: true, refreshTicks: 6 });
  });
});

describe('CombatStep class list and help', () => {
  it('lists every class the catalog has: base classes, then reclasses', async () => {
    jest.mocked(getClassCatalog).mockResolvedValue([CLERIC, MAGE, { name: 'Avenger', isReclass: true, abilities: [] }] as never);
    await mount();
    const groups = screen.getByLabelText('Class').querySelectorAll('optgroup');
    expect(Array.from(groups).map((g) => g.label)).toEqual(['Base classes', 'Reclasses']);
    expect(Array.from(groups[1].querySelectorAll('option')).map((o) => o.textContent)).toEqual(['Avenger']);
  });

  it('announces an unavailable class list instead of silently showing the five base classes', async () => {
    jest.mocked(getClassCatalog).mockResolvedValue([]);
    await mount();
    expect(screen.getByRole('status')).toHaveTextContent(/class list could not be loaded/);
    expect(Array.from(screen.getByLabelText('Class').querySelectorAll('option')).map((o) => o.textContent)).toEqual([
      '— pick your class —',
      'Bard',
      'Cleric',
      'Mage',
      'Thief',
      'Warrior',
    ]);
  });

  it('shows no notice while the list is loading or once it has loaded', async () => {
    let finish: (v: never) => void = () => undefined;
    jest.mocked(getClassCatalog).mockReturnValue(new Promise((resolve) => (finish = resolve as never)));
    render(<CombatStep {...stepProps()} />);
    expect(screen.queryByRole('status')).toBeNull();
    await act(async () => finish([CLERIC] as never));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('opens the combat help from the (i) and returns with Back', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: 'Help: Combat' }));
    expect(screen.getByRole('article', { name: 'Combat help' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Class')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '← Back to combat' }));
    expect(screen.getByLabelText('Class')).toBeInTheDocument();
  });
});
