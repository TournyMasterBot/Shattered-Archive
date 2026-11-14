import '@testing-library/jest-dom';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ApiResult, LoadedArea, RoomArea, WorldMapApi } from '../features/worldmap/api';
import type { Location, WorldMapSession } from '../features/worldmap/session';
import { createSettingsStore, type SettingsStore } from '../features/worldmap/settings';
import { MIN_SCALE, polygonCenter } from '../features/worldmap/viewport';
import { __resetForTests as resetRoomData, setRoomData } from '../features/room/roomDataStore';
import { DispatchEvent } from '../features/event-emitter/event-dispatcher';
import * as sharedModule from '../features/worldmap/useWorldMap';
import { __resetMapWorldsForTests, registerMapWorld, setActiveMapWorld } from '../features/worldmap/world';
import { useWindowLayer } from '../hooks/useWindowLayer';
import WorldMapWindow from './WorldMapWindow';

// siteApi.ts reads import.meta.env, which the jest transform does not support; the window only needs sessions and clients that never touch the network.
jest.mock('../features/auth/siteApi', () => ({ siteApiBase: () => 'https://site.test' }));

// ---- fixtures: a town of four rooms on three floors, with three exits that leave it, and a forest next door ----
type RoomSpec = { id: string; title: string; x: number; z: number; exits?: Record<string, string> };
const rooms = (specs: RoomSpec[]) =>
  specs.map((r) => ({
    id: r.id,
    title: r.title,
    exits: r.exits ?? {},
    sources: [],
    coords: { x: r.x, y: 0, z: r.z },
    sector: 'city',
  }));
const lk = (id: string, from: string, dir: string, to: string | null, offPage = false) => ({
  id,
  from,
  dir,
  to,
  state: 'confirmed',
  confidence: 0.9,
  offPage,
  traversals: 1,
  reverse: false,
});
const areaOf = (
  id: string,
  name: string,
  specs: RoomSpec[],
  links: ReturnType<typeof lk>[],
  credits = ['Azah'],
): LoadedArea => ({
  id,
  name,
  continentId: 'c1',
  versionId: 'v1',
  credits,
  map: {
    version: 1,
    continents: [
      {
        id: 'c1',
        name: 'C',
        areas: [
          {
            id,
            name,
            placement: null,
            subzones: [{ id: `${id}-main`, name: 'Main', kind: 'consistent', rooms: rooms(specs) }],
          },
        ],
      },
    ],
    links,
  } as unknown as LoadedArea['map'],
});

const townLinks = [lk('lo', 'r2', 'E', 'far1', true), lk('lo2', 'r1', 'W', 'far2', true), lk('l1', 'r1', 'N', 'r2')];
const town = () =>
  areaOf(
    'town',
    'Old Town',
    [
      { id: 'r1', title: 'Market Square', x: 0, z: 0, exits: { N: 'l1', W: 'lo2' } },
      { id: 'r2', title: 'Mill Road', x: 4, z: 0, exits: { E: 'lo' } },
      { id: 'u1', title: 'Attic', x: 0, z: 1 },
      { id: 'd1', title: 'Cellar', x: 0, z: -1 },
    ],
    townLinks,
  );
const forest = () =>
  areaOf(
    'forest',
    'Deep Forest',
    [
      { id: 'far1', title: 'Mossy Path', x: 0, z: 0 },
      { id: 'far2', title: 'Treetop', x: 2, z: 1 },
    ],
    [],
    [],
  );

const here = (area: LoadedArea, roomIds: string[], z = 0, exact = true): Location => ({
  status: 'located',
  area,
  roomIds,
  z,
  exact,
});
const ok = <T,>(value: T): ApiResult<T> => ({ ok: true, value });
const fail = (error: Extract<ApiResult<unknown>, { ok: false }>['error']): ApiResult<never> => ({ ok: false, error });

function makeApi(
  parts: {
    roomArea?: (id: string) => ApiResult<RoomArea> | Promise<ApiResult<RoomArea>>;
    areas?: Record<string, LoadedArea>;
  } = {},
) {
  const areas = parts.areas ?? { town: town(), forest: forest() };
  const api = {
    checkFresh: jest.fn(async (): Promise<void> => undefined),
    getIndex: jest.fn(),
    search: jest.fn(),
    getRoomArea: jest.fn(async (id: string) =>
      parts.roomArea
        ? parts.roomArea(id)
        : id === 'far1' || id === 'far2'
          ? ok({ roomId: id, areaId: 'forest', areaName: 'Deep Forest' })
          : ok({ roomId: id, areaId: 'town', areaName: 'Old Town' }),
    ),
    getArea: jest.fn(async (id: string) =>
      areas[id] ? ok(areas[id]) : fail({ kind: 'http', status: 404, message: 'No such area' }),
    ),
  };
  return api as typeof api & WorldMapApi;
}

function sessionOf(...answers: (Location | null)[]): WorldMapSession & { observe: jest.Mock } {
  const observe = jest.fn();
  answers.forEach((a) => observe.mockResolvedValueOnce(a));
  observe.mockResolvedValue(answers[answers.length - 1]);
  return { observe, reset: jest.fn() } as unknown as WorldMapSession & { observe: jest.Mock };
}

let store: SettingsStore;
const onClose = jest.fn();

async function open(
  location: Location | null = here(town(), ['r1']),
  extra: { api?: WorldMapApi; session?: WorldMapSession; withRoom?: boolean } = {},
) {
  if (extra.withRoom !== false) setRoomData({ room: 'Somewhere', exits: [] });
  const session = extra.session ?? sessionOf(location);
  const api = extra.api ?? makeApi();
  const view = render(<WorldMapWindow isOpen onClose={onClose} session={session} api={api} settings={store} />);
  if (extra.withRoom !== false) await waitFor(() => expect(session.observe).toHaveBeenCalled());
  await act(async () => undefined);
  return { ...view, api: api as ReturnType<typeof makeApi>, session: session as ReturnType<typeof sessionOf> };
}

const viewport = () => screen.getByTestId('world-map-viewport');
const picture = () => screen.getByTestId('world-map-picture');
const stage = () => picture().parentElement as HTMLElement;
const poseOf = () => {
  const m = /translate\(([-\d.e+]+)px, ([-\d.e+]+)px\) scale\(([-\d.e+]+)\)/.exec(stage().style.transform);
  if (!m) throw new Error(`no transform: ${stage().style.transform}`);
  return { x: Number(m[1]), y: Number(m[2]), scale: Number(m[3]) };
};
const tile = (id: string) => picture().querySelector(`[data-room="${id}"]`) as Element;
const ghostFloors = () =>
  Array.from(picture().querySelectorAll('[data-layer="ghost"]')).map((g) => g.getAttribute('data-floor'));
const statusLine = () => screen.getByRole('status').textContent ?? '';
/** jsdom has no PointerEvent: a MouseEvent with the pointer event's name carries the same coordinates. */
const pointer = (
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  x: number,
  y: number,
  target: Element = viewport(),
) => act(() => void target.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true })));
const BOX = { width: 460, height: 310 }; // the fallback box the window uses when the browser has not laid it out (jsdom)

beforeEach(() => {
  jest.clearAllMocks();
  resetRoomData();
  window.localStorage.clear();
  store = createSettingsStore(null);
  Element.prototype.setPointerCapture = jest.fn();
  Element.prototype.releasePointerCapture = jest.fn();
});

