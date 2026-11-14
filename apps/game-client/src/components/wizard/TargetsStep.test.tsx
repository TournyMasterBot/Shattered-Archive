import { act, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';

import { TargetsStep } from './TargetsStep';
import { targetRowId, type DraftTarget } from './useWizardDraft';

// The Targets step: pre-loaded targets can be edited, hidden, restored and reset to the shared value; the player's own targets can
// be edited and removed; edits whose target left the list are shown and can be deleted. The step validates text before it asks the
// wizard to save (empty, over 200, ";" or line breaks, a room line another target already uses).

const area = (over: Partial<DraftTarget> & { lookName: string; engageName: string }): DraftTarget => ({
  enabled: true,
  origin: 'area',
  key: over.lookName.trim().toLowerCase().replace(/\s+/g, ' '),
  defaultLookName: over.lookName,
  defaultEngageName: over.engageName,
  overridden: false,
  hidden: false,
  ...over,
});

const RANGER = area({ lookName: 'A centaur ranger eyes you warily.', engageName: 'ranger', level: 15 });
const SCOUT = area({ lookName: 'A lone centaur scout watches the road.', engageName: 'scout' });
const MINE: DraftTarget = { lookName: 'A tall shaman chants.', engageName: 'shaman', enabled: true, origin: 'custom', id: 'target:1' };

type StepProps = React.ComponentProps<typeof TargetsStep>;

function props(over: Partial<StepProps> = {}): StepProps {
  return {
    areaName: 'Centaur Village',
    targets: [RANGER, SCOUT, MINE],
    unmatched: [],
    loading: false,
    onToggle: jest.fn(),
    onAddCustom: jest.fn(),
    onRemoveCustom: jest.fn(),
    onEdit: jest.fn().mockResolvedValue(null),
    onHide: jest.fn(),
    onRestore: jest.fn(),
    onReset: jest.fn(),
    onDeleteUnmatched: jest.fn(),
    ...over,
  };
}

const renderStep = (over: Partial<StepProps> = {}) => {
  const p = props(over);
  const utils = render(<TargetsStep {...p} />);
  return { p, ...utils };
};

const openEditor = (name: string) => fireEvent.click(screen.getByRole('button', { name: `Edit ${name}` }));
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const save = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  });
};

describe('TargetsStep notices', () => {
  it('asks for an area first when none is chosen', () => {
    renderStep({ areaName: null });
    expect(screen.getByText(/Pick an area first/)).toBeInTheDocument();
  });

  it('shows a loading notice, and an empty-list notice only when nothing is listed at all', () => {
    const { rerender, p } = renderStep({ targets: [], loading: true });
    expect(screen.getByText('Loading targets…')).toBeInTheDocument();
    rerender(<TargetsStep {...p} loading={false} />);
    expect(screen.getByText(/no recommended targets on record/)).toBeInTheDocument();
  });

  it('counts only the shown, enabled rows: a hidden target is not in "N of M selected"', () => {
    renderStep({ targets: [RANGER, { ...SCOUT, hidden: true, enabled: false, overridden: true }, MINE] });
    expect(screen.getByText(/2 of 2 selected/)).toBeInTheDocument();
  });
});

