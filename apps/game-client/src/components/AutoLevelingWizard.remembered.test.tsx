import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import AutoLevelingWizard from './AutoLevelingWizard';
import { createDefaultAutoLevelConfig } from '../features/autoleveling/autoleveling-defaults';
import { __setAreaStoreForTests } from '../features/autoleveling/autoleveling-content';
import { __setClassStoreForTests } from '../features/autoleveling/autoleveling-classes';
import { memoryKvStore } from '../features/autoleveling/autoleveling-idb';
import { STEP_DEFAULTS } from '../features/autoleveling/autoleveling-step-prefs';
import {
  __setUserDataStoreForTests,
  exportAll,
  getStepValues,
  getTargetSelection,
  saveStepValues,
  setTargetSelection,
} from '../features/autoleveling/autoleveling-user-data';

// The values the wizard remembers (live findings 2026-11-14, item 4): the Rest and Weight steps, the wait between laps, and which targets
// are ticked. Through the real wizard on in-memory storage; the served content is a mocked fetch.

const RANGER = { lookName: 'A centaur ranger eyes you warily.', engageName: 'ranger', level: 15 };
const SCOUT = { lookName: 'A lone centaur scout watches the road.', engageName: 'scout', level: 12 };
const RANGER_ID = 'a:a centaur ranger eyes you warily.';
const SCOUT_ID = 'a:a lone centaur scout watches the road.';

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
          recommendedTargets: [RANGER, SCOUT],
        };
      }
      return {
        areas: [
          { slug: 'centaur-village', areaName: 'Centaur Village', continent: 'Arkania', levelRange: [10, 20], isExcellentLevelingArea: true, stepCount: 1, targetCount: 2 },
        ],
      };
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

const click = async (name: string | RegExp) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
};

async function openTargets() {
  await screen.findByRole('button', { name: /Centaur Village/ });
  await click(/Centaur Village/);
  await screen.findByRole('button', { name: /Next ▶/ });
  await waitFor(() => expect(screen.getByRole('button', { name: /Next ▶/ })).toBeEnabled());
  await click(/Next ▶/);
  await waitFor(() => expect(screen.queryByText('Loading targets…')).toBeNull());
  await waitFor(() => expect(screen.queryByText(/selected$/)).not.toBeNull());
}

/** From the Targets step to the Rest step (Combat is in between). */
async function openRest() {
  await click(/Next ▶/);
  await click(/Next ▶/);
  await screen.findByLabelText('Minutes to wait between laps');
}

async function openWeight() {
  await click(/Next ▶/);
  await screen.findByDisplayValue('drop gold');
}

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const sleep = (ms: number) => act(async () => new Promise((r) => setTimeout(r, ms)));

beforeEach(() => {
  __setAreaStoreForTests(memoryKvStore());
  __setClassStoreForTests(memoryKvStore());
  __setUserDataStoreForTests(memoryKvStore());
  mockFetch();
});

