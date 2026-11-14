// apps/game-client/src/features/worldmap/mine/history.ts
//
// "From my game history": where the add-room flow learns what the player's own play knows about a room and the rooms next to it. A source
// answers for one room (its title and exits) with the walked rooms that match, each with the titles its exits lead to. Sources are tried in
// the order they were registered and the first one with an answer wins: the local Copilot server's walked layer (a local build registers it,
// features/copilot/mapHistory.ts), then this browser's own trail (trail.ts). Nothing here imports Copilot: the map is a production feature.

export interface HistoryNeighbour {
  /** Compass letters: N, NE, E, SE, S, SW, W, NW, U, D. */
  dir: string;
  /** The title of the room that exit leads to, as the game printed it. */
  title: string;
}

export interface HistoryRoom {
  source: string;
  title: string;
  sector?: string;
  /** The exits the history saw the room with. */
  exits: string[];
  neighbours: HistoryNeighbour[];
  visits: number;
  /** The exits are exactly the ones of the room being added. */
  sameExits: boolean;
}

export interface RoomObservation {
  title: string;
  /** Compass letters. */
  exits: string[];
}

export interface HistorySource {
  /** A short name for the panel ("your Copilot history", "this browser"). */
  label: string;
  find(world: string, observation: RoomObservation, signal: AbortSignal): Promise<HistoryRoom[]>;
}

const sources: HistorySource[] = [];
const fallbacks = new Set<HistorySource>();

/**
 * Adds a source after the ones already there. A `fallback` source is asked only after every other one, whenever it was added (this browser's own
 * trail is registered at page start, before the local Copilot source exists). Returns the function that removes it.
 */
export function registerHistorySource(source: HistorySource, options: { fallback?: boolean } = {}): () => void {
  sources.push(source);
  if (options.fallback) fallbacks.add(source);
  return () => {
    const at = sources.indexOf(source);
    if (at >= 0) sources.splice(at, 1);
    fallbacks.delete(source);
  };
}

export interface HistoryAnswer {
  label: string;
  rooms: HistoryRoom[];
}

/** The first source that knows the room answers; a source that fails counts as knowing nothing. Null when none does. */
export async function findHistory(world: string, observation: RoomObservation, signal: AbortSignal): Promise<HistoryAnswer | null> {
  const ordered = [...sources.filter((s) => !fallbacks.has(s)), ...sources.filter((s) => fallbacks.has(s))];
  for (const source of ordered) {
    if (signal.aborted) return null;
    let rooms: HistoryRoom[] = [];
    try {
      rooms = await source.find(world, observation, signal);
    } catch {
      rooms = [];
    }
    if (rooms.length > 0) return { label: source.label, rooms };
  }
  return null;
}

/** Test-only: forget every registered source. */
export function __resetHistorySourcesForTests(): void {
  sources.length = 0;
  fallbacks.clear();
}