describe('TargetsStep rows', () => {
  it('lists pre-loaded rows with edit and hide, and no reset while nothing is edited', () => {
    renderStep();
    expect(screen.getByRole('button', { name: `Edit ${RANGER.lookName}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Hide ${RANGER.lookName}` })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Reset .* to default/ })).toBeNull();
    expect(screen.queryByText('edited')).toBeNull();
    expect(screen.getByText('L15')).toBeInTheDocument();
  });

  it('gives the player\'s own targets edit and remove, but no hide or reset', () => {
    renderStep();
    expect(screen.getByRole('button', { name: `Edit ${MINE.lookName}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Remove ${MINE.lookName}` })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `Hide ${MINE.lookName}` })).toBeNull();
    expect(screen.queryByRole('button', { name: `Reset ${MINE.lookName} to default` })).toBeNull();
  });

  it('passes the row identity, not the room line, when toggling', () => {
    const { p } = renderStep();
    fireEvent.click(screen.getByRole('checkbox', { name: `Fight ${RANGER.lookName}` }));
    expect(p.onToggle).toHaveBeenCalledWith(targetRowId(RANGER), false);
  });

  it('shows an edited row with its badge, the shared values underneath, and a reset that targets that row', () => {
    const edited = { ...RANGER, lookName: 'A tall centaur ranger eyes you.', engageName: 'rng', overridden: true };
    const { p } = renderStep({ targets: [edited] });

    expect(screen.getByText('edited')).toBeInTheDocument();
    expect(screen.getByText(/Shared list: A centaur ranger eyes you warily\./)).toBeInTheDocument();
    expect(screen.getByText('ranger', { selector: 'code' })).toBeInTheDocument(); // the shared keyword, beside the edited "rng"
    fireEvent.click(screen.getByRole('button', { name: 'Reset A tall centaur ranger eyes you. to default' }));
    expect(p.onReset).toHaveBeenCalledWith(targetRowId(edited));
  });

  it('hide asks the wizard to hide that row', () => {
    const { p } = renderStep();
    fireEvent.click(screen.getByRole('button', { name: `Hide ${SCOUT.lookName}` }));
    expect(p.onHide).toHaveBeenCalledWith(targetRowId(SCOUT));
  });

  it('moves a hidden row to "Hidden by you" with a restore button, out of the main list', () => {
    const hiddenScout = { ...SCOUT, hidden: true, enabled: false, overridden: true };
    const { p } = renderStep({ targets: [RANGER, hiddenScout] });

    expect(screen.getByText('Hidden by you (1)')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: `Fight ${SCOUT.lookName}` })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: `Restore ${SCOUT.lookName}` }));
    expect(p.onRestore).toHaveBeenCalledWith(targetRowId(hiddenScout));
  });

  it('removes one of the player\'s own targets by identity', () => {
    const { p } = renderStep();
    fireEvent.click(screen.getByRole('button', { name: `Remove ${MINE.lookName}` }));
    expect(p.onRemoveCustom).toHaveBeenCalledWith(targetRowId(MINE));
  });
});

