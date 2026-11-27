import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { MapProvider } from '../state/mapStore';
import { STORAGE_KEY } from '../state/persist';
import { doc, exit, room } from '../testing/fixtures';
import MapAreaPage from './MapAreaPage';
import MapRoomPage from './MapRoomPage';

/**
 * The two hexagon pages, in the real provider. Every area has its own origin, so a page must draw one area on one floor: before
 * these tests the pages drew every room of the floor, all on top of each other.
 */

class FakeChannel {
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  postMessage(): void {}
  close(): void {}
}

beforeAll(() => {
  Object.assign(globalThis, { BroadcastChannel: FakeChannel });
});

// area a1: Alpha and Beta on floor 0; area a2: Gamma at the same place as Alpha, Delta above it, and a room with no area at all
function twoAreas() {
  const d = doc([
    room('A', 0, 0, 0, { E: exit('B') }, 'Alpha'),
    room('B', 4, 0, 0, { W: exit('A') }, 'Beta'),
    room('G', 0, 0, 0, { U: exit('H') }, 'Gamma', undefined, 'a2'),
    room('H', 0, 0, 1, { D: exit('G') }, 'Delta', undefined, 'a2'),
  ]);
  d.rooms.Z = { vnum: 'Z', label: 'Loose', coords: { cx: 0, cy: 0, vz: 0 }, exits: {} };
  return d;
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(twoAreas()));
});

const labels = (): string[] => [...document.querySelectorAll('text.hex__label title')].map((t) => t.textContent ?? '').sort();
const polygons = (): number => document.querySelectorAll('svg polygon').length;

function at(path: string) {
  render(
    <MapProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/map/:continent/:area" element={<MapAreaPage />} />
          <Route path="/map/room/:vnum" element={<MapRoomPage />} />
        </Routes>
      </MemoryRouter>
    </MapProvider>,
  );
}

describe('MapAreaPage', () => {
  it('draws only the rooms of its area on the chosen floor', () => {
    at('/map/c/a1?level=0');
    expect(labels()).toEqual(['Alpha', 'Beta']);
    expect(polygons()).toBe(2);
  });

  it('draws another area and another floor from the same document', () => {
    at('/map/c/a2?level=1');
    expect(labels()).toEqual(['Delta']);
  });

  it('does not draw rooms that belong to no area, and draws nothing for an unknown area', () => {
    at('/map/c/nowhere?level=0');
    expect(labels()).toEqual([]);
    expect(screen.getByText('Area:')).toBeTruthy();
  });

  it('starts on floor 0 without a level in the address', () => {
    at('/map/c/a2');
    expect(labels()).toEqual(['Gamma']);
    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('0');
  });
});

describe('the level controls', () => {
  it('move the area page up and down a floor, and take a typed floor', () => {
    at('/map/c/a2?level=0');
    expect(labels()).toEqual(['Gamma']);
    fireEvent.click(screen.getByRole('button', { name: '▲' }));
    expect(labels()).toEqual(['Delta']);
    fireEvent.click(screen.getByRole('button', { name: '▼' }));
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '1' } });
    expect(labels()).toEqual(['Delta']);
  });

  it('move the room page up and down a floor', () => {
    at('/map/room/G');
    fireEvent.click(screen.getByRole('button', { name: '▲' }));
    expect(labels()).toEqual(['Delta']);
    fireEvent.click(screen.getByRole('button', { name: '▼' }));
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '1' } });
    expect(labels()).toEqual(['Delta']);
  });
});

describe('tile labels', () => {
  it('cut a long room name to the tile and keep the full name in the tooltip', () => {
    const d = twoAreas();
    d.rooms.L = room('L', 8, 0, 0, {}, 'A very long road name through the fields', undefined, 'a3');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
    at('/map/c/a3?level=0');
    const shownText = [...document.querySelector('text.hex__label')!.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent);
    expect(shownText).toEqual(['A very lon…']);
    expect(labels()).toEqual(['A very long road name through the fields']);
  });
});

describe('MapRoomPage', () => {
  it("draws the focused room's area on the room's own floor when no level is given", () => {
    at('/map/room/H');
    expect(labels()).toEqual(['Delta']);
    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('1');
  });

  it('keeps to the area of the room, however many other areas share its floor', () => {
    at('/map/room/G?level=0');
    expect(labels()).toEqual(['Gamma']);
  });

  it('honours an explicit level, even one where the room is not', () => {
    at('/map/room/G?level=1');
    expect(labels()).toEqual(['Delta']);
  });

  it('draws just the room itself when it belongs to no area', () => {
    at('/map/room/Z');
    expect(labels()).toEqual(['Loose']);
  });

  it('draws nothing for a room that is not in the document', () => {
    at('/map/room/unknown');
    expect(polygons()).toBe(0);
  });
});
