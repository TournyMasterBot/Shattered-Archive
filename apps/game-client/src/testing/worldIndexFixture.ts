import type { LoadState, WorldIndex } from '../features/simulacrumAdmin/useWorldIndex';
import type { WorldArea, WorldRoom } from '../features/simulacrumAdmin/worldApi';

/** Placeholder areas and rooms for tests (no real world data). */
export const FIXTURE_AREAS: WorldArea[] = [
  { file: 'alpha.are', name: 'Alpha Keep', minVnum: 3000, maxVnum: 3099, rooms: 3 },
  { file: 'beta.are', name: 'Beta Marsh', minVnum: 4000, maxVnum: 4099, rooms: 2 },
  { file: 'gamma.are', rooms: 0, parseError: 'bad section' },
];

export const FIXTURE_ROOMS: Record<string, WorldRoom[]> = {
  'alpha.are': [
    { vnum: 3001, name: 'The Great Hall' },
    { vnum: 3002, name: 'The Armoury' },
    { vnum: 3010, name: 'A Dark Cellar' },
  ],
  'beta.are': [
    { vnum: 4001, name: 'A Reedy Bank' },
    { vnum: 4002, name: 'The Sinking Path' },
  ],
};

export interface FixtureOptions {
  areas?: LoadState<WorldArea[]>;
  rooms?: Record<string, LoadState<WorldRoom[]>>;
}

/** A world index whose state the test fixes, with spies for what the UI asks of it. */
export function makeIndex(options: FixtureOptions = {}): WorldIndex & {
  loadRooms: jest.Mock;
  reloadRooms: jest.Mock;
  refresh: jest.Mock;
} {
  const ready = <T,>(data: T): LoadState<T> => ({ status: 'ready', data, at: new Date(2026, 10, 13, 9, 30, 15).getTime() });
  const rooms = options.rooms ?? Object.fromEntries(Object.entries(FIXTURE_ROOMS).map(([file, list]) => [file, ready(list)]));
  return {
    areas: options.areas ?? ready(FIXTURE_AREAS),
    rooms: new Map(Object.entries(rooms)),
    loadRooms: jest.fn(),
    reloadRooms: jest.fn(),
    refresh: jest.fn(),
  };
}
