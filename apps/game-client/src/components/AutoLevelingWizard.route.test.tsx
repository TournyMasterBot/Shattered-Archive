import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';

import AutoLevelingWizard from './AutoLevelingWizard';
import { createDefaultAutoLevelConfig } from '../features/autoleveling/autoleveling-defaults';
import { __setAreaStoreForTests } from '../features/autoleveling/autoleveling-content';
import { __setClassStoreForTests } from '../features/autoleveling/autoleveling-classes';
import { memoryKvStore } from '../features/autoleveling/autoleveling-idb';
import { __setUserDataStoreForTests, getRouteOverride, setRouteOverride } from '../features/autoleveling/autoleveling-user-data';

// The player's own route through the real wizard: a saved route replaces the served one when the area is picked, an edit on the Review
// step is stored whole (one record per area), "reset to default" brings the served route back, and a refused route says why.
// Content comes from a mocked fetch; storage is the real user-data module on an in-memory store.

const INDEX = [
  {
    slug: 'centaur-village',
    areaName: 'Centaur Village',
    continent: 'Arkania',
    levelRange: [10, 20],
    isExcellentLevelingArea: true,
    stepCount: 1,
    targetCount: 0,
  },
];

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
          recommendedTargets: [],
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

async function openReview() {
  await screen.findByRole('button', { name: /Centaur Village/ });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Centaur Village/ }));
  });
  await waitFor(() => expect(screen.getByRole('button', { name: /Next ▶/ })).toBeEnabled());
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /^6.*Review/ }));
  });
  await screen.findByText('Route', { selector: 'dt' });
}

const routeRow = () => screen.getByText('Route', { selector: 'dt' }).closest('div') as HTMLElement;

const click = async (name: string | RegExp) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
};

beforeEach(() => {
  __setAreaStoreForTests(memoryKvStore());
  __setClassStoreForTests(memoryKvStore());
  __setUserDataStoreForTests(memoryKvStore());
  mockFetch();
});

describe('Autopilot wizard — the player’s own route', () => {
  it('shows the served route untouched when the player has saved none', async () => {
    renderWizard();
    await openReview();
    expect(routeRow()).toHaveTextContent('1 step per round');
    expect(within(routeRow()).queryByText('edited')).toBeNull();
  });

  it('uses a saved route in place of the served one and says what the shared route was', async () => {
    await setRouteOverride('centaur-village', ['n'], ['n', 'e', 'w']);
    renderWizard();
    await openReview();
    expect(routeRow()).toHaveTextContent('3 steps per round');
    expect(within(routeRow()).getByText('edited')).toBeInTheDocument();
    expect(routeRow()).toHaveTextContent('Shared route: 1 steps');
  });

  it('saves an edit from the Review step as one whole-route record and uses it at once', async () => {
    renderWizard();
    await openReview();
    await click('Edit route');
    expect((screen.getByLabelText('Route steps') as HTMLTextAreaElement).value).toBe('n');
    fireEvent.change(screen.getByLabelText('Route steps'), { target: { value: 'n;e\nw' } });
    await click('Save route');

    await waitFor(() => expect(routeRow()).toHaveTextContent('3 steps per round'));
    expect(within(routeRow()).getByText('edited')).toBeInTheDocument();
    expect((await getRouteOverride('centaur-village'))?.data).toEqual({ dirs: ['n', 'e', 'w'] });
  });

  it('reset to default drops the stored route and shows the served one again', async () => {
    await setRouteOverride('centaur-village', ['n'], ['n', 'e']);
    renderWizard();
    await openReview();
    expect(routeRow()).toHaveTextContent('2 steps per round');
    await click('Reset route to default');

    await waitFor(() => expect(routeRow()).toHaveTextContent('1 step per round'));
    expect(within(routeRow()).queryByText('edited')).toBeNull();
    expect(await getRouteOverride('centaur-village')).toBeNull();
  });

  it('refuses an empty route with a message, keeps the editor open and stores nothing', async () => {
    renderWizard();
    await openReview();
    await click('Edit route');
    fireEvent.change(screen.getByLabelText('Route steps'), { target: { value: ' ; ' } });
    await click('Save route');

    expect(await screen.findByRole('alert')).toHaveTextContent('The route needs at least one step.');
    expect(screen.getByLabelText('Route steps')).toBeInTheDocument();
    expect(await getRouteOverride('centaur-village')).toBeNull();
  });

  it.each([
    ['a step with a control character', 'n;e\u0007', /A step is not allowed: each step must be 1-200 characters/],
    ['a step over 200 characters', 'x'.repeat(201), /A step is not allowed/],
    ['more than 1000 steps', 'e;'.repeat(1001), /That route is too long: use at most 1000 steps\./],
  ])('refuses %s with its own message and stores nothing', async (_name, text, message) => {
    renderWizard();
    await openReview();
    await click('Edit route');
    fireEvent.change(screen.getByLabelText('Route steps'), { target: { value: text } });
    await click('Save route');

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByLabelText('Route steps')).toBeInTheDocument();
    expect(await getRouteOverride('centaur-village')).toBeNull();
  });

  it('says the browser storage may be unavailable when the route cannot be stored, and keeps the served route', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    renderWizard();
    await openReview();
    const broken = memoryKvStore();
    broken.set = async () => {
      throw new Error('storage unavailable');
    };
    __setUserDataStoreForTests(broken);
    await click('Edit route');
    fireEvent.change(screen.getByLabelText('Route steps'), { target: { value: 'n;e' } });
    await click('Save route');

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save that change. Your browser storage may be unavailable.');
    expect(routeRow()).toHaveTextContent('1 step per round');
    expect(within(routeRow()).queryByText('edited')).toBeNull();
    jest.restoreAllMocks();
  });

  it('an area whose route cannot be loaded leaves the Review step asking for an area', async () => {
    (global as any).fetch = jest.fn(async (url: string) => {
      if (url.includes('/areas/')) return { ok: false, status: 500, json: async () => ({}) };
      return { ok: true, json: async () => (url.includes('/classes') ? { classes: [] } : { areas: INDEX }) };
    });
    renderWizard();
    await screen.findByRole('button', { name: /Centaur Village/ });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Centaur Village/ }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^6.*Review/ }));
    });
    expect(await screen.findByText(/Pick a curated area to see the plan summary/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit route' })).toBeNull();
  });

  it('saving the served route as it is leaves no override', async () => {
    renderWizard();
    await openReview();
    await click('Edit route');
    await click('Save route');

    await waitFor(() => expect(screen.queryByLabelText('Route steps')).toBeNull());
    expect(await getRouteOverride('centaur-village')).toBeNull();
    expect(within(routeRow()).queryByText('edited')).toBeNull();
  });
});