describe('TargetsStep editing', () => {
  it('opens the editor with the current values and saves trimmed text, then closes', async () => {
    const { p } = renderStep();
    openEditor(RANGER.lookName);
    expect(screen.getByLabelText('Room line')).toHaveValue(RANGER.lookName);
    expect(screen.getByLabelText('Kill keyword')).toHaveValue('ranger');

    type('Room line', '  A tall centaur ranger eyes you.  ');
    type('Kill keyword', ' rng ');
    await save();

    expect(p.onEdit).toHaveBeenCalledWith(targetRowId(RANGER), { lookName: 'A tall centaur ranger eyes you.', engageName: 'rng' });
    expect(screen.queryByLabelText('Room line')).toBeNull();
  });

  it('keeps the editor open and shows the wizard\'s message when the save fails', async () => {
    const { p } = renderStep({ onEdit: jest.fn().mockResolvedValue('Could not save that change.') });
    openEditor(RANGER.lookName);
    type('Kill keyword', 'rng');
    await save();

    expect(p.onEdit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save that change.');
    expect(screen.getByLabelText('Room line')).toBeInTheDocument();
  });

  it('saves with Enter and cancels with Escape, without calling onEdit on cancel', async () => {
    const { p } = renderStep();
    openEditor(SCOUT.lookName);
    fireEvent.keyDown(screen.getByLabelText('Room line'), { key: 'Escape' });
    expect(screen.queryByLabelText('Room line')).toBeNull();
    expect(p.onEdit).not.toHaveBeenCalled();

    openEditor(SCOUT.lookName);
    type('Kill keyword', 'sc');
    await act(async () => {
      fireEvent.keyDown(screen.getByLabelText('Kill keyword'), { key: 'Enter' });
    });
    expect(p.onEdit).toHaveBeenCalledWith(targetRowId(SCOUT), { lookName: SCOUT.lookName, engageName: 'sc' });
  });

  it('Escape cancels the row edit and stops there: it does not also close the window around the step', () => {
    renderStep();
    const outside = jest.fn();
    document.addEventListener('keydown', outside);
    try {
      openEditor(SCOUT.lookName);
      fireEvent.keyDown(screen.getByLabelText('Room line'), { key: 'Escape' });
      openEditor(SCOUT.lookName);
      fireEvent.keyDown(screen.getByLabelText('Kill keyword'), { key: 'Escape' });
      expect(screen.queryByLabelText('Room line')).toBeNull();
      expect(outside).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', outside);
    }
  });

  it('Enter in the room line saves too, and Escape in the keyword box cancels, and other keys do nothing', async () => {
    const { p } = renderStep();
    openEditor(SCOUT.lookName);
    fireEvent.keyDown(screen.getByLabelText('Room line'), { key: 'a' });
    fireEvent.keyDown(screen.getByLabelText('Kill keyword'), { key: 'a' });
    expect(p.onEdit).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByLabelText('Kill keyword'), { key: 'Escape' });
    expect(screen.queryByLabelText('Room line')).toBeNull();

    openEditor(SCOUT.lookName);
    type('Kill keyword', 'sc');
    await act(async () => {
      fireEvent.keyDown(screen.getByLabelText('Room line'), { key: 'Enter' });
    });
    expect(p.onEdit).toHaveBeenCalledWith(targetRowId(SCOUT), { lookName: SCOUT.lookName, engageName: 'sc' });
  });

  it('Cancel closes the editor and a later open starts from the stored value, not the abandoned text', () => {
    renderStep();
    openEditor(RANGER.lookName);
    type('Kill keyword', 'abandoned');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    openEditor(RANGER.lookName);
    expect(screen.getByLabelText('Kill keyword')).toHaveValue('ranger');
  });

  it.each([
    ['an empty room line', 'Room line', '   ', 'The room line cannot be empty.'],
    ['an empty keyword', 'Kill keyword', '', 'The kill keyword cannot be empty.'],
    ['a stacked command in the keyword', 'Kill keyword', 'ranger;quit', 'The kill keyword cannot contain ";" or line breaks.'],
    ['a stacked command in the room line', 'Room line', 'A ranger;quit', 'The room line cannot contain ";" or line breaks.'],
    ['a room line over 200 characters', 'Room line', 'x'.repeat(201), 'The room line can have at most 200 characters.'],
  ])('refuses %s without asking the wizard to save (E2, E3)', async (_label, field, value, message) => {
    const { p } = renderStep();
    openEditor(RANGER.lookName);
    type(field, value);
    await save();

    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(p.onEdit).not.toHaveBeenCalled();
  });

  it('accepts a room line of exactly 200 characters', async () => {
    const { p } = renderStep();
    openEditor(RANGER.lookName);
    type('Room line', 'x'.repeat(200));
    await save();
    expect(p.onEdit).toHaveBeenCalledTimes(1);
  });

  it('refuses a room line another row already shows, in any case or spacing (E1, E2)', async () => {
    const { p } = renderStep();
    openEditor(RANGER.lookName);
    type('Room line', '  a LONE centaur   scout watches the road.');
    await save();
    expect(screen.getByRole('alert')).toHaveTextContent('Another target already uses that room line.');
    expect(p.onEdit).not.toHaveBeenCalled();
  });

  it('refuses the shared room line of a hidden row too, so it cannot be restored into a clash', async () => {
    const hiddenScout = { ...SCOUT, hidden: true, enabled: false, overridden: true, lookName: 'Renamed scout line.' };
    const { p } = renderStep({ targets: [RANGER, hiddenScout] });
    openEditor(RANGER.lookName);
    type('Room line', SCOUT.lookName); // the hidden row's ORIGINAL line (its key)
    await save();
    expect(screen.getByRole('alert')).toHaveTextContent('Another target already uses that room line.');
    expect(p.onEdit).not.toHaveBeenCalled();
  });

  it('allows saving the row\'s own room line unchanged with a new keyword', async () => {
    const { p } = renderStep();
    openEditor(RANGER.lookName);
    type('Kill keyword', 'rng');
    await save();
    expect(p.onEdit).toHaveBeenCalledWith(targetRowId(RANGER), { lookName: RANGER.lookName, engageName: 'rng' });
  });

  it('edits one of the player\'s own targets the same way', async () => {
    const { p } = renderStep();
    openEditor(MINE.lookName);
    type('Kill keyword', 'shamn');
    await save();
    expect(p.onEdit).toHaveBeenCalledWith(targetRowId(MINE), { lookName: MINE.lookName, engageName: 'shamn' });
  });

  it('disables Save and Cancel while the save is in flight', async () => {
    let finish: (v: string | null) => void = () => undefined;
    const onEdit = jest.fn(() => new Promise<string | null>((resolve) => (finish = resolve)));
    renderStep({ onEdit });
    openEditor(RANGER.lookName);
    type('Kill keyword', 'rng');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await act(async () => finish(null));
    expect(screen.queryByLabelText('Room line')).toBeNull();
  });
});

