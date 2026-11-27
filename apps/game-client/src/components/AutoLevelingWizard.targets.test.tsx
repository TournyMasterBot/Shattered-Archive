import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import AutoLevelingWizard from './AutoLevelingWizard';
import { createDefaultAutoLevelConfig } from '../features/autoleveling/autoleveling-defaults';
import { __setAreaStoreForTests } from '../features/autoleveling/autoleveling-content';
import { __setClassStoreForTests } from '../features/autoleveling/autoleveling-classes';
import { memoryKvStore } from '../features/autoleveling/autoleveling-idb';
import {
  __setUserDataStoreForTests,
  addCustomTarget,
  exportAll,
  getCustomTargets,
  getTargetOverrides,
  importRecords,
  setTargetOverride,
} from '../features/autoleveling/autoleveling-user-data';

// The Targets step through the real wizard: the served list with the player's overrides applied, edits that are stored as overrides
// (only what differs), hide / restore / reset, edits whose target left the list, and the player's own targets being really deleted.
// Content comes from a mocked fetch; storage is the real user-data module on an in-memory store.

const RANGER = { lookName: 'A centaur ranger eyes you warily.', engageName: 'ranger', level: 15 };
const SCOUT = { lookName: 'A lone centaur scout watches the road.', engageName: 'scout', level: 12 };

const INDEX = [
  {
    slug: 'centaur-village',
    areaName: 'Centaur Village',
    continent: 'Arkania',
    levelRange: [10, 20],
    isExcellentLevelingArea: true,
    stepCount: 3,
    targetCount: 2,
  },
];

let servedTargets = [RANGER, SCOUT];

function mockFetch() {
  (global as any).fetch = jest.fn(async (url: string) => ({
    ok: true,
    json: async () => {
      if (url.includes('/classes')) return { classes: [] };
      if (url.includes('/areas/')) {
        return {
          slug: 'centaur-village',
          areaName: 'Centaur Village',
          continent: 'Arkania',
          areaId: 'CentaurVillage',
          levelRange: [10, 20],
          startRoom: 'The Highroad',
          speedwalkToStart: '',
          requiredActions: [],
          dirs: ['n'],
          notes: '',
          isExcellentLevelingArea: true,
          recommendedTargets: servedTargets,
        };
      }
      return { areas: INDEX };
    },
  }));
}

const noop = () => undefined;

function renderWizard() {
  return render(
    <AutoLevelingWizard
      isOpen
      onClose={noop}
      connectionId="conn"
      isConnected
      config={createDefaultAutoLevelConfig()}
      setConfig={noop}
      runState={{ status: 'idle' } as any}
      xpProgress={null}
      socketReady
      start={noop}
      stop={noop}
      pause={noop}
      resume={noop}
      resetToDefaults={noop}
      moveNext={noop}
      movePrev={noop}
      rescanRoom={noop}
    />,
  );
}

async function openTargets() {
  await screen.findByRole('button', { name: /Centaur Village/ });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Centaur Village/ }));
  });
  await screen.findByRole('button', { name: /Next ▶/ });
  await waitFor(() => expect(screen.getByRole('button', { name: /Next ▶/ })).toBeEnabled());
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Next ▶/ }));
  });
  // any row: an edited ranger has a different name, and a hidden one has no checkbox at all
  await waitFor(() => expect(screen.queryByText('Loading targets…')).toBeNull());
  await waitFor(() => expect(screen.queryByText(/selected$/)).not.toBeNull());
}

const click = async (name: string | RegExp) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
};

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  __setAreaStoreForTests(memoryKvStore());
  __setClassStoreForTests(memoryKvStore());
  __setUserDataStoreForTests(memoryKvStore());
  servedTargets = [RANGER, SCOUT];
  mockFetch();
});

