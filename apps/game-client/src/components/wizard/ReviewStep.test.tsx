import { act, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';

import { ReviewStep } from './ReviewStep';
import { emptyDraft, type WizardDraft } from './useWizardDraft';

// The Review step is a plain-language summary of the draft: what autopilot will do, section by section, with the empty and
// not-set states said out loud. Its one editable field (the start-room reminder) patches the draft.

const AREA = {
  slug: 'centaur-village',
  areaName: 'Centaur Village',
  continent: 'Arkania',
  areaId: 'CentaurVillage',
  levelRange: [10, 20],
  startRoom: 'The Highroad',
  speedwalkToStart: 's;w',
  requiredActions: ['open gate'],
  dirs: ['n', 'e'],
  notes: '',
  isExcellentLevelingArea: true,
  recommendedTargets: [],
};

const draftWith = (over: Partial<WizardDraft> = {}): WizardDraft => ({ ...emptyDraft(), area: AREA as never, ...over });
const row = (label: string) => screen.getByText(label, { selector: 'dt' }).closest('div') as HTMLElement;

describe('ReviewStep', () => {
  it('asks for an area when none is chosen', () => {
    render(<ReviewStep draft={emptyDraft()} onPatch={jest.fn()} />);
    expect(screen.getByText(/Pick a curated area to see the plan summary/)).toBeInTheDocument();
  });

  it('summarizes the area: name, continent, level range, the excellent-area star, and the route', () => {
    render(<ReviewStep draft={draftWith()} onPatch={jest.fn()} />);
    const area = row('Area');
    expect(within(area).getByText('Centaur Village')).toBeInTheDocument();
    expect(area).toHaveTextContent('(Arkania)');
    expect(area).toHaveTextContent('L10–20');
    expect(within(area).getByTitle('Excellent leveling area')).toBeInTheDocument();
    // open gate + n + e: three steps; the approach speedwalk is flagged as not wired in
    expect(row('Route')).toHaveTextContent('3 steps per round');
    expect(row('Route')).toHaveTextContent('approach speedwalk not yet wired in');
    expect(within(row('Route')).getByText('Show steps')).toBeInTheDocument();
  });

  it('prints a route of one step in the singular, with no star and no speedwalk note when the area has neither', () => {
    const plain = { ...AREA, isExcellentLevelingArea: false, speedwalkToStart: '', requiredActions: [], dirs: ['n'] };
    render(<ReviewStep draft={draftWith({ area: plain as never })} onPatch={jest.fn()} />);
    expect(row('Route')).toHaveTextContent('1 step per round');
    expect(row('Route')).not.toHaveTextContent('speedwalk');
    expect(screen.queryByTitle('Excellent leveling area')).toBeNull();
  });

  it('an area with no route says 0 steps and offers no step list', () => {
    const empty = { ...AREA, requiredActions: [], dirs: [] };
    render(<ReviewStep draft={draftWith({ area: empty as never })} onPatch={jest.fn()} />);
    expect(row('Route')).toHaveTextContent('0 steps per round');
    expect(within(row('Route')).queryByText('Show steps')).toBeNull();
  });

  describe('route editor', () => {
    it('offers no editor when the wizard gives no save handler', () => {
      render(<ReviewStep draft={draftWith()} onPatch={jest.fn()} />);
      expect(screen.queryByRole('button', { name: 'Edit route' })).toBeNull();
    });

    it('opens on the current steps (without required actions), saves the typed text, and closes on success', async () => {
      const onSaveRoute = jest.fn().mockResolvedValue(null);
      render(<ReviewStep draft={draftWith()} onPatch={jest.fn()} onSaveRoute={onSaveRoute} />);
      fireEvent.click(screen.getByRole('button', { name: 'Edit route' }));
      const box = screen.getByLabelText('Route steps') as HTMLTextAreaElement;
      expect(box.value).toBe('n;e');
      expect(screen.getByText(/required actions still run first/)).toBeInTheDocument();
      fireEvent.change(box, { target: { value: 'n;e;w' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save route' }));
      await screen.findByRole('button', { name: 'Edit route' });
      expect(onSaveRoute).toHaveBeenCalledWith('n;e;w');
      expect(screen.queryByLabelText('Route steps')).toBeNull();
    });

    it('keeps the editor open and shows the message when the save is refused', async () => {
      const onSaveRoute = jest.fn().mockResolvedValue('The route needs at least one step.');
      render(<ReviewStep draft={draftWith()} onPatch={jest.fn()} onSaveRoute={onSaveRoute} />);
      fireEvent.click(screen.getByRole('button', { name: 'Edit route' }));
      fireEvent.change(screen.getByLabelText('Route steps'), { target: { value: '' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save route' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('The route needs at least one step.');
      expect(screen.getByLabelText('Route steps')).toBeInTheDocument();
    });

    it('Cancel and Escape close the editor without saving', () => {
      const onSaveRoute = jest.fn();
      render(<ReviewStep draft={draftWith()} onPatch={jest.fn()} onSaveRoute={onSaveRoute} />);
      fireEvent.click(screen.getByRole('button', { name: 'Edit route' }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByLabelText('Route steps')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Edit route' }));
      fireEvent.keyDown(screen.getByLabelText('Route steps'), { key: 'Escape' });
      expect(screen.queryByLabelText('Route steps')).toBeNull();
      expect(onSaveRoute).not.toHaveBeenCalled();
    });

    it('an edited route shows a badge, the shared step count and a reset that calls the handler', async () => {
      const onResetRoute = jest.fn().mockResolvedValue(undefined);
      const draft = draftWith({ routeOverridden: true, routeDefaultDirs: ['n'] });
      render(<ReviewStep draft={draft} onPatch={jest.fn()} onSaveRoute={jest.fn()} onResetRoute={onResetRoute} />);
      expect(within(row('Route')).getByText('edited')).toBeInTheDocument();
      expect(row('Route')).toHaveTextContent('Shared route: 1 steps');
      fireEvent.click(screen.getByRole('button', { name: 'Reset route to default' }));
      expect(onResetRoute).toHaveBeenCalledTimes(1);
    });

    it('leaves out the required-actions note when the area has none', () => {
      const plain = { ...AREA, requiredActions: [] };
      render(<ReviewStep draft={draftWith({ area: plain as never })} onPatch={jest.fn()} onSaveRoute={jest.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: 'Edit route' }));
      expect(screen.getByText(/Saved for you only/)).toBeInTheDocument();
      expect(screen.queryByText(/required actions still run first/)).toBeNull();
    });

    it('disables Save and Cancel while the save is in flight', async () => {
      let finish: (m: string | null) => void = () => undefined;
      const onSaveRoute = jest.fn(() => new Promise<string | null>((r) => (finish = r)));
      render(<ReviewStep draft={draftWith()} onPatch={jest.fn()} onSaveRoute={onSaveRoute} />);
      fireEvent.click(screen.getByRole('button', { name: 'Edit route' }));
      fireEvent.click(screen.getByRole('button', { name: 'Save route' }));
      expect(screen.getByRole('button', { name: 'Save route' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: 'Save route' }));
      expect(onSaveRoute).toHaveBeenCalledTimes(1);
      await act(async () => finish(null));
      await screen.findByRole('button', { name: 'Edit route' });
    });

    it('Save does nothing when the wizard stops offering a save handler while the editor is open', () => {
      const { rerender } = render(<ReviewStep draft={draftWith()} onPatch={jest.fn()} onSaveRoute={jest.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: 'Edit route' }));
      rerender(<ReviewStep draft={draftWith()} onPatch={jest.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: 'Save route' }));
      expect(screen.getByLabelText('Route steps')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('an untouched route shows no badge and no reset', () => {
      render(<ReviewStep draft={draftWith()} onPatch={jest.fn()} onSaveRoute={jest.fn()} onResetRoute={jest.fn()} />);
      expect(within(row('Route')).queryByText('edited')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Reset route to default' })).toBeNull();
    });
  });

  it('the start-room box edits the reminder and shows the area start room as its placeholder', () => {
    const onPatch = jest.fn();
    render(<ReviewStep draft={draftWith()} onPatch={onPatch} />);
    const box = screen.getByLabelText('Start room');
    expect(box).toHaveAttribute('placeholder', 'The Highroad');
    fireEvent.change(box, { target: { value: 'By the gate' } });
    expect(onPatch).toHaveBeenCalledWith({ startRoom: 'By the gate' });
  });

  it('the start-room placeholder says "not set" when the area has none', () => {
    render(<ReviewStep draft={draftWith({ area: { ...AREA, startRoom: '' } as never })} onPatch={jest.fn()} />);
    expect(screen.getByLabelText('Start room')).toHaveAttribute('placeholder', 'not set');
  });

  it('lists only the enabled targets with their keywords, and counts them against the total', () => {
    render(
      <ReviewStep
        draft={draftWith({
          targets: [
            { lookName: 'A ranger.', engageName: 'ranger', enabled: true, origin: 'area' },
            { lookName: 'A scout.', engageName: 'scout', enabled: false, origin: 'area' },
            { lookName: 'A filly.', engageName: 'filly', enabled: true, origin: 'custom' },
          ],
        })}
        onPatch={jest.fn()}
      />,
    );
    const targets = row('Targets');
    expect(within(targets).getByText('2 of 3 selected')).toBeInTheDocument();
    expect(targets).toHaveTextContent('A ranger.');
    expect(targets).toHaveTextContent('A filly.');
    expect(targets).not.toHaveTextContent('A scout.');
  });

  it('warns when no target is selected', () => {
    render(<ReviewStep draft={draftWith()} onPatch={jest.fn()} />);
    expect(row('Targets')).toHaveTextContent('none selected — the run just walks the route');
  });

  it('shows the class, the alignment and the engage command, with the defaults said out loud', () => {
    const set = render(
      <ReviewStep draft={draftWith({ playerClass: 'Cleric', playerAlignment: 'evil', initiationCommand: 'bash {name}' })} onPatch={jest.fn()} />,
    );
    expect(row('Class')).toHaveTextContent('Cleric');
    expect(row('Alignment')).toHaveTextContent('Evil');
    expect(row('Engage with')).toHaveTextContent('bash {name}');
    set.unmount();

    render(<ReviewStep draft={draftWith({ initiationCommand: '   ' })} onPatch={jest.fn()} />);
    expect(row('Class')).toHaveTextContent('not set');
    expect(row('Engage with')).toHaveTextContent('kill {name}');
  });

  it('describes each buff by its gate, with its flags, and says "none" when there are none', () => {
    const none = render(<ReviewStep draft={draftWith()} onPatch={jest.fn()} />);
    expect(row('Pre-round buffs')).toHaveTextContent('none');
    none.unmount();

    render(
      <ReviewStep
        draft={draftWith({
          buffs: [
            { label: 'Armor', cmd: "cast 'armor'", affect: 'armor', inCombatCmd: 'quaff potion', holdNearLevel: true },
            { label: 'Berserk', cmd: 'berserk', refreshTicks: 6 },
            { label: 'One', cmd: 'x', refreshTicks: 1 },
            { label: 'Blank', cmd: 'y', affect: '' },
            { label: 'Always', cmd: 'z' },
            { label: 'Guess', cmd: 'w', affect: 'w', unverified: true },
          ],
        })}
        onPatch={jest.fn()}
      />,
    );
    const buffs = row('Pre-round buffs');
    expect(buffs).toHaveTextContent('recast if “armor” drops');
    expect(buffs).toHaveTextContent('in combat: quaff potion');
    expect(buffs).toHaveTextContent('holds near level-up');
    expect(buffs).toHaveTextContent('every 6 ticks');
    expect(buffs).toHaveTextContent('every 1 tick');
    expect(buffs).not.toHaveTextContent('every 1 ticks');
    expect(buffs).toHaveTextContent('recast if its affect drops');
    expect(buffs).toHaveTextContent('every round');
    expect(buffs).toHaveTextContent('unverified');
  });

  it('says auto-attack only when there are no fight commands, and shows an empty command as such', () => {
    const none = render(<ReviewStep draft={draftWith()} onPatch={jest.fn()} />);
    expect(row('Fight commands')).toHaveTextContent('none (auto-attack only)');
    none.unmount();

    render(<ReviewStep draft={draftWith({ fightCommands: [{ cmd: '', cooldownSec: 0 }] })} onPatch={jest.fn()} />);
    expect(row('Fight commands')).toHaveTextContent('(empty)');
  });

  it('describes rest: none configured, or wake and rest commands and each during-round rule', () => {
    const none = render(<ReviewStep draft={draftWith()} onPatch={jest.fn()} />);
    expect(row('Rest')).toHaveTextContent('none configured');
    none.unmount();

    render(
      <ReviewStep
        draft={draftWith({
          restStartOfRound: 'wake;stand',
          restEndOfRound: 'sleep',
          restDuringRound: [
            { hp: 40, mp: 20, recoverTo: { hp: 90, mp: 80 } },
            { recoverTo: {} },
          ] as never,
        })}
        onPatch={jest.fn()}
      />,
    );
    const rest = row('Rest');
    expect(rest).toHaveTextContent('wake: wake;stand');
    expect(rest).toHaveTextContent('rest: sleep');
    expect(rest).toHaveTextContent('HP ≤ 40% and MP ≤ 20% → recover to HP ≥ 90%, MP ≥ 80%');
    expect(rest).toHaveTextContent('no threshold set');
    expect(rest).toHaveTextContent('recover to nothing set');
  });

  it('shows only the rest legs that are set', () => {
    render(<ReviewStep draft={draftWith({ restStartOfRound: 'wake' })} onPatch={jest.fn()} />);
    expect(row('Rest')).toHaveTextContent('wake: wake');
    expect(row('Rest')).not.toHaveTextContent('rest:');
  });

  it('describes weight: off, or the threshold and the drop commands', () => {
    const off = render(<ReviewStep draft={draftWith()} onPatch={jest.fn()} />);
    expect(row('Weight')).toHaveTextContent('off');
    off.unmount();

    render(<ReviewStep draft={draftWith({ weightAtOrAbovePct: 85, weightCommands: 'drop gold' })} onPatch={jest.fn()} />);
    expect(row('Weight')).toHaveTextContent('drop at 85% carry weight: drop gold');
  });

  it('describes the mode and whether the run loops', () => {
    const loop = render(<ReviewStep draft={draftWith({ mode: 'dry_run', loopRounds: true })} onPatch={jest.fn()} />);
    expect(row('Mode')).toHaveTextContent('Dry run — walk the route, no fighting · loops until stopped');
    loop.unmount();
    render(<ReviewStep draft={draftWith({ mode: 'sightsee', loopRounds: false })} onPatch={jest.fn()} />);
    expect(row('Mode')).toHaveTextContent('Sightsee — pause at each encounter · one pass');
  });

  it('falls back to the raw mode name for a mode it does not know', () => {
    render(<ReviewStep draft={draftWith({ mode: 'mystery' as never })} onPatch={jest.fn()} />);
    expect(row('Mode')).toHaveTextContent('mystery');
  });

  it('reminds the player nothing is sent until Start', () => {
    render(<ReviewStep draft={draftWith()} onPatch={jest.fn()} />);
    expect(screen.getByText(/Nothing is sent to the game until/)).toBeInTheDocument();
  });
});