describe('WorldMapWindow: the window', () => {
  it('renders nothing while closed', () => {
    const { container } = render(
      <WorldMapWindow isOpen={false} onClose={onClose} session={sessionOf(null)} api={makeApi()} settings={store} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('is a floating dialog, with no backdrop, named Map, showing the area it is in and the credit', async () => {
    await open();
    const dialog = screen.getByRole('dialog', { name: 'Map' });
    expect(dialog.style.position).toBe('fixed');
    expect(dialog.style.width).toBe('460px');
    expect(screen.getAllByText('Old Town')[0]).toBeInTheDocument();
    expect(statusLine()).toContain('You are here · Ground floor');
    expect(statusLine()).toContain('Map data by Azah');
  });

  it('opens beside the terminal: just left of the right sidebar, near the top', async () => {
    const pane = document.createElement('aside');
    pane.className = 'rightPane';
    pane.getBoundingClientRect = () => ({ left: 900 }) as DOMRect;
    document.body.appendChild(pane);
    const { unmount } = await open();
    expect(screen.getByRole('dialog').style.left).toBe('416px'); // 900 - 460 - 24
    expect(screen.getByRole('dialog').style.top).toBe('56px');
    unmount();
    pane.remove();
  });

  it('opens against the right edge of the browser when there is no sidebar to measure, or measuring fails', async () => {
    const first = await open();
    expect(Number.parseInt(screen.getByRole('dialog').style.left, 10)).toBeGreaterThan(0);
    first.unmount();
    window.localStorage.clear();
    const spy = jest.spyOn(document, 'querySelector').mockImplementation(() => {
      throw new Error('no layout');
    });
    await open();
    spy.mockRestore();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('closes with the button and with Escape', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Close the map' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('has a resize handle and a header to drag by', async () => {
    await open();
    expect(screen.getByTitle('Drag to resize')).toBeInTheDocument();
    expect(screen.getByText('Map').closest('div')).toBeInTheDocument();
  });
});

describe('WorldMapWindow: following the player', () => {
  it('draws the floor the player is on, marks their room and puts it in the middle at life size', async () => {
    await open();
    expect(Array.from(picture().querySelectorAll('[data-room]')).map((e) => e.getAttribute('data-room'))).toEqual([
      'r1',
      'r2',
    ]);
    expect(tile('r1').getAttribute('data-current')).toBe('true');
    expect(tile('r2').hasAttribute('data-current')).toBe(false);
    const centre = polygonCenter(tile('r1').getAttribute('points'))!;
    expect(poseOf()).toEqual({ scale: 1, x: BOX.width / 2 - centre.x, y: BOX.height / 2 - centre.y });
  });

  it('marks every room that looks alike and says so', async () => {
    await open(here(town(), ['r1', 'r2']));
    expect(picture().querySelectorAll('[data-current="true"]')).toHaveLength(2);
    expect(statusLine()).toContain('One of 2 rooms that look alike');
  });

  it('says "probably" when only the title matched', async () => {
    await open(here(town(), ['r1'], 0, false));
    expect(statusLine()).toContain('You are probably here');
  });

  it('moves the mark and re-centres on the next room without redrawing the picture, keeping the zoom', async () => {
    const shared = town();
    const session = sessionOf(here(shared, ['r1']), here(shared, ['r2']));
    await open(undefined, { session });
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    const zoomed = poseOf().scale;
    const svg = picture().querySelector('svg');
    await act(async () => void DispatchEvent('game:room-data', { room: 'Mill Road', exits: [] }));
    await waitFor(() => expect(tile('r2').getAttribute('data-current')).toBe('true'));
    expect(tile('r1').hasAttribute('data-current')).toBe(false);
    expect(picture().querySelector('svg')).toBe(svg);
    const centre = polygonCenter(tile('r2').getAttribute('points'))!;
    expect(poseOf().scale).toBe(zoomed);
    expect(poseOf().x).toBeCloseTo(BOX.width / 2 - centre.x * zoomed);
  });

  it('follows the player to another floor', async () => {
    const shared = town();
    const session = sessionOf(here(shared, ['r1']), here(shared, ['u1'], 1));
    await open(undefined, { session });
    await act(async () => void DispatchEvent('game:room-data', { room: 'Attic', exits: [] }));
    await waitFor(() => expect(tile('u1')).toBeTruthy());
    expect(tile('u1').getAttribute('data-current')).toBe('true');
    expect(statusLine()).toContain('Up 1');
  });

  it('stops following when the picture is dragged, and a step does not pull it back', async () => {
    const shared = town();
    const session = sessionOf(here(shared, ['r1']), here(shared, ['r2']));
    await open(undefined, { session });
    const before = poseOf();
    pointer('pointerdown', 100, 100);
    pointer('pointermove', 130, 90);
    pointer('pointerup', 130, 90);
    expect(poseOf()).toEqual({ ...before, x: before.x + 30, y: before.y - 10 });
    const dragged = poseOf();
    await act(async () => void DispatchEvent('game:room-data', { room: 'Mill Road', exits: [] }));
    await waitFor(() => expect(tile('r2').getAttribute('data-current')).toBe('true'));
    expect(poseOf()).toEqual(dragged);
    expect(screen.getByRole('button', { name: 'Reset view' })).toBeInTheDocument();
  });
});

describe('WorldMapWindow: pan and zoom', () => {
  it('a press that barely moves is a click, not a drag', async () => {
    await open();
    const before = poseOf();
    pointer('pointerdown', 100, 100);
    pointer('pointermove', 102, 101);
    pointer('pointerup', 102, 101);
    expect(poseOf()).toEqual(before);
    expect(screen.queryByRole('button', { name: 'Reset view' })).toBeNull();
  });

  it('ignores other mouse buttons, and moves from a pointer that did not press here', async () => {
    await open();
    const before = poseOf();
    act(
      () =>
        void viewport().dispatchEvent(
          new MouseEvent('pointerdown', { clientX: 1, clientY: 1, button: 2, bubbles: true }),
        ),
    );
    pointer('pointermove', 50, 50);
    pointer('pointerup', 50, 50);
    expect(poseOf()).toEqual(before);
  });

  it('does not treat the click that ends a drag as a click on a room', async () => {
    await open();
    const centre = polygonCenter(tile('r1').getAttribute('points'))!;
    void centre;
    pointer('pointerdown', 100, 100, tile('r1'));
    pointer('pointermove', 160, 100, tile('r1'));
    pointer('pointerup', 160, 100, tile('r1'));
    fireEvent.click(tile('r1'));
    expect(statusLine()).not.toContain('Market Square');
    fireEvent.click(tile('r1'));
    expect(statusLine()).toContain('Market Square'); // the next, real click works
  });

  it('captures the pointer only once a press turns into a drag, so a plain click still reaches its room', async () => {
    await open();
    const capture = Element.prototype.setPointerCapture as jest.Mock;
    pointer('pointerdown', 100, 100, tile('r1'));
    pointer('pointerup', 100, 100, tile('r1'));
    expect(capture).not.toHaveBeenCalled();
    pointer('pointerdown', 100, 100);
    pointer('pointermove', 103, 100); // under the slop
    expect(capture).not.toHaveBeenCalled();
    pointer('pointermove', 140, 100);
    pointer('pointermove', 150, 100);
    expect(capture).toHaveBeenCalledTimes(1);
    pointer('pointerup', 150, 100);
    expect(Element.prototype.releasePointerCapture).toHaveBeenCalledTimes(1);
  });

  it('does not let a drag that ended without a click swallow the next real click', async () => {
    await open();
    pointer('pointerdown', 100, 100);
    pointer('pointermove', 200, 100);
    pointer('pointerup', 200, 100); // no click follows: the pointer was released somewhere that does not send one
    pointer('pointerdown', 150, 150, tile('r1'));
    pointer('pointerup', 150, 150, tile('r1'));
    fireEvent.click(tile('r1'));
    expect(statusLine()).toContain('Market Square');
  });

  it('zooms around the pointer with the wheel, and the point under the pointer stays put', async () => {
    await open();
    const before = poseOf();
    const under = { x: (200 - before.x) / before.scale, y: (120 - before.y) / before.scale };
    fireEvent.wheel(viewport(), { deltaY: -400, clientX: 200, clientY: 120 });
    const after = poseOf();
    expect(after.scale).toBeGreaterThan(before.scale);
    expect(after.x + under.x * after.scale).toBeCloseTo(200);
    expect(after.y + under.y * after.scale).toBeCloseTo(120);
    fireEvent.wheel(viewport(), { deltaY: 800, clientX: 200, clientY: 120 });
    expect(poseOf().scale).toBeLessThan(after.scale);
  });

  it('zooms with the buttons about the middle, and each button stops at its limit', async () => {
    await open();
    for (let i = 0; i < 20; i += 1)
      if (!(screen.getByRole('button', { name: 'Zoom in' }) as HTMLButtonElement).disabled)
        fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeDisabled();
    expect(poseOf().scale).toBeCloseTo(6);
    for (let i = 0; i < 40; i += 1)
      if (!(screen.getByRole('button', { name: 'Zoom out' }) as HTMLButtonElement).disabled)
        fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeDisabled();
    expect(poseOf().scale).toBeCloseTo(MIN_SCALE);
  });

  it('fits the whole floor, stopping the following', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Fit the whole floor' }));
    const { scale } = poseOf();
    expect(scale).toBeGreaterThan(MIN_SCALE);
    expect(screen.getByRole('button', { name: 'Reset view' })).toBeInTheDocument();
  });

  it('centres on the player again with the Me button, keeping the zoom', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    pointer('pointerdown', 10, 10);
    pointer('pointermove', 90, 90);
    pointer('pointerup', 90, 90);
    const zoom = poseOf().scale;
    fireEvent.click(screen.getByRole('button', { name: 'Centre on me' }));
    const centre = polygonCenter(tile('r1').getAttribute('points'))!;
    expect(poseOf().scale).toBe(zoom);
    expect(poseOf().x).toBeCloseTo(BOX.width / 2 - centre.x * zoom);
    expect(screen.queryByRole('button', { name: 'Reset view' })).toBeNull();
  });

  it('disables Centre on me when the player is not on the map', async () => {
    await open(here(town(), []));
    expect(screen.getByRole('button', { name: 'Centre on me' })).toBeDisabled();
  });

  it('moves, zooms, changes floor and resets from the keyboard', async () => {
    await open();
    const win = screen.getByRole('dialog');
    const start = poseOf();
    fireEvent.keyDown(win, { key: 'ArrowRight' });
    fireEvent.keyDown(win, { key: 'ArrowDown' });
    expect(poseOf()).toMatchObject({ x: start.x - 48, y: start.y - 48 });
    fireEvent.keyDown(win, { key: 'ArrowLeft' });
    fireEvent.keyDown(win, { key: 'ArrowUp' });
    expect(poseOf()).toMatchObject({ x: start.x, y: start.y });
    fireEvent.keyDown(win, { key: '+' });
    expect(poseOf().scale).toBeCloseTo(1.25);
    fireEvent.keyDown(win, { key: '=' });
    fireEvent.keyDown(win, { key: '-' });
    expect(poseOf().scale).toBeCloseTo(1.25);
    fireEvent.keyDown(win, { key: 'PageUp' });
    expect(tile('u1')).toBeTruthy();
    fireEvent.keyDown(win, { key: 'PageUp' }); // already the top floor
    expect(tile('u1')).toBeTruthy();
    fireEvent.keyDown(win, { key: 'PageDown' });
    fireEvent.keyDown(win, { key: 'PageDown' });
    expect(tile('d1')).toBeTruthy();
    fireEvent.keyDown(win, { key: 'Home' });
    expect(tile('r1')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reset view' })).toBeNull();
    fireEvent.keyDown(win, { key: 'q' }); // nothing
  });

  it('leaves the arrow keys to a select or input that has the focus', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Map settings' }));
    const before = poseOf();
    fireEvent.keyDown(screen.getByLabelText('Room names'), { key: 'ArrowRight' });
    expect(poseOf()).toEqual(before);
  });
});

describe('WorldMapWindow: floors', () => {
  it('lists the floors, top first, with the current one pressed, and hides the list when there is only one floor', async () => {
    const { unmount } = await open();
    const strip = screen.getByRole('group', { name: 'Floors' });
    expect(Array.from(strip.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['+1', 'G', '-1']);
    expect(screen.getByRole('button', { name: 'Ground floor' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Up 1' })).toHaveAttribute('aria-pressed', 'false');
    unmount();
    await open(here(areaOf('flat', 'Flat Land', [{ id: 'f1', title: 'Only Room', x: 0, z: 0 }], []), ['f1']));
    expect(screen.queryByRole('group', { name: 'Floors' })).toBeNull();
  });

  it('shows another floor when it is chosen, keeps the picture in the same frame, and offers Reset view', async () => {
    await open();
    const frame = picture().querySelector('svg')!.getAttribute('viewBox');
    fireEvent.click(screen.getByRole('button', { name: 'Up 1' }));
    expect(tile('u1')).toBeTruthy();
    expect(tile('r1')).toBeNull();
    expect(picture().querySelector('svg')!.getAttribute('viewBox')).toBe(frame); // the same frame: floors line up
    expect(statusLine()).toContain('Up 1');
    expect(screen.getByRole('button', { name: 'Reset view' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reset view' }));
    expect(tile('r1')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ground floor' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('draws the nearby floors behind, dimmer the further away, and a ghost floor can be clicked to go there', async () => {
    await open();
    expect(ghostFloors().sort()).toEqual(['-1', '1']);
    expect(picture().querySelector('svg')).toHaveAttribute('data-ghosts', '2');
    const ghost = picture().querySelector('[data-ghost-room="u1"]')!;
    fireEvent.click(ghost);
    expect(tile('u1')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Up 1' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('WorldMapWindow: settings', () => {
  const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'Map settings' }));

  it('is closed until the gear is pressed, and closes with the gear and with Escape (which does not close the window)', async () => {
    await open();
    expect(screen.queryByRole('group', { name: 'Map settings' })).toBeNull();
    openMenu();
    expect(screen.getByRole('group', { name: 'Map settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Map settings' })).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('group', { name: 'Map settings' })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    openMenu();
    openMenu();
    expect(screen.queryByRole('group', { name: 'Map settings' })).toBeNull();
  });

  it('starts with the nearby floors and names; the choices are written to the store', async () => {
    await open();
    openMenu();
    expect(screen.getByLabelText('Nearby floors (2 up and down)')).toBeChecked();
    expect(screen.getByLabelText('Room names')).toBeChecked();
    fireEvent.click(screen.getByLabelText('This floor only'));
    expect(store.get().floors).toBe('this');
    expect(ghostFloors()).toEqual([]);
    fireEvent.click(screen.getByLabelText('All floors'));
    expect(picture().querySelector('svg')).toHaveAttribute('data-ghosts', '8');
  });

  it('offers no tile shape (a room is an octagon), and hides and shows the room names', async () => {
    await open();
    openMenu();
    expect(screen.queryByLabelText('Hexagons')).toBeNull();
    expect(screen.queryByLabelText('Squares')).toBeNull();
    expect(picture().querySelector('svg')).toHaveAttribute('data-layout', 'grid');
    expect(tile('r1').getAttribute('points')!.trim().split(/\s+/)).toHaveLength(8);
    const names = () => picture().querySelectorAll('text[fill="#222"]').length; // the room names are the dark texts (the exit chips write their glyph in the colour of the link)
    expect(names()).toBeGreaterThan(0);
    fireEvent.click(screen.getByLabelText('Room names'));
    expect(names()).toBe(0);
    expect(store.get().labels).toBe(false);
    fireEvent.click(screen.getByLabelText('Room names'));
    expect(names()).toBeGreaterThan(0);
  });

  it('keeps the player in view when a setting redraws the picture', async () => {
    await open();
    openMenu();
    fireEvent.click(screen.getByLabelText('Room names'));
    expect(tile('r1').getAttribute('data-current')).toBe('true');
    const centre = polygonCenter(tile('r1').getAttribute('points'))!;
    expect(poseOf().x).toBeCloseTo(BOX.width / 2 - centre.x);
  });
});

describe('WorldMapWindow: rooms', () => {
  it('shows a clicked room in the status line, with its exits, and clears it when empty space is clicked', async () => {
    await open();
    fireEvent.click(tile('r2'));
    expect(statusLine()).toContain('Mill Road · exits E');
    fireEvent.click(tile('r1'));
    expect(statusLine()).toContain('Market Square · exits N, W');
    fireEvent.click(picture().querySelector('svg')!);
    expect(statusLine()).toContain('You are here');
  });

  it('shows nothing for a tile whose room the map does not have', async () => {
    await open();
    fireEvent.click(tile('r1'));
    expect(statusLine()).toContain('Market Square');
    const other = tile('r2');
    other.setAttribute('data-room', 'gone');
    fireEvent.click(other);
    expect(statusLine()).toContain('You are here');
  });

  it('names a room without a title or exits', async () => {
    const bare = areaOf('bare', 'Bare', [{ id: 'b1', title: '', x: 0, z: 0 }], []);
    await open(here(bare, ['b1']));
    fireEvent.click(tile('b1'));
    expect(statusLine()).toContain('(no title)');
    expect(statusLine()).not.toContain('exits');
  });
});

describe('WorldMapWindow: neighbouring areas', () => {
  it('opens the area an exit leads to, at that room and on its floor, and Reset view comes back', async () => {
    const { api } = await open();
    await act(async () => void fireEvent.click(picture().querySelector('[data-offpage-to="far1"]')!));
    await waitFor(() => expect(screen.getAllByText('Deep Forest').length).toBeGreaterThan(0));
    expect(api.getRoomArea).toHaveBeenCalledWith('far1', expect.anything());
    expect(api.getArea).toHaveBeenCalledWith('forest', expect.anything());
    expect(api.checkFresh).toHaveBeenCalled();
    expect(statusLine()).toContain('Looking at Deep Forest · Ground floor');
    expect(tile('far1')).toBeTruthy();
    const centre = polygonCenter(tile('far1').getAttribute('points'))!;
    expect(poseOf().scale).toBe(1);
    expect(poseOf().x).toBeCloseTo(BOX.width / 2 - centre.x);
    expect(tile('far1').hasAttribute('data-current')).toBe(false);
    const back = screen.getByRole('button', { name: 'Looking at Deep Forest · Reset view' });
    await act(async () => void fireEvent.click(back));
    expect(screen.getAllByText('Old Town').length).toBeGreaterThan(0);
    expect(tile('r1').getAttribute('data-current')).toBe('true');
    expect(statusLine()).toContain('You are here');
  });

  it('opens on the floor of the room the exit leads to', async () => {
    await open();
    await act(async () => void fireEvent.click(picture().querySelector('[data-offpage-to="far2"]')!));
    await waitFor(() => expect(statusLine()).toContain('Looking at Deep Forest · Up 1'));
    expect(tile('far2')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Up 1' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('does nothing when the exit leads into the area already shown', async () => {
    const api = makeApi({ roomArea: (id) => ok({ roomId: id, areaId: 'town', areaName: 'Old Town' }) });
    await open(here(town(), ['r1']), { api });
    const before = poseOf();
    await act(async () => void fireEvent.click(picture().querySelector('[data-offpage-to="far1"]')!));
    await waitFor(() => expect(api.getArea).toHaveBeenCalledWith('town', expect.anything()));
    expect(poseOf()).toEqual(before);
    expect(screen.queryByRole('button', { name: /Looking at/ })).toBeNull();
    expect(tile('r1')).toBeTruthy();
  });

  it('opens the area and fits it when the room the exit names is not in it', async () => {
    const lean = areaOf('forest', 'Deep Forest', [{ id: 'far2', title: 'Treetop', x: 2, z: 1 }], [], []);
    const api = makeApi({ areas: { town: town(), forest: lean } });
    await open(here(town(), ['r1']), { api });
    await act(async () => void fireEvent.click(picture().querySelector('[data-offpage-to="far1"]')!));
    await waitFor(() => expect(statusLine()).toContain('Looking at Deep Forest'));
    expect(tile('far2')).toBeTruthy();
    expect(poseOf().scale).toBeGreaterThan(0);
  });

  it('says what went wrong, and keeps the current picture', async () => {
    const cases: [Parameters<typeof makeApi>[0], string][] = [
      [
        { roomArea: () => fail({ kind: 'http', status: 404, message: 'No such room in the world map.' }) },
        'That exit leads to a place that is not on the map yet.',
      ],
      [{ roomArea: () => fail({ kind: 'offline' }) }, 'The map is offline.'],
      [
        { roomArea: () => fail({ kind: 'http', status: 500, message: 'The map slice for this area is damaged.' }) },
        'The map slice for this area is damaged.',
      ],
      [{ roomArea: () => fail({ kind: 'invalid' }) }, 'The map answer was not understood.'],
      [{ areas: { town: town() } }, 'That exit leads to a place that is not on the map yet.'],
    ];
    for (const [parts, text] of cases) {
      const view = await open(here(town(), ['r1']), { api: makeApi(parts) });
      await act(async () => void fireEvent.click(picture().querySelector('[data-offpage-to="far1"]')!));
      await waitFor(() => expect(statusLine()).toContain(text));
      expect(tile('r1')).toBeTruthy();
      expect(screen.queryByRole('button', { name: /Reset view/ })).toBeNull();
      view.unmount();
    }
  });

  it('ignores a request that was cancelled, and cancels one still in flight when the window closes', async () => {
    const cancelled = makeApi({ roomArea: () => fail({ kind: 'aborted' }) });
    const first = await open(here(town(), ['r1']), { api: cancelled });
    await act(async () => void fireEvent.click(picture().querySelector('[data-offpage-to="far1"]')!));
    expect(statusLine()).toContain('Looking at the neighbouring area…'); // nothing replaced it
    first.unmount();
    let seen: AbortSignal | undefined;
    const slow = makeApi({ roomArea: () => new Promise(() => undefined) });
    (slow.getRoomArea as jest.Mock).mockImplementation((_id: string, signal: AbortSignal) => {
      seen = signal;
      return new Promise(() => undefined);
    });
    const second = await open(here(town(), ['r1']), { api: slow });
    await act(async () => void fireEvent.click(picture().querySelector('[data-offpage-to="far1"]')!));
    expect(seen?.aborted).toBe(false);
    second.unmount();
    expect(seen?.aborted).toBe(true);
  });

  it('drops a request that a newer click replaced', async () => {
    const pending: ((r: ApiResult<RoomArea>) => void)[] = [];
    const api = makeApi({ roomArea: () => new Promise((resolve) => pending.push(resolve)) });
    await open(here(town(), ['r1']), { api });
    await act(async () => void fireEvent.click(picture().querySelector('[data-offpage-to="far1"]')!));
    await act(async () => void fireEvent.click(picture().querySelector('[data-offpage-to="far2"]')!));
    await act(async () => pending[0](ok({ roomId: 'far1', areaId: 'forest', areaName: 'Deep Forest' })));
    expect(screen.queryByRole('button', { name: /Looking at Deep Forest/ })).toBeNull();
    expect(api.getArea).not.toHaveBeenCalled();
  });

  it('goes back to following when the player walks into another area', async () => {
    const session = sessionOf(here(town(), ['r1']), here(forest(), ['far1']));
    await open(undefined, { session });
    await act(async () => void fireEvent.click(picture().querySelector('[data-offpage-to="far1"]')!));
    await waitFor(() => expect(screen.getByRole('button', { name: /Looking at Deep Forest/ })).toBeInTheDocument());
    await act(async () => void DispatchEvent('game:room-data', { room: 'Mossy Path', exits: [] }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /Reset view/ })).toBeNull());
    expect(tile('far1').getAttribute('data-current')).toBe('true');
    expect(statusLine()).toContain('You are here');
  });
});

describe('WorldMapWindow: when the player is not on the map', () => {
  const emptyText = () => (document.querySelector('p') as HTMLElement).textContent;

  it.each([
    ['nothing known yet', null as Location | null, false, 'Walk into a room to see where you are.'],
    ['a room that is not mapped', { status: 'unmapped' } as Location, true, '"Somewhere" is not on the map yet.'],
    [
      'an ambiguous title',
      {
        status: 'ambiguous',
        areas: [
          { id: 'a', name: 'Area A', count: 1 },
          { id: 'b', name: 'Area B', count: 2 },
        ],
      } as Location,
      true,
      'Several places are called "Somewhere": Area A, Area B.',
    ],
    [
      'an offline site',
      { status: 'unavailable', reason: 'offline', message: 'x' } as Location,
      true,
      'The map is offline.',
    ],
    [
      'an unpublished map',
      { status: 'unavailable', reason: 'not-published', message: 'x' } as Location,
      true,
      'No map has been published yet.',
    ],
    [
      'a refusal',
      { status: 'unavailable', reason: 'error', message: 'The world map manifest could not be read.' } as Location,
      true,
      'The world map manifest could not be read.',
    ],
  ])('says it in words for %s', async (_n, location, withRoom, text) => {
    await open(location, { withRoom });
    expect(emptyText()).toBe(text);
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Fit the whole floor' })).toBeDisabled();
    expect(screen.queryByRole('group', { name: 'Floors' })).toBeNull();
  });

  it('says the player is being looked for while the first answer is awaited', async () => {
    const session = {
      observe: jest.fn(() => new Promise<Location | null>(() => undefined)),
      reset: jest.fn(),
    } as unknown as WorldMapSession;
    setRoomData({ room: 'Somewhere', exits: [] });
    render(<WorldMapWindow isOpen onClose={onClose} session={session} api={makeApi()} settings={store} />);
    expect(emptyText()).toBe('Looking…');
  });

  it('keeps the last picture and says so when the next room is not on the map, and while the next room is looked up', async () => {
    const shared = town();
    const session = sessionOf(here(shared, ['r1']), { status: 'unmapped' });
    await open(undefined, { session });
    await act(async () => void DispatchEvent('game:room-data', { room: 'Hidden Cave', exits: [] }));
    await waitFor(() => expect(statusLine()).toContain('Not on the map yet · last seen in Old Town'));
    expect(tile('r1')).toBeTruthy();
    let finish!: (l: Location) => void;
    session.observe.mockReturnValueOnce(new Promise<Location>((resolve) => (finish = resolve)));
    await act(async () => void DispatchEvent('game:room-data', { room: 'Market Square', exits: [] }));
    expect(statusLine()).toContain('Old Town · Ground floor · looking…');
    await act(async () => finish(here(town(), ['r1'])));
    expect(statusLine()).toContain('You are here');
  });

  it('has no player to centre on when a located answer names no room that is drawn on this floor', async () => {
    await open(here(town(), ['u1'], 0));
    expect(tile('u1')).toBeNull();
    expect(poseOf().scale).toBeGreaterThan(0); // the whole floor is fitted instead
  });
});

describe('WorldMapWindow: edges', () => {
  it("uses the page's shared client and settings when none are given", async () => {
    window.localStorage.clear();
    setRoomData({ room: 'Somewhere', exits: [] });
    const session = sessionOf(here(town(), ['r1']));
    render(<WorldMapWindow isOpen onClose={onClose} session={session} />);
    await waitFor(() => expect(session.observe).toHaveBeenCalled());
    expect(await screen.findByTestId('world-map-picture')).toBeInTheDocument();
  });

  it('uses the measured size of the viewport when the browser has laid it out', async () => {
    const width = jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
    const height = jest.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
    await open();
    const centre = polygonCenter(tile('r1').getAttribute('points'))!;
    expect(poseOf().x).toBeCloseTo(400 - centre.x);
    expect(poseOf().y).toBeCloseTo(300 - centre.y);
    width.mockRestore();
    height.mockRestore();
  });

  it('treats a floor without a height as the ground, and a room without a position as having no floor', async () => {
    const flat = areaOf('flat', 'Flat', [{ id: 'f1', title: 'Hall', x: 0, z: 0 }], []);
    (
      flat.map as unknown as { continents: { areas: { subzones: { rooms: { id: string; coords?: object }[] }[] }[] }[] }
    ).continents[0].areas[0].subzones[0].rooms.push({ id: 'nowhere', coords: undefined });
    const rooms = (
      flat.map as unknown as {
        continents: { areas: { subzones: { rooms: { coords: { x: number; y: number; z?: number } }[] }[] }[] }[];
      }
    ).continents[0].areas[0].subzones[0].rooms;
    delete rooms[0].coords.z;
    await open(here(flat, ['f1'], 0));
    expect(tile('f1')).toBeTruthy();
    expect(statusLine()).toContain('Ground floor');
  });

  it('puts a room whose position has no height on the ground floor', async () => {
    const lean = areaOf('forest', 'Deep Forest', [{ id: 'far1', title: 'Mossy Path', x: 0, z: 5 }], [], []);
    delete (
      lean.map as unknown as {
        continents: {
          areas: { subzones: { rooms: { id: string; coords?: { x: number; y: number; z?: number } }[] }[] }[];
        }[];
      }
    ).continents[0].areas[0].subzones[0].rooms[0].coords!.z;
    const api = makeApi({ areas: { town: town(), forest: lean } });
    await open(here(town(), ['r1']), { api });
    await act(async () => void fireEvent.click(picture().querySelector('[data-offpage-to="far1"]')!));
    await waitFor(() => expect(statusLine()).toContain('Looking at Deep Forest · Ground floor'));
    expect(tile('far1')).toBeTruthy();
  });

  it('opens a neighbouring area whose room has no position on its lowest floor', async () => {
    const lean = areaOf(
      'forest',
      'Deep Forest',
      [
        { id: 'far1', title: 'Mossy Path', x: 0, z: 0 },
        { id: 'far3', title: 'Deep Hollow', x: 3, z: -1 },
      ],
      [],
      [],
    );
    delete (
      lean.map as unknown as {
        continents: {
          areas: { subzones: { rooms: { id: string; coords?: { x: number; y: number; z?: number } }[] }[] }[];
        }[];
      }
    ).continents[0].areas[0].subzones[0].rooms[0].coords;
    const api = makeApi({ areas: { town: town(), forest: lean } });
    await open(here(town(), ['r1']), { api });
    await act(async () => void fireEvent.click(picture().querySelector('[data-offpage-to="far1"]')!));
    await waitFor(() => expect(statusLine()).toContain('Looking at Deep Forest · Down 1'));
    expect(tile('far3')).toBeTruthy();
  });

  it('says there is nothing to draw, and keys have nothing to act on, for an area whose rooms have no positions', async () => {
    const unplaced = areaOf('lost', 'Lost', [{ id: 'l1', title: 'Somewhere', x: 0, z: 0 }], []);
    const rooms = (
      unplaced.map as unknown as { continents: { areas: { subzones: { rooms: { coords?: object }[] }[] }[] }[] }
    ).continents[0].areas[0].subzones[0].rooms;
    delete rooms[0].coords;
    await open(here(unplaced, ['l1'], 0));
    expect(picture().textContent).toContain('No room here has a position yet');
    const win = screen.getByRole('dialog');
    for (const key of ['Home', 'PageUp', 'PageDown', 'ArrowLeft']) fireEvent.keyDown(win, { key });
    expect(picture().textContent).toContain('No room here has a position yet');
  });

  it('shows a sentence instead of a picture when the area is not in its own map, and Home does not fail', async () => {
    const wrong = { ...town(), id: 'not-in-its-map' };
    await open(here(wrong, ['r1'], 0));
    expect(screen.queryByTestId('world-map-picture')).toBeNull();
    expect(document.querySelector('p')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Home' });
    expect(screen.queryByTestId('world-map-picture')).toBeNull();
  });

  it('shows a sentence for a neighbouring area none of whose rooms has a position', async () => {
    const bare = areaOf('forest', 'Deep Forest', [{ id: 'far1', title: 'Mossy Path', x: 0, z: 0 }], [], []);
    const rooms = (
      bare.map as unknown as { continents: { areas: { subzones: { rooms: { coords?: object }[] }[] }[] }[] }
    ).continents[0].areas[0].subzones[0].rooms;
    delete rooms[0].coords;
    const api = makeApi({ areas: { town: town(), forest: bare } });
    await open(here(town(), ['r1']), { api });
    await act(async () => void fireEvent.click(picture().querySelector('[data-offpage-to="far1"]')!));
    await waitFor(() => expect(statusLine()).toContain('Looking at Deep Forest'));
    expect(screen.queryByTestId('world-map-picture')).toBeNull();
    expect(document.querySelector('p')?.textContent).toBe('Looking at Deep Forest');
  });

  it('goes back to the player after a drag or a floor change, from the Reset view button and from Centre on me', async () => {
    await open();
    pointer('pointerdown', 10, 10);
    pointer('pointermove', 80, 70);
    pointer('pointerup', 80, 70);
    fireEvent.click(screen.getByRole('button', { name: 'Reset view' }));
    const centre = polygonCenter(tile('r1').getAttribute('points'))!;
    expect(poseOf()).toEqual({ scale: 1, x: BOX.width / 2 - centre.x, y: BOX.height / 2 - centre.y });
    fireEvent.click(screen.getByRole('button', { name: 'Up 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Centre on me' }));
    expect(tile('r1')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ground floor' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('puts the whole picture in view when Reset view is pressed while looking at another area', async () => {
    await open();
    await act(async () => void fireEvent.click(picture().querySelector('[data-offpage-to="far1"]')!));
    await waitFor(() => expect(statusLine()).toContain('Looking at Deep Forest'));
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: /Reset view/ })));
    expect(tile('r1').getAttribute('data-current')).toBe('true');
  });

  it('drops the area of a first click when a second one started while the area was still being read', async () => {
    const api = makeApi();
    const held: ((r: ApiResult<LoadedArea>) => void)[] = [];
    (api.getArea as jest.Mock).mockImplementation(() => new Promise((resolve) => held.push(resolve)));
    await open(here(town(), ['r1']), { api });
    await act(async () => void fireEvent.click(picture().querySelector('[data-offpage-to="far1"]')!));
    await waitFor(() => expect(held).toHaveLength(1));
    await act(async () => void fireEvent.click(picture().querySelector('[data-offpage-to="far2"]')!));
    await act(async () => held[0](ok(forest())));
    expect(screen.queryByRole('button', { name: /Looking at/ })).toBeNull();
  });

  it('drops the answer of a first click when a second one started while it was still waiting for the freshness check', async () => {
    const api = makeApi();
    const release: (() => void)[] = [];
    api.checkFresh.mockImplementation(() => new Promise<void>((resolve) => release.push(resolve)));
    await open(here(town(), ['r1']), { api });
    await act(async () => void fireEvent.click(picture().querySelector('[data-offpage-to="far1"]')!));
    await act(async () => void fireEvent.click(picture().querySelector('[data-offpage-to="far2"]')!));
    await act(async () => release[0]());
    expect(api.getRoomArea).not.toHaveBeenCalledWith('far1', expect.anything());
    await act(async () => release[1]());
    await waitFor(() => expect(api.getRoomArea).toHaveBeenCalledWith('far2', expect.anything()));
  });
});

describe('WorldMapWindow: worlds (a local-only build can show a second one)', () => {
  const other = { id: 'other', label: 'Other game', mapPrefix: '/api/world-map/other' };
  afterEach(() => act(() => __resetMapWorldsForTests()));

  it('a production window names no world: the title is just Map', async () => {
    await open();
    expect(screen.getByRole('dialog', { name: 'Map' })).toBeInTheDocument();
    expect(screen.getByText('Map', { selector: 'span' })).toBeInTheDocument();
    expect(screen.queryByText(/Map ·/)).toBeNull();
  });

  it('names the world when it is not the DSL, and the dialog keeps its name', async () => {
    registerMapWorld(other);
    act(() => setActiveMapWorld('other'));
    await open();
    expect(screen.getByRole('dialog', { name: 'Map' })).toBeInTheDocument();
    expect(screen.getByText('Map · Other game')).toBeInTheDocument();
  });

  it("starts over when the client moves to another world: that world's own client is asked, and the title names it", async () => {
    const first = makeApi();
    const second = makeApi();
    registerMapWorld(other);
    const spy = jest.spyOn(sharedModule, 'sharedWorldMapApi').mockImplementation((world) => (world?.id === 'other' ? second : first));
    try {
      setRoomData({ room: 'Somewhere', exits: [] });
      const session = sessionOf(here(town(), ['r1']));
      render(<WorldMapWindow isOpen onClose={onClose} session={session} settings={store} />);
      await act(async () => undefined);
      expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'dsl' }));
      expect(screen.getByText('Map', { selector: 'span' })).toBeInTheDocument();
      act(() => setActiveMapWorld('other'));
      await act(async () => undefined);
      expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'other' }));
      expect(screen.getByText('Map · Other game')).toBeInTheDocument();
    } finally {
      spy.mockRestore();
    }
  });
});

describe('WorldMapWindow: adding a room', () => {
  const index = {
    available: true,
    versionId: 'v1',
    credits: [],
    continents: [{ id: 'c1', name: 'C', areas: 1, rooms: 4 }],
    areas: [{ id: 'town', name: 'Old Town', continentId: 'c1', rooms: 4 }],
  };
  const withPanelApi = () => {
    const api = makeApi();
    api.getIndex.mockResolvedValue(ok(index));
    api.search.mockResolvedValue(ok({ versionId: 'v1', q: '', total: 0, results: [] }));
    return api;
  };
  const panel = () => screen.queryByRole('group', { name: 'Add a room' });

  it('offers to add the room the player is in when it is not on the map, and opens the panel for that room', async () => {
    setRoomData({ room: 'The House of Arms', sector: 'inside', exits: ['north'] });
    await open({ status: 'unmapped' }, { api: withPanelApi(), withRoom: false });
    DispatchEvent('game:room-data', { room: 'The House of Arms', sector: 'inside', exits: ['north'] });
    const button = await screen.findByRole('button', { name: 'Add this room…' });
    fireEvent.click(button);
    expect(panel()).toBeInTheDocument();
    expect((screen.getByLabelText('Room title') as HTMLInputElement).value).toBe('The House of Arms');
    expect(await screen.findByLabelText('Exit N leads to')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add this room…' })).toBeNull(); // the panel is open: no second offer
  });

  it('does not offer it while the player is on the map', async () => {
    await open();
    expect(screen.queryByRole('button', { name: 'Add this room…' })).toBeNull();
  });

  it('adds a room by hand from the settings menu, which closes behind it, and Escape closes the panel before the window', async () => {
    await open(here(town(), ['r1']), { api: withPanelApi() });
    fireEvent.click(screen.getByRole('button', { name: 'Map settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add a room by hand…' }));
    expect(panel()).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Map settings' })).toBeNull();
    expect((screen.getByLabelText('Room title') as HTMLInputElement).value).toBe('');
    await act(async () => undefined);
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Map' }), { key: 'Escape' });
    expect(panel()).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Map' }), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('types a room in by hand when the game has not reported one, and Cancel puts the panel away', async () => {
    resetRoomData();
    await open({ status: 'unmapped' }, { api: withPanelApi(), withRoom: false });
    fireEvent.click(screen.getByRole('button', { name: 'Map settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add a room by hand…' }));
    expect(screen.getByRole('heading', { name: 'Add a room' })).toBeInTheDocument();
    await act(async () => undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(panel()).toBeNull();
  });

  it('takes a saved room into the map: the player\'s own rooms are the layer the page store holds', async () => {
    const { createLayerStore } = await import('../features/worldmap/mine/layerStore');
    const { memoryKvStore } = await import('../features/autoleveling/autoleveling-idb');
    const layers = createLayerStore(memoryKvStore());
    setRoomData({ room: 'The House of Arms', exits: [] });
    const session = sessionOf({ status: 'unmapped' });
    const api = withPanelApi();
    render(<WorldMapWindow isOpen onClose={onClose} session={session} api={api} settings={store} layers={layers} />);
    await act(async () => undefined);
    DispatchEvent('game:room-data', { room: 'The House of Arms', exits: [] });
    fireEvent.click(await screen.findByRole('button', { name: 'Add this room…' }));
    await waitFor(() => expect((screen.getByLabelText('Area') as HTMLSelectElement).value).toBe('__new__'));
    fireEvent.change(screen.getByLabelText('Continent'), { target: { value: 'c1' } });
    await waitFor(() => expect((screen.getByLabelText('Area') as HTMLSelectElement).value).toBe('town'));
    await waitFor(() => expect((screen.getByLabelText('Subzone') as HTMLSelectElement).value).toBe('town-main'));
    fireEvent.click(screen.getByRole('button', { name: 'Save room' }));
    await waitFor(() => expect(panel()).toBeNull());
    expect((await layers.get('dsl')).continents[0].areas[0].subzones[0].rooms.map((r) => r.title)).toEqual(['The House of Arms']);
  });
});

describe('WorldMapWindow: adding a room the game gave no exits for', () => {
  it('opens the panel with no exit rows', async () => {
    const api = makeApi();
    api.getIndex.mockResolvedValue(ok({ available: true, versionId: 'v1', credits: [], continents: [], areas: [] }));
    api.search.mockResolvedValue(ok({ versionId: 'v1', q: '', total: 0, results: [] }));
    setRoomData({ room: 'Dark Room' });
    await open({ status: 'unmapped' }, { api, withRoom: false });
    DispatchEvent('game:room-data', { room: 'Dark Room' });
    fireEvent.click(await screen.findByRole('button', { name: 'Add this room…' }));
    expect(await screen.findByText('The game showed no exits here.')).toBeInTheDocument();
  });
});

describe('WorldMapWindow: fog of war', () => {
  const identity = (name: string | undefined): void => {
    (window as unknown as { __SA_IDENTITY__?: unknown }).__SA_IDENTITY__ = name === undefined ? undefined : { characterName: name };
  };
  afterEach(() => identity(undefined));

  async function openFog(fog: 'off' | 'user' | 'character', visited: { character: string; ids: string[] }[], current = 'Aldric-M', location: Location = here(town(), ['r1'])) {
    const { createVisitStore } = await import('../features/worldmap/fog/visits');
    const { memoryKvStore } = await import('../features/autoleveling/autoleveling-idb');
    const visits = createVisitStore(memoryKvStore());
    for (const v of visited) for (const id of v.ids) await visits.record({ world: 'dsl', account: 'local', character: v.character }, id);
    identity(current);
    store.set({ fog });
    setRoomData({ room: 'Somewhere', exits: [] });
    const session = sessionOf(location);
    const view = render(<WorldMapWindow isOpen onClose={onClose} session={session} api={makeApi()} settings={store} visits={visits} />);
    await waitFor(() => expect(session.observe).toHaveBeenCalled());
    await act(async () => undefined);
    return { visits, ...view };
  }

  it('is off by default: every room is drawn, there is no eye, and the gear offers the three choices with Off chosen', async () => {
    await open();
    expect(tile('r1')).not.toBeNull();
    expect(tile('r2')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /Fog of war is on/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Map settings' }));
    const radios = screen.getAllByRole('radio', { name: /Off \(show everything\)|Rooms my account has visited|Rooms this character has visited/ });
    expect(radios.map((r) => (r as HTMLInputElement).checked)).toEqual([true, false, false]);
  });

  it('shows only what the character has visited: the unvisited room, its name and the floors above and below are gone, and the exit to it is a stub', async () => {
    await openFog('character', [{ character: 'Aldric-M', ids: ['r1'] }, { character: 'Mira-F', ids: ['r2', 'u1'] }]);
    expect(tile('r1')).not.toBeNull();
    expect(tile('r2')).toBeNull();
    expect(picture().innerHTML).not.toContain('Mill Road');
    expect(picture().querySelector('[data-offpage-to]')).toBeNull(); // no exit that names a place the player has not been
    expect(screen.queryByRole('group', { name: 'Floors' })).toBeNull(); // only the ground floor has a visited room
    expect(ghostFloors()).toEqual([]);
  });

  it('shows what every character of the account has visited at the user level', async () => {
    await openFog('user', [{ character: 'Aldric-M', ids: ['r1'] }, { character: 'Mira-F', ids: ['r2', 'u1'] }]);
    expect(tile('r2')).not.toBeNull();
    expect(picture().innerHTML).toContain('Mill Road');
    expect(screen.getByRole('group', { name: 'Floors' })).toBeInTheDocument(); // the attic is a visited floor now
    expect(tile('d1')).toBeNull(); // the cellar was visited by nobody
  });

  it('always shows the room the player stands in, even before a visit was recorded', async () => {
    await openFog('character', []);
    expect(tile('r1')).not.toBeNull();
    expect(tile('r2')).toBeNull();
  });

  it('keeps an exit into another area whose room has been visited, and hides it when it has not', async () => {
    await openFog('character', [{ character: 'Aldric-M', ids: ['r1', 'r2', 'far1'] }]);
    const arrows = new Set(Array.from(picture().querySelectorAll('[data-offpage-to]')).map((e) => e.getAttribute('data-offpage-to')));
    expect([...arrows]).toEqual(['far1']); // far2 (west of the square) was never visited
  });

  it('follows a visit recorded while the window is open', async () => {
    const { visits } = await openFog('character', [{ character: 'Aldric-M', ids: ['r1'] }]);
    expect(tile('r2')).toBeNull();
    await act(async () => void (await visits.record({ world: 'dsl', account: 'local', character: 'Aldric-M' }, 'r2')));
    expect(tile('r2')).not.toBeNull();
  });

  it('shows a small eye in the header only while fog is on, which opens the settings; choosing a level redraws at once', async () => {
    await openFog('character', [{ character: 'Aldric-M', ids: ['r1'] }, { character: 'Mira-F', ids: ['r2'] }]);
    const eye = screen.getByRole('button', { name: 'Fog of war is on: Rooms this character has visited. Click to change' });
    expect(screen.queryByRole('group', { name: 'Map settings' })).toBeNull();
    fireEvent.click(eye);
    expect(screen.getByRole('group', { name: 'Map settings' })).toBeInTheDocument();
    expect(tile('r2')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'Rooms my account has visited' }));
    expect(store.get().fog).toBe('user');
    await waitFor(() => expect(tile('r2')).not.toBeNull());
    fireEvent.click(screen.getByRole('radio', { name: 'Off (show everything)' }));
    expect(screen.queryByRole('button', { name: /Fog of war is on/ })).toBeNull();
    expect(tile('d1')).toBeNull(); // the cellar is another floor: off shows it again when that floor is chosen
    expect(screen.getByRole('group', { name: 'Floors' })).toBeInTheDocument();
  });

  it('applies the fog to another area looked at through an exit, too', async () => {
    await openFog('character', [{ character: 'Aldric-M', ids: ['r1', 'r2', 'far1'] }]);
    fireEvent.click(picture().querySelector('[data-offpage-to="far1"]') as Element);
    await waitFor(() => expect(screen.getAllByText('Deep Forest').length).toBeGreaterThan(0));
    expect(tile('far1')).not.toBeNull();
    expect(tile('far2')).toBeNull();
  });
});

describe('WorldMapWindow: the help (the blue i)', () => {
  const helpArticle = () => screen.queryByRole('article', { name: 'Map help' });

  it('has a blue (i) in the header; its help lies over the map and Back or the i again returns', async () => {
    await open();
    expect(helpArticle()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Help: the map' }));
    expect(helpArticle()).toHaveTextContent('Your own rooms');
    expect(helpArticle()).toHaveTextContent('Fog of war');
    fireEvent.click(screen.getByRole('button', { name: '← Back to the map' }));
    expect(helpArticle()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Help: the map' }));
    fireEvent.click(screen.getByRole('button', { name: 'Help: the map' }));
    expect(helpArticle()).toBeNull();
  });

  it('Escape closes the help before the window', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Help: the map' }));
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Map' }), { key: 'Escape' });
    expect(helpArticle()).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Map' }), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe('in the shared window stack', () => {
    it('Escape works with the focus anywhere on the page, and closes the innermost thing first: help, the menu, then the window', async () => {
      await open();
      fireEvent.click(screen.getByRole('button', { name: 'Help: the map' }));
      expect(screen.getByRole('article', { name: 'Map help' })).toBeInTheDocument();
      fireEvent.keyDown(document.body, { key: 'Escape' }); // the focus is on the page, not in the window
      expect(screen.queryByRole('article', { name: 'Map help' })).toBeNull();
      expect(onClose).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Map settings' }));
      expect(screen.getByRole('group', { name: 'Map settings' })).toBeInTheDocument();
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(screen.queryByRole('group', { name: 'Map settings' })).toBeNull();
      expect(onClose).not.toHaveBeenCalled();

      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('is drawn above a window that was open before it, and a press in it puts it back on top of one opened after it', async () => {
      const Other: React.FC<{ open: boolean }> = ({ open: isOpen }) => {
        const layer = useWindowLayer({ open: isOpen, onEscape: () => undefined });
        return <div data-testid="other" style={{ zIndex: layer.zIndex }} />;
      };
      const z = (el: Element | null) => Number((el as HTMLElement).style.zIndex);
      const earlier = render(<Other open />).container.firstElementChild;
      await open();
      const map = screen.getByRole('dialog', { name: 'Map' });
      expect(z(map)).toBeGreaterThan(z(earlier));

      const later = render(<Other open />).container.firstElementChild; // opened after the map: on top of it
      expect(z(later)).toBeGreaterThan(z(map));
      fireEvent.pointerDown(screen.getByRole('button', { name: 'Close the map' })); // a press in the window (the start of a drag)
      expect(z(map)).toBeGreaterThan(z(later));
    });

    it('leaves the stack when it closes, so Escape then goes to the window below', async () => {
      const closed: string[] = [];
      const Below: React.FC = () => {
        useWindowLayer({ open: true, onEscape: () => closed.push('below') });
        return null;
      };
      render(<Below />);
      const view = await open();
      view.rerender(<WorldMapWindow isOpen={false} onClose={onClose} session={view.session} api={view.api} settings={store} />);
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(closed).toEqual(['below']);
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});

describe('WorldMapWindow: the wheel and the add-room panel together', () => {
  it('zooms in when the wheel turns up and out when it turns down, with the add-room panel closed', async () => {
    await open();
    const before = poseOf().scale;
    act(() => void viewport().dispatchEvent(new WheelEvent('wheel', { deltaY: -200, clientX: 100, clientY: 100, bubbles: true, cancelable: true })));
    const zoomedIn = poseOf().scale;
    expect(zoomedIn).toBeGreaterThan(before);
    act(() => void viewport().dispatchEvent(new WheelEvent('wheel', { deltaY: 400, clientX: 100, clientY: 100, bubbles: true, cancelable: true })));
    expect(poseOf().scale).toBeLessThan(zoomedIn);
    expect(screen.queryByRole('group', { name: 'Add a room' })).toBeNull();
  });
});

describe('WorldMapWindow: the cloud backup in the gear', () => {
  it('lists Cloud backup in the gear, sends nothing until Sync now, then sends this world and shows the answer', async () => {
    const sync = jest.fn(async () => ({ kind: 'ok' as const, data: { version: 1 as const, worlds: { dsl: { visited: { A: ['r1'] }, added: [] } } } }));
    const backup = { sync, erase: jest.fn(async () => ({ kind: 'ok' as const, data: undefined })) };
    setRoomData({ room: 'Somewhere', exits: [] });
    const session = sessionOf(here(town(), ['r1']));
    render(<WorldMapWindow isOpen onClose={onClose} session={session} api={makeApi()} settings={store} backup={backup} />);
    await waitFor(() => expect(session.observe).toHaveBeenCalled());

    expect(screen.queryByText('Cloud backup')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Map settings' }));
    expect(screen.getByText('Cloud backup')).toBeInTheDocument();
    expect(sync).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));
    await waitFor(() => expect(screen.getByTestId('map-backup-result')).toHaveTextContent('Your account has 1 explored room'));
    expect(sync).toHaveBeenCalledTimes(1);
    expect(Object.keys((sync.mock.calls[0] as unknown as [{ worlds: object }])[0].worlds)).toEqual(['dsl']);
  });
});

describe('WorldMapWindow: erasing the cloud backup from the gear', () => {
  it('asks first, then calls the injected backup api once and shows the result in the gear', async () => {
    const erase = jest.fn(async () => ({ kind: 'ok' as const, data: undefined }));
    const backup = { sync: jest.fn(), erase };
    setRoomData({ room: 'Somewhere', exits: [] });
    const session = sessionOf(here(town(), ['r1']));
    render(<WorldMapWindow isOpen onClose={onClose} session={session} api={makeApi()} settings={store} backup={backup} />);
    await waitFor(() => expect(session.observe).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Map settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Erase my backup…' }));
    expect(erase).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, erase it' }));
    await waitFor(() => expect(screen.getByTestId('map-backup-result')).toHaveTextContent('Backup erased from your account.'));
    expect(erase).toHaveBeenCalledTimes(1);
    expect(backup.sync).not.toHaveBeenCalled();
  });
});

describe('WorldMapWindow: choosing the map by hand (only where a build has more than one world)', () => {
  const other = { id: 'other', label: 'Other game', mapPrefix: '/api/world-map/other' };
  afterEach(() => act(() => __resetMapWorldsForTests()));

  it('a one-world build has no map choice in the gear', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Map settings' }));
    expect(screen.queryByRole('combobox', { name: 'Which map to show' })).toBeNull();
  });

  it('with two worlds the gear offers the choice; picking the DSL while connected to the other game asks the DSL map, and Automatic goes back', async () => {
    const first = makeApi();
    const second = makeApi();
    registerMapWorld(other);
    act(() => setActiveMapWorld('other')); // the connection chose the other game
    const spy = jest.spyOn(sharedModule, 'sharedWorldMapApi').mockImplementation((world) => (world?.id === 'other' ? second : first));
    try {
      setRoomData({ room: 'Somewhere', exits: [] });
      const session = sessionOf(here(town(), ['r1']));
      render(<WorldMapWindow isOpen onClose={onClose} session={session} settings={store} />);
      await act(async () => undefined);
      expect(screen.getByText('Map · Other game')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Map settings' }));
      const select = screen.getByRole('combobox', { name: 'Which map to show' }) as HTMLSelectElement;
      expect(select.value).toBe('auto');
      fireEvent.change(select, { target: { value: 'dsl' } });
      await act(async () => undefined);
      expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'dsl' }));
      expect(screen.getByText('Map', { selector: 'span' })).toBeInTheDocument();
      expect(screen.queryByText('Map · Other game')).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: 'Map settings' }));
      fireEvent.change(screen.getByRole('combobox', { name: 'Which map to show' }), { target: { value: 'auto' } });
      await act(async () => undefined);
      expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'other' }));
      expect(screen.getByText('Map · Other game')).toBeInTheDocument();
    } finally {
      spy.mockRestore();
    }
  });
});