describe('the Rest step and the wait between laps are remembered (L26, L28)', () => {
  it('start with the defaults: nothing is stored just by opening the wizard (SETTINGS-01)', async () => {
    renderWizard();
    await openTargets();
    await openRest();
    expect(screen.getByLabelText('Minutes to wait between laps')).toHaveValue(3);
    expect(screen.getByLabelText('Start of round command')).toHaveValue('');
    await sleep(600);
    expect((await exportAll()).filter((r) => r.kind === 'pref')).toEqual([]);
  });

  it('what is typed is saved after a moment and comes back when the wizard is opened again', async () => {
    const first = renderWizard();
    await openTargets();
    await openRest();
    type('Start of round command', 'wake;stand');
    type('End of round command', 'rest cot');
    type('Minutes to wait between laps', '5');
    await sleep(700);

    expect(await getStepValues()).toMatchObject({ restStartOfRound: 'wake;stand', restEndOfRound: 'rest cot', lapWaitMin: 5 });

    first.unmount();
    renderWizard();
    await openTargets();
    await openRest();
    await waitFor(() => expect(screen.getByLabelText('Start of round command')).toHaveValue('wake;stand'));
    expect(screen.getByLabelText('End of round command')).toHaveValue('rest cot');
    expect(screen.getByLabelText('Minutes to wait between laps')).toHaveValue(5);
  });

  it('a change made just before the wizard closes is not lost (it is written when the wizard unmounts)', async () => {
    const view = renderWizard();
    await openTargets();
    await openRest();
    type('Minutes to wait between laps', '8');
    view.unmount(); // well inside the 400 ms debounce
    await waitFor(async () => expect((await getStepValues()).lapWaitMin).toBe(8));
  });

  it('only a whole number of minutes from 1 to 60 reaches the draft; the box shows the real value when left (L26)', async () => {
    renderWizard();
    await openTargets();
    await openRest();
    const box = screen.getByLabelText('Minutes to wait between laps');
    type('Minutes to wait between laps', '7');
    type('Minutes to wait between laps', '0');
    type('Minutes to wait between laps', '61');
    type('Minutes to wait between laps', '2.5');
    type('Minutes to wait between laps', '');
    await sleep(700);
    expect((await getStepValues()).lapWaitMin).toBe(7);
    fireEvent.blur(box);
    expect(box).toHaveValue(7);
  });

  it('putting a value back to its default leaves nothing stored for it (SETTINGS-01)', async () => {
    await saveStepValues({ ...STEP_DEFAULTS, lapWaitMin: 5 });
    renderWizard();
    await openTargets();
    await openRest();
    await waitFor(() => expect(screen.getByLabelText('Minutes to wait between laps')).toHaveValue(5));
    type('Minutes to wait between laps', '3');
    await sleep(700);
    expect((await exportAll()).filter((r) => r.id === 'pref:global')).toEqual([]);
  });

  it('a rest rule added in the step is remembered with its percents', async () => {
    const first = renderWizard();
    await openTargets();
    await openRest();
    await click('+ add rule');
    fireEvent.change(screen.getByLabelText('HP threshold for rest rule 1'), { target: { value: '40' } });
    await sleep(700);
    expect((await getStepValues()).restDuringRound).toEqual([{ hp: 40, recoverTo: {} }]);
    first.unmount();
    renderWizard();
    await openTargets();
    await openRest();
    await waitFor(() => expect(screen.getByLabelText('HP threshold for rest rule 1')).toHaveValue(40));
  });

  it('unreadable storage opens the wizard with the defaults, and says so once in the console without any value in it', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const broken = memoryKvStore();
    broken.get = () => Promise.reject(new Error('disk'));
    broken.keys = () => Promise.reject(new Error('disk'));
    __setUserDataStoreForTests(broken);
    renderWizard();
    await screen.findByRole('button', { name: /Centaur Village/ });
    await waitFor(() => expect(warn).toHaveBeenCalledWith('[autoleveling] could not read the step values'));
    expect(warn.mock.calls.filter((c) => c[0] === '[autoleveling] could not read the step values')).toHaveLength(1);
    warn.mockRestore();
  });
});

describe('the Weight step is remembered (L26)', () => {
  it('the percent and the commands survive closing and reopening', async () => {
    await saveStepValues({ ...STEP_DEFAULTS, weightAtOrAbovePct: 75, weightCommands: 'drop gold' });
    renderWizard();
    await openTargets();
    await openRest();
    await openWeight();
    expect(screen.getByDisplayValue('75')).toBeInTheDocument();
  });
});

describe('the targets the player unticked are remembered per area (L29)', () => {
  it('unticking a target stores it, and it is still unticked after reopening; the other stays ticked', async () => {
    const first = renderWizard();
    await openTargets();
    fireEvent.click(screen.getByRole('checkbox', { name: `Fight ${SCOUT.lookName}` }));
    await waitFor(async () => expect(await getTargetSelection('centaur-village')).toEqual([SCOUT_ID]));

    first.unmount();
    renderWizard();
    await openTargets();
    expect(screen.getByRole('checkbox', { name: `Fight ${SCOUT.lookName}` })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: `Fight ${RANGER.lookName}` })).toBeChecked();
  });

  it('opening an area and changing nothing stores nothing', async () => {
    renderWizard();
    await openTargets();
    await sleep(300);
    expect((await exportAll()).filter((r) => r.id.startsWith('pref:targets:'))).toEqual([]);
  });

  it('ticking everything again removes the stored selection', async () => {
    await setTargetSelection('centaur-village', [SCOUT_ID]);
    renderWizard();
    await openTargets();
    expect(screen.getByRole('checkbox', { name: `Fight ${SCOUT.lookName}` })).not.toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: `Fight ${SCOUT.lookName}` }));
    await waitFor(async () => expect(await getTargetSelection('centaur-village')).toEqual([]));
    expect((await exportAll()).filter((r) => r.id.startsWith('pref:targets:'))).toEqual([]);
  });

  it('an unticked id whose target left the list is kept, not applied, and survives a change of the others', async () => {
    await setTargetSelection('centaur-village', ['a:a centaur that no longer exists.']);
    renderWizard();
    await openTargets();
    expect(screen.getByRole('checkbox', { name: `Fight ${RANGER.lookName}` })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: `Fight ${SCOUT.lookName}` })).toBeChecked();

    fireEvent.click(screen.getByRole('checkbox', { name: `Fight ${RANGER.lookName}` }));
    await waitFor(async () => expect(await getTargetSelection('centaur-village')).toEqual(['a:a centaur that no longer exists.', RANGER_ID]));
  });

  it('a target the server adds later starts ticked, and another area has its own selection', async () => {
    await setTargetSelection('other-area', [RANGER_ID, SCOUT_ID]);
    renderWizard();
    await openTargets();
    expect(screen.getByRole('checkbox', { name: `Fight ${RANGER.lookName}` })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: `Fight ${SCOUT.lookName}` })).toBeChecked();
  });
});
