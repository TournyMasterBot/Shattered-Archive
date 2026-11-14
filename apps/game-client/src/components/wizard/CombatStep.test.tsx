import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import { CombatStep } from './CombatStep';
import { getClassCatalog } from '../../features/autoleveling/autoleveling-classes';
import { setBuffOverlay, setFightOverlay } from '../../features/autoleveling/autoleveling-user-data';

jest.mock('../../features/autoleveling/autoleveling-user-data', () => ({
  // a saved (empty) list by default: nothing is pre-filled over it, which is what the older tests below expect
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

// Editing buffs or fight commands saves them per area, DEBOUNCED: a burst of edits becomes one write of the latest rows, and an
// edit still waiting when the step unmounts is written at once instead of being lost.

const SAVE_DEBOUNCE_MS = 500;
const NEW_BUFF = { label: '', cmd: '', affect: '' };

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

async function renderStep(over: Partial<StepProps> = {}) {
  const onPatch = jest.fn();
  const utils = render(<CombatStep {...stepProps({ onPatch, ...over })} />);
  await act(async () => {}); // let the class catalog load
  return { onPatch, ...utils };
}

const addBuff = () => fireEvent.click(screen.getByRole('button', { name: '+ add buff' }));

describe('CombatStep debounced saves', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.mocked(setBuffOverlay).mockClear();
    jest.mocked(setFightOverlay).mockClear();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('writes an edited buff list once, only after the debounce delay', async () => {
    const { onPatch } = await renderStep();

    addBuff();

    expect(onPatch).toHaveBeenCalledWith({ buffs: [NEW_BUFF] }); // the draft updates at once
    act(() => {
      jest.advanceTimersByTime(SAVE_DEBOUNCE_MS - 1);
    });
    expect(setBuffOverlay).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(setBuffOverlay).toHaveBeenCalledTimes(1);
    expect(setBuffOverlay).toHaveBeenCalledWith('area-a', [NEW_BUFF]);
  });

  it('collapses a burst of edits into one write of the latest rows', async () => {
    const { rerender } = await renderStep();

    addBuff();
    act(() => {
      jest.advanceTimersByTime(200);
    });
    rerender(<CombatStep {...stepProps({ buffs: [NEW_BUFF] })} />);
    addBuff(); // the second edit restarts the delay
    act(() => {
      jest.advanceTimersByTime(SAVE_DEBOUNCE_MS - 1);
    });
    expect(setBuffOverlay).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(setBuffOverlay).toHaveBeenCalledTimes(1);
    expect(setBuffOverlay).toHaveBeenCalledWith('area-a', [NEW_BUFF, NEW_BUFF]);
  });

  it('writes a pending edit immediately when the step unmounts', async () => {
    const { unmount } = await renderStep();

    addBuff();
    expect(setBuffOverlay).not.toHaveBeenCalled();
    unmount();

    expect(setBuffOverlay).toHaveBeenCalledTimes(1);
    expect(setBuffOverlay).toHaveBeenCalledWith('area-a', [NEW_BUFF]);

    act(() => {
      jest.advanceTimersByTime(SAVE_DEBOUNCE_MS * 2);
    });
    expect(setBuffOverlay).toHaveBeenCalledTimes(1); // the cancelled timer does not write it a second time
  });

  it('writes nothing on unmount when there is nothing pending', async () => {
    const { unmount } = await renderStep();

    unmount();

    expect(setBuffOverlay).not.toHaveBeenCalled();
    expect(setFightOverlay).not.toHaveBeenCalled();
  });

  it('offers no editing, and saves nothing, until an area is selected', async () => {
    const { onPatch } = await renderStep({ areaSlug: null });

    expect(screen.getByText(/Pick a curated area first/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ add buff' })).not.toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(SAVE_DEBOUNCE_MS * 2);
    });

    expect(onPatch).not.toHaveBeenCalled();
    expect(setBuffOverlay).not.toHaveBeenCalled();
    expect(setFightOverlay).not.toHaveBeenCalled();
  });

  it('saves fight commands per area and class, through its own debounce', async () => {
    await renderStep({ playerClass: 'Warrior' });

    fireEvent.click(screen.getByRole('button', { name: '+ add command' }));
    act(() => {
      jest.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    });

    expect(setFightOverlay).toHaveBeenCalledTimes(1);
    expect(setFightOverlay).toHaveBeenCalledWith('area-a', 'Warrior', [{ cmd: '', cooldownSec: 0 }]);
    expect(setBuffOverlay).not.toHaveBeenCalled();
  });

  it('keeps working after the class catalog arrives (the layout effect that tracks the latest callback re-runs)', async () => {
    jest.mocked(getClassCatalog).mockResolvedValueOnce([{ name: 'Warrior', isReclass: false, abilities: [] } as never]);
    const { rerender } = await renderStep();

    rerender(<CombatStep {...stepProps({ buffs: [NEW_BUFF] })} />);
    addBuff();
    act(() => {
      jest.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    });

    expect(setBuffOverlay).toHaveBeenCalledWith('area-a', [NEW_BUFF, NEW_BUFF]);
  });

  // A paused fight command keeps its row (cooldown, gates, order) but is not used; resume restores it exactly.
  describe('pausing a fight command', () => {
    const BASH = { cmd: 'bash', cooldownSec: 8 };
    const KICK = { cmd: 'kick', cooldownSec: 2, vitalsGate: { stat: 'hp', op: 'above', pct: 50 } };

    it('pause marks only that row disabled, keeps everything else on it, and saves after the debounce', async () => {
      const { onPatch } = await renderStep({ playerClass: 'Warrior', fightCommands: [BASH, KICK] as never });

      fireEvent.click(screen.getByRole('button', { name: 'Pause command 2' }));

      expect(onPatch).toHaveBeenCalledWith({ fightCommands: [BASH, { ...KICK, disabled: true }] });
      act(() => {
        jest.advanceTimersByTime(SAVE_DEBOUNCE_MS);
      });
      expect(setFightOverlay).toHaveBeenCalledWith('area-a', 'Warrior', [BASH, { ...KICK, disabled: true }]);
    });

    it('a paused row is shown as paused with a resume button, and resume drops the flag entirely', async () => {
      const paused = { ...BASH, disabled: true };
      const { onPatch } = await renderStep({ playerClass: 'Warrior', fightCommands: [paused, KICK] as never });

      expect(screen.getByText('paused')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Pause command 2' })).toHaveAttribute('aria-pressed', 'false');
      const resume = screen.getByRole('button', { name: 'Resume command 1' });
      expect(resume).toHaveAttribute('aria-pressed', 'true');

      fireEvent.click(resume);

      const sent = onPatch.mock.calls[0][0].fightCommands;
      expect(sent).toEqual([BASH, KICK]);
      expect('disabled' in sent[0]).toBe(false); // stored like a row that was never paused
    });

    it('a row can still be removed while paused, and the others are untouched', async () => {
      const { onPatch } = await renderStep({
        playerClass: 'Warrior',
        fightCommands: [{ ...BASH, disabled: true }, KICK] as never,
      });

      fireEvent.click(screen.getByRole('button', { name: 'Remove command 1' }));

      expect(onPatch).toHaveBeenCalledWith({ fightCommands: [KICK] });
    });
  });
});