describe('WorldMapWindow: the "you are here" dot', () => {
  const dots = () => Array.from(picture().querySelectorAll('[data-you-are-here]'));
  const toggle = () => screen.getByRole('button', { name: 'Show where I am' });

  it('draws a red dot on the middle of the player\'s room, on by default, and the button shows it is on', async () => {
    await open();
    expect(dots()).toHaveLength(1);
    const dot = dots()[0];
    expect(dot.getAttribute('data-you-are-here')).toBe('r1');
    expect(dot.getAttribute('fill')).toBe('#e5252a');
    expect(dot.getAttribute('opacity')).toBe('1');
    const centre = polygonCenter(tile('r1').getAttribute('points'))!;
    expect([Number(dot.getAttribute('cx')), Number(dot.getAttribute('cy'))]).toEqual([centre.x, centre.y]);
    expect(Number(dot.getAttribute('r'))).toBeGreaterThan(3);
    expect(toggle()).toHaveAttribute('aria-pressed', 'true');
    expect(toggle()).toBeEnabled();
  });

  it('is drawn on top of the picture and never catches a click', async () => {
    await open();
    const svg = picture().querySelector('svg')!;
    expect(svg.lastElementChild).toBe(dots()[0]);
    expect(dots()[0].getAttribute('pointer-events')).toBe('none');
  });

  it('the toggle takes it off and puts it back, keeps the choice in the settings, and does not move the view', async () => {
    await open();
    const pose = poseOf();
    fireEvent.click(toggle());
    expect(dots()).toHaveLength(0);
    expect(store.get().here).toBe(false);
    expect(toggle()).toHaveAttribute('aria-pressed', 'false');
    expect(poseOf()).toEqual(pose);
    expect(tile('r1').getAttribute('data-current')).toBe('true'); // the room itself is still marked
    fireEvent.click(toggle());
    expect(dots()).toHaveLength(1);
    expect(store.get().here).toBe(true);
    expect(poseOf()).toEqual(pose);
  });

  it('stays off when it was saved as off', async () => {
    store.set({ here: false });
    await open();
    expect(dots()).toHaveLength(0);
    expect(toggle()).toHaveAttribute('aria-pressed', 'false');
  });

  it('is fainter when it is only probably this room, and on every room that looks alike', async () => {
    const first = await open(here(town(), ['r1'], 0, false));
    expect(dots()).toHaveLength(1);
    expect(dots()[0].getAttribute('opacity')).toBe('0.6');
    first.unmount();
    await open(here(town(), ['r1', 'r2']));
    expect(dots().map((d) => d.getAttribute('data-you-are-here'))).toEqual(['r1', 'r2']);
    expect(dots().every((d) => d.getAttribute('opacity') === '0.6')).toBe(true);
  });

  it('is not drawn when the player is on no room of the map, and the button still works as a setting', async () => {
    await open(here(town(), []));
    expect(dots()).toHaveLength(0);
    expect(toggle()).toBeEnabled();
    fireEvent.click(toggle());
    expect(store.get().here).toBe(false);
  });

  it('is disabled while there is no picture at all (the player is nowhere the map knows)', async () => {
    await open(null);
    expect(toggle()).toBeDisabled();
  });

  it('is not drawn on a floor the player is not on, and comes back with the floor', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Up 1' }));
    expect(dots()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Ground floor' }));
    expect(dots()).toHaveLength(1);
  });

  it('is not drawn while another area is being looked at, and is back after Reset view', async () => {
    await open();
    await act(async () => void fireEvent.click(picture().querySelector('[data-offpage-to="far1"]')!));
    await waitFor(() => expect(screen.getAllByText('Deep Forest').length).toBeGreaterThan(0));
    expect(dots()).toHaveLength(0);
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Looking at Deep Forest · Reset view' })));
    expect(dots()).toHaveLength(1);
    expect(dots()[0].getAttribute('data-you-are-here')).toBe('r1');
  });

  it('moves with the player to the next room', async () => {
    const shared = town();
    const session = sessionOf(here(shared, ['r1']), here(shared, ['r2']));
    await open(undefined, { session });
    expect(dots()[0].getAttribute('data-you-are-here')).toBe('r1');
    await act(async () => void DispatchEvent('game:room-data', { room: 'Mill Road', exits: [] }));
    await waitFor(() => expect(dots()[0]?.getAttribute('data-you-are-here')).toBe('r2'));
    expect(dots()).toHaveLength(1);
  });
});