describe('Autopilot wizard — Targets step with personal overrides', () => {
  it('shows the served targets untouched when the player has no overrides', async () => {
    renderWizard();
    await openTargets();
    expect(screen.getByRole('checkbox', { name: `Fight ${SCOUT.lookName}` })).toBeChecked();
    expect(screen.queryByText('edited')).toBeNull();
    expect(screen.queryByText(/Hidden by you/)).toBeNull();
  });

  it('applies a stored override on open: edited values, badge, the shared values underneath (E15)', async () => {
    await setTargetOverride('centaur-village', RANGER, { engageName: 'rng' });
    renderWizard();
    await openTargets();

    expect(screen.getByText('edited')).toBeInTheDocument();
    expect(screen.getByText('rng', { selector: 'code' })).toBeInTheDocument();
    expect(screen.getByText(/Shared list: A centaur ranger eyes you warily\./)).toBeInTheDocument();
  });

  it('an edit is stored as an override holding only what changed, and survives closing and reopening the wizard', async () => {
    const first = renderWizard();
    await openTargets();
    await click(`Edit ${RANGER.lookName}`);
    type('Kill keyword', 'rng');
    await click('Save');

    expect(await screen.findByText('edited')).toBeInTheDocument();
    const stored = await getTargetOverrides('centaur-village');
    expect(stored).toHaveLength(1);
    expect(stored[0].data).toEqual({ key: 'a centaur ranger eyes you warily.', engageName: 'rng' });

    first.unmount();
    renderWizard();
    await openTargets();
    expect(screen.getByText('rng', { selector: 'code' })).toBeInTheDocument();
  });

  it('editing back to the shared value removes the override entirely (E15, E16)', async () => {
    await setTargetOverride('centaur-village', RANGER, { engageName: 'rng' });
    renderWizard();
    await openTargets();
    await click('Edit A centaur ranger eyes you warily.');
    type('Kill keyword', 'ranger');
    await click('Save');

    await waitFor(() => expect(screen.queryByText('edited')).toBeNull());
    expect(await getTargetOverrides('centaur-village')).toEqual([]);
  });

  it('reset to default rebuilds the row from the shared values and clears the stored override (E6, E17)', async () => {
    await setTargetOverride('centaur-village', RANGER, { engageName: 'rng', lookName: 'A tall centaur ranger eyes you.' });
    renderWizard();
    await openTargets();
    await click('Reset A tall centaur ranger eyes you. to default');

    expect(await screen.findByRole('checkbox', { name: `Fight ${RANGER.lookName}` })).toBeChecked();
    expect(screen.queryByText('edited')).toBeNull();
    expect(screen.getByText('ranger', { selector: 'code' })).toBeInTheDocument();
    expect(await getTargetOverrides('centaur-village')).toEqual([]);
  });

  it('hide moves the target to "Hidden by you", stores it, and restore brings it back (E6)', async () => {
    renderWizard();
    await openTargets();
    await click(`Hide ${SCOUT.lookName}`);

    expect(await screen.findByText('Hidden by you (1)')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: `Fight ${SCOUT.lookName}` })).toBeNull();
    expect((await getTargetOverrides('centaur-village'))[0].data).toEqual({ key: 'a lone centaur scout watches the road.', hidden: true });

    await click(`Restore ${SCOUT.lookName}`);
    expect(await screen.findByRole('checkbox', { name: `Fight ${SCOUT.lookName}` })).toBeChecked();
    expect(await getTargetOverrides('centaur-village')).toEqual([]);
  });

  it('a hidden target stays hidden the next time the wizard opens, and is not offered to the engine', async () => {
    await setTargetOverride('centaur-village', SCOUT, { hidden: true });
    renderWizard();
    await openTargets();
    expect(screen.getByText('Hidden by you (1)')).toBeInTheDocument();
    expect(screen.getByText(/1 of 1 selected/)).toBeInTheDocument();
  });

  it('restoring a hidden target that also has an edit keeps the edit', async () => {
    await setTargetOverride('centaur-village', SCOUT, { hidden: true, engageName: 'sc' });
    renderWizard();
    await openTargets();
    await click(`Restore ${SCOUT.lookName}`);

    expect(await screen.findByRole('checkbox', { name: `Fight ${SCOUT.lookName}` })).toBeChecked();
    expect(screen.getByText('sc', { selector: 'code' })).toBeInTheDocument();
    expect(screen.getByText('edited')).toBeInTheDocument();
  });

  it('shows an edit whose target left the served list as unmatched, keeps it stored, and deletes it only on request (E22)', async () => {
    await setTargetOverride('centaur-village', { lookName: 'A mob the server dropped.', engageName: 'gone' }, { engageName: 'g' });
    renderWizard();
    await openTargets();

    expect(screen.getByText('Edits that no longer match this area (1)')).toBeInTheDocument();
    expect(await getTargetOverrides('centaur-village')).toHaveLength(1);

    await click('Delete edit for a mob the server dropped.');
    await waitFor(() => expect(screen.queryByText(/no longer match this area/)).toBeNull());
    expect(await getTargetOverrides('centaur-village')).toEqual([]);
  });

  it('re-attaches an edit when its target comes back in the served list (E22)', async () => {
    servedTargets = [SCOUT]; // the server dropped the ranger
    await setTargetOverride('centaur-village', RANGER, { engageName: 'rng' });
    const first = renderWizard();
    await openTargets();
    expect(screen.getByText(/Edits that no longer match this area \(1\)/)).toBeInTheDocument();
    first.unmount();

    servedTargets = [RANGER, SCOUT]; // and later restored it (the area cache has aged out by then)
    __setAreaStoreForTests(memoryKvStore());
    renderWizard();
    await openTargets();
    expect(screen.queryByText(/no longer match this area/)).toBeNull();
    expect(screen.getByText('rng', { selector: 'code' })).toBeInTheDocument();
  });

  it('a failed save keeps the editor open with a message and stores nothing', async () => {
    const broken = memoryKvStore();
    renderWizard();
    await openTargets();
    broken.set = async () => {
      throw new Error('storage unavailable');
    };
    broken.delete = async () => {
      throw new Error('storage unavailable');
    };
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    __setUserDataStoreForTests(broken);

    await click(`Edit ${RANGER.lookName}`);
    type('Kill keyword', 'rng');
    await click('Save');

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save that change.');
    expect(screen.getByLabelText('Kill keyword')).toBeInTheDocument();
    warn.mockRestore();
  });

  it('the per-run checkbox switches a target off and on without storing anything', async () => {
    renderWizard();
    await openTargets();
    expect(screen.getByText(/2 of 2 selected/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: `Fight ${RANGER.lookName}` }));
    expect(screen.getByText(/1 of 2 selected/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: `Fight ${SCOUT.lookName}` })).toBeChecked();

    fireEvent.click(screen.getByRole('checkbox', { name: `Fight ${RANGER.lookName}` }));
    expect(screen.getByText(/2 of 2 selected/)).toBeInTheDocument();
    expect(await exportAll()).toEqual([]);
  });

  it('a target unchecked while the run is paused reaches the saved config the engine re-reads on Resume', async () => {
    const setConfig = jest.fn();
    const props = {
      isOpen: true,
      onClose: noop,
      connectionId: 'conn',
      isConnected: true,
      config: createDefaultAutoLevelConfig(),
      setConfig,
      xpProgress: null,
      socketReady: true,
      start: noop,
      stop: noop,
      pause: noop,
      resume: noop,
      resetToDefaults: noop,
      moveNext: noop,
      movePrev: noop,
      rescanRoom: noop,
    };
    const view = render(<AutoLevelingWizard {...props} runState={{ status: 'idle' } as any} />);
    await openTargets();
    setConfig.mockClear();

    view.rerender(<AutoLevelingWizard {...props} runState={{ status: 'paused', round: 3 } as any} />);
    fireEvent.click(screen.getByRole('checkbox', { name: `Fight ${RANGER.lookName}` }));

    await waitFor(() => {
      const last = setConfig.mock.calls[setConfig.mock.calls.length - 1]?.[0];
      expect(last.init.targets.map((t: any) => t.keywords)).toEqual([['scout']]);
    });
  });

  it('edits are not saved on a run that is going (only a pause saves them), and not on a closed wizard', async () => {
    const setConfig = jest.fn();
    const props = {
      onClose: noop,
      connectionId: 'conn',
      isConnected: true,
      config: createDefaultAutoLevelConfig(),
      setConfig,
      xpProgress: null,
      socketReady: true,
      start: noop,
      stop: noop,
      pause: noop,
      resume: noop,
      resetToDefaults: noop,
      moveNext: noop,
      movePrev: noop,
      rescanRoom: noop,
    };
    const view = render(<AutoLevelingWizard {...props} isOpen runState={{ status: 'idle' } as any} />);
    await openTargets();

    // running (not paused): the checkbox changes the draft only
    view.rerender(<AutoLevelingWizard {...props} isOpen runState={{ status: 'running', round: 3 } as any} />);
    setConfig.mockClear();
    fireEvent.click(screen.getByRole('checkbox', { name: `Fight ${RANGER.lookName}` }));
    await act(async () => undefined);
    expect(setConfig).not.toHaveBeenCalled();

    // paused but the wizard is closed: still nothing is written
    view.rerender(<AutoLevelingWizard {...props} isOpen={false} runState={{ status: 'paused', round: 3 } as any} />);
    await act(async () => undefined);
    expect(setConfig).not.toHaveBeenCalled();
  });

  it('reaching the Start step while idle saves only the checked targets for the engine to start with', async () => {
    const setConfig = jest.fn();
    render(
      <AutoLevelingWizard
        isOpen
        onClose={noop}
        connectionId="conn"
        isConnected
        config={createDefaultAutoLevelConfig()}
        setConfig={setConfig}
        runState={{ status: 'idle' } as any}
        xpProgress={null}
        socketReady
        start={noop}
        stop={noop}
        pause={noop}
        resume={noop}
        resetToDefaults={noop}
        moveNext={noop}
        movePrev={noop}
        rescanRoom={noop}
      />,
    );
    await openTargets();
    fireEvent.click(screen.getByRole('checkbox', { name: `Fight ${SCOUT.lookName}` }));
    for (let i = 0; i < 5; i++) await click(/Next ▶/);

    const last = setConfig.mock.calls[setConfig.mock.calls.length - 1]?.[0];
    expect(last.init.targets.map((t: any) => t.keywords)).toEqual([['ranger']]);
  });

  it('the refresh control re-fetches the selected area, so a target the server dropped leaves the list', async () => {
    renderWizard();
    await screen.findByRole('button', { name: /Centaur Village/ });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Centaur Village/ }));
    });
    await waitFor(() => expect(screen.getByRole('button', { name: /Next ▶/ })).toBeEnabled());

    servedTargets = [RANGER]; // the server dropped the scout since the area was cached
    await click('Refresh area data');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh area data' })).toBeEnabled());
    await click(/Next ▶/);

    await waitFor(() => expect(screen.getByText(/1 of 1 selected/)).toBeInTheDocument());
    expect(screen.queryByRole('checkbox', { name: `Fight ${SCOUT.lookName}` })).toBeNull();
  });

  it('dragging the header moves the dialog until the mouse is released; the Close button does not start a drag', async () => {
    renderWizard();
    await openTargets();
    const dialog = screen.getByRole('dialog');
    const startLeft = dialog.style.left;
    const startTop = dialog.style.top;

    // a press on a header button is a click, not a drag
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Close' }), { clientX: 100, clientY: 50 });
    fireEvent.mouseMove(document, { clientX: 400, clientY: 300 });
    expect(dialog.style.left).toBe(startLeft);

    // jsdom has no layout (rect is 0,0), so the dialog follows the pointer exactly
    fireEvent.mouseDown(screen.getByText('Autopilot'), { clientX: 100, clientY: 50 });
    fireEvent.mouseMove(document, { clientX: 300, clientY: 200 });
    expect(dialog.style.left).toBe('200px');
    expect(dialog.style.top).toBe('150px');

    fireEvent.mouseUp(document);
    fireEvent.mouseMove(document, { clientX: 500, clientY: 500 });
    expect(dialog.style.left).toBe('200px');
    expect(dialog.style.top).not.toBe(startTop);
  });

  it('reaching the Start step on a custom path saves nothing from the draft', async () => {
    const setConfig = jest.fn();
    render(
      <AutoLevelingWizard
        isOpen
        onClose={noop}
        connectionId="conn"
        isConnected
        config={createDefaultAutoLevelConfig()}
        setConfig={setConfig}
        runState={{ status: 'idle' } as any}
        xpProgress={null}
        socketReady
        start={noop}
        stop={noop}
        pause={noop}
        resume={noop}
        resetToDefaults={noop}
        moveNext={noop}
        movePrev={noop}
        rescanRoom={noop}
      />,
    );
    await screen.findByRole('button', { name: /Centaur Village/ });
    await click(/Custom path/);
    for (let i = 0; i < 6; i++) {
      await waitFor(() => expect(screen.getByRole('button', { name: /Next ▶/ })).toBeEnabled());
      await click(/Next ▶/);
    }
    expect(screen.getByRole('heading', { name: 'Start' })).toBeInTheDocument();
    expect(setConfig).not.toHaveBeenCalled();
  });

  it('a custom path (no area) is never saved from the draft, even while paused', async () => {
    const setConfig = jest.fn();
    const props = {
      isOpen: true,
      onClose: noop,
      connectionId: 'conn',
      isConnected: true,
      config: createDefaultAutoLevelConfig(),
      setConfig,
      xpProgress: null,
      socketReady: true,
      start: noop,
      stop: noop,
      pause: noop,
      resume: noop,
      resetToDefaults: noop,
      moveNext: noop,
      movePrev: noop,
      rescanRoom: noop,
    };
    const view = render(<AutoLevelingWizard {...props} runState={{ status: 'idle' } as any} />);
    await openTargets();
    await click(/◀ Back/);
    await click(/Custom path/);
    view.rerender(<AutoLevelingWizard {...props} runState={{ status: 'paused', round: 3 } as any} />);
    await act(async () => undefined);
    expect(setConfig).not.toHaveBeenCalled();
  });

  it('a wizard reopened while paused, with no area chosen in it, never overwrites the running config', async () => {
    const setConfig = jest.fn();
    render(
      <AutoLevelingWizard
        isOpen
        onClose={noop}
        connectionId="conn"
        isConnected
        config={createDefaultAutoLevelConfig()}
        setConfig={setConfig}
        runState={{ status: 'paused', round: 3 } as any}
        xpProgress={null}
        socketReady
        start={noop}
        stop={noop}
        pause={noop}
        resume={noop}
        resetToDefaults={noop}
        moveNext={noop}
        movePrev={noop}
        rescanRoom={noop}
      />,
    );
    await act(async () => undefined);
    expect(setConfig).not.toHaveBeenCalled();
  });

  describe('the player\'s own targets', () => {
    it('when storage fails the target still appears for this run, with a warning and nothing stored', async () => {
      renderWizard();
      await openTargets();
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      const broken = memoryKvStore();
      broken.set = async () => {
        throw new Error('storage unavailable');
      };
      __setUserDataStoreForTests(broken);

      fireEvent.change(screen.getByPlaceholderText(/Look description/), { target: { value: 'A tall shaman chants.' } });
      fireEvent.change(screen.getByPlaceholderText(/kill keyword/), { target: { value: 'shaman' } });
      await click('Add');

      expect(await screen.findByRole('checkbox', { name: 'Fight A tall shaman chants.' })).toBeInTheDocument();
      expect(warn).toHaveBeenCalledWith('[autoleveling] could not save the target');
      warn.mockRestore();
    });

    it('adding one stores it, and removing it really deletes it, so it does not come back (E14 of the old defect)', async () => {
      const first = renderWizard();
      await openTargets();
      fireEvent.change(screen.getByPlaceholderText(/Look description/), { target: { value: 'A tall shaman chants.' } });
      fireEvent.change(screen.getByPlaceholderText(/kill keyword/), { target: { value: 'shaman' } });
      await click('Add');
      expect(await screen.findByRole('checkbox', { name: 'Fight A tall shaman chants.' })).toBeInTheDocument();
      expect(await getCustomTargets('centaur-village')).toHaveLength(1);

      await click('Remove A tall shaman chants.');
      expect(screen.queryByRole('checkbox', { name: 'Fight A tall shaman chants.' })).toBeNull();
      expect(await getCustomTargets('centaur-village')).toEqual([]);

      first.unmount();
      renderWizard();
      await openTargets();
      expect(screen.queryByRole('checkbox', { name: 'Fight A tall shaman chants.' })).toBeNull();
    });

    it('editing one changes the stored record in place', async () => {
      const saved = await addCustomTarget('centaur-village', { lookName: 'A tall shaman chants.', engageName: 'shaman' });
      renderWizard();
      await openTargets();
      await click('Edit A tall shaman chants.');
      type('Kill keyword', 'shamn');
      await click('Save');

      await waitFor(async () => expect((await getCustomTargets('centaur-village'))[0].data.engageName).toBe('shamn'));
      expect((await getCustomTargets('centaur-village'))[0].id).toBe(saved.id);
    });

    it('a custom target whose room line matches a served one is not listed twice', async () => {
      await addCustomTarget('centaur-village', { lookName: '  A CENTAUR ranger   eyes you warily. ', engageName: 'dup' });
      renderWizard();
      await openTargets();
      expect(screen.getAllByRole('checkbox', { name: /Fight A centaur ranger/i })).toHaveLength(1);
    });
  });

  it('a cloud-loaded override applies without reopening the app: import then open (E18)', async () => {
    await importRecords([
      {
        id: 'targetOverride:centaur-village:a lone centaur scout watches the road.',
        kind: 'targetOverride',
        areaSlug: 'centaur-village',
        data: { key: 'a lone centaur scout watches the road.', engageName: 'sc' },
        updatedAt: Date.now(),
      },
    ]);
    renderWizard();
    await openTargets();
    expect(screen.getByText('sc', { selector: 'code' })).toBeInTheDocument();
    expect((await exportAll()).filter((r) => r.kind === 'targetOverride')).toHaveLength(1);
  });
});