describe('TargetsStep unmatched edits (E22)', () => {
  const UNMATCHED = [
    { id: 'o1', key: 'a long gone mob.', engageName: 'gone' },
    { id: 'o2', key: 'another gone mob.', hidden: true },
  ];

  it('lists them with an explanation and deletes only the one the player picks', () => {
    const { p } = renderStep({ unmatched: UNMATCHED });
    expect(screen.getByText('Edits that no longer match this area (2)')).toBeInTheDocument();
    expect(screen.getByText(/your edits are not used/)).toBeInTheDocument();
    expect(screen.getByText('hidden')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete edit for a long gone mob.' }));
    expect(p.onDeleteUnmatched).toHaveBeenCalledWith('o1');
    expect(p.onDeleteUnmatched).toHaveBeenCalledTimes(1);
  });

  it('shows the edited room line when the override had one', () => {
    renderStep({ unmatched: [{ id: 'o3', key: 'k', lookName: 'A renamed mob.', engageName: 'rm' }] });
    expect(screen.getByText('A renamed mob.')).toBeInTheDocument();
  });

  it('shows nothing when there are none', () => {
    renderStep({ unmatched: [] });
    expect(screen.queryByText(/no longer match/)).toBeNull();
  });
});

describe('TargetsStep adding your own target', () => {
  const add = () => fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  const fill = (look: string, kw: string) => {
    fireEvent.change(screen.getByPlaceholderText(/Look description/), { target: { value: look } });
    fireEvent.change(screen.getByPlaceholderText(/kill keyword/), { target: { value: kw } });
  };

  it('adds a valid target trimmed and clears the boxes', () => {
    const { p } = renderStep();
    fill('  A lone orc.  ', ' orc ');
    add();
    expect(p.onAddCustom).toHaveBeenCalledWith({ lookName: 'A lone orc.', engageName: 'orc' });
    expect(screen.getByPlaceholderText(/Look description/)).toHaveValue('');
  });

  it('keeps Add disabled until both boxes have text, and Enter with an empty box adds nothing', () => {
    const { p } = renderStep();
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    fill('A lone orc.', '');
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    fireEvent.keyDown(screen.getByPlaceholderText(/kill keyword/), { key: 'Enter' });
    expect(p.onAddCustom).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('adds with Enter in the keyword box', () => {
    const { p } = renderStep();
    fill('A lone orc.', 'orc');
    fireEvent.keyDown(screen.getByPlaceholderText(/kill keyword/), { key: 'Enter' });
    expect(p.onAddCustom).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a stacked command', 'A lone orc.', 'orc;quit', 'The kill keyword cannot contain ";" or line breaks.'],
    ['a room line over 200 characters', 'x'.repeat(201), 'orc', 'The room line can have at most 200 characters.'],
    ['a room line another target already uses', 'A CENTAUR   ranger eyes you warily.', 'orc', 'Another target already uses that room line.'],
  ])('refuses %s', (_label, look, kw, message) => {
    const { p } = renderStep();
    fill(look, kw);
    add();
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(p.onAddCustom).not.toHaveBeenCalled();
  });

  it('clears an earlier error after a good add', () => {
    renderStep();
    fill('A lone orc.', 'orc;quit');
    add();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fill('A lone orc.', 'orc');
    add();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('TargetsStep help', () => {
  it('opens the help article from the (i) and returns with Back, keeping the rows', () => {
    renderStep();
    fireEvent.click(screen.getByRole('button', { name: 'Help: Targets' }));
    const help = screen.getByRole('article', { name: 'Targets help' });
    expect(within(help).getByText('Reset to default')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: `Fight ${RANGER.lookName}` })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '← Back to the targets' }));
    expect(screen.getByRole('checkbox', { name: `Fight ${RANGER.lookName}` })).toBeInTheDocument();
  });
});
