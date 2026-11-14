// apps/game-client/src/features/worldmap/sync/backup.ts
//
// The map backup (Phase 44): the player's own cloud backup of WHICH rooms they explored and WHICH rooms they added, on the Shattered Archive site under
// their account. Ids only (no titles, descriptions or times). It runs ONLY when the player presses the sync command in the map window (never in the
// background, never on a timer), and only for the world the window is showing. The site unions what it holds with what is sent and answers the union, so
// the explored rooms of the player's other devices come back into this browser's record. A room the player ADDED keeps its content in the browser that
// added it: another device learns only that such a room exists (its id), not what it is.
//
// The shape is the site's (Server.Dsl/Maps/MapVisitSync.cs):
//   { version: 1, worlds: { <world>: { visited: { <character>: [roomId...] }, added: [roomId...] } } }
// The account the site files it under is the sign-in token's; this code never names an account.

import { layerRooms } from '@shatteredarchive/shattered-maps-core';
import { deleteMapVisitsCloud, syncMapVisitsCloud, type CloudSyncResult } from '../../auth/cloudSync';
import { currentScope, type Scope } from '../fog/identity';
import type { VisitStore } from '../fog/visits';
import type { LayerStore } from '../mine/layerStore';

export interface MapBackupWorld {
  visited: Record<string, string[]>;
  added: string[];
}

export interface MapBackupDocument {
  version: 1;
  worlds: Record<string, MapBackupWorld>;
}

/** The two calls the backup makes (tests give fakes; the page uses the site's). */
export interface BackupApi {
  sync(doc: MapBackupDocument): Promise<CloudSyncResult<MapBackupDocument>>;
  erase(): Promise<CloudSyncResult<void>>;
}

export const siteBackupApi: BackupApi = { sync: syncMapVisitsCloud, erase: deleteMapVisitsCloud };

export type BackupOutcome =
  | {
      kind: 'done';
      /** Rooms explored in this world on the account after the sync (all characters). */
      explored: number;
      /** Rooms the site had that this browser did not: now in the record. */
      exploredNew: number;
      /** Rooms added by hand that the account holds. */
      added: number;
      /** Added rooms the account holds whose content is in another browser (this one cannot show them). */
      addedElsewhere: number;
    }
  | { kind: 'signed-out' }
  | { kind: 'error'; message: string };

export interface BackupDeps {
  world: string;
  visits: VisitStore;
  layers: LayerStore;
  api?: BackupApi;
  /** Who is playing (default: the token and the game's identity). Only the world and the account key are used. */
  scope?: Scope;
}

const unique = (ids: Iterable<string>): string[] => [...new Set(ids)].sort();

/** What this browser holds for the world: the explored rooms per character and the ids of the rooms added. */
async function localWorld(deps: Pick<BackupDeps, 'world' | 'visits' | 'layers'>, scope: Scope): Promise<MapBackupWorld> {
  await deps.visits.load(scope);
  const layer = await deps.layers.get(deps.world);
  return { visited: deps.visits.byCharacter(scope), added: unique(layerRooms(layer).map((room) => room.roomId)) };
}

/** What this browser holds for the world, as the document the site expects. */
export async function localDocument(deps: Pick<BackupDeps, 'world' | 'visits' | 'layers' | 'scope'>): Promise<MapBackupDocument> {
  return { version: 1, worlds: { [deps.world]: await localWorld(deps, deps.scope ?? currentScope(deps.world)) } };
}

const failure = (result: Exclude<CloudSyncResult<unknown>, { kind: 'ok' }>): BackupOutcome =>
  result.kind === 'unauthenticated' ? { kind: 'signed-out' } : { kind: 'error', message: result.message };

/** Sends this browser's lists for the world, takes the site's union back into the visit record, and reports counts. */
export async function syncBackup(deps: BackupDeps): Promise<BackupOutcome> {
  const api = deps.api ?? siteBackupApi;
  const scope = deps.scope ?? currentScope(deps.world);
  const local = await localWorld(deps, scope);
  const answer = await api.sync({ version: 1, worlds: { [deps.world]: local } });
  if (answer.kind !== 'ok') return failure(answer);

  const world = answer.data?.worlds?.[deps.world];
  const visited = world?.visited ?? {};
  const exploredNew = await deps.visits.addMany(scope, visited);
  const mine = new Set(local.added);
  const added = world?.added ?? [];
  return {
    kind: 'done',
    explored: unique(Object.values(visited).flat()).length,
    exploredNew,
    added: added.length,
    addedElsewhere: added.filter((id) => !mine.has(id)).length,
  };
}

/** Erases the account's backup on the site (this browser's own record is untouched). */
export async function eraseBackup(api: BackupApi = siteBackupApi): Promise<'erased' | BackupOutcome> {
  const answer = await api.erase();
  return answer.kind === 'ok' ? 'erased' : failure(answer);
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** The result of a press, in the words the window shows. */
export function describeOutcome(outcome: BackupOutcome | 'erased'): string {
  if (outcome === 'erased') return 'Backup erased from your account. The rooms in this browser are untouched.';
  switch (outcome.kind) {
    case 'signed-out':
      return 'Sign in to your Shattered Archive account to use the backup.';
    case 'error':
      return `Could not reach your backup: ${outcome.message}`;
    case 'done': {
      const explored = `Backed up. Your account has ${plural(outcome.explored, 'explored room', 'explored rooms')}${
        outcome.exploredNew > 0 ? ` (${outcome.exploredNew} new here)` : ''
      }.`;
      if (outcome.added === 0) return explored;
      const elsewhere =
        outcome.addedElsewhere > 0 ? `, ${outcome.addedElsewhere} on other devices (their details stay there)` : '';
      return `${explored} ${plural(outcome.added, 'room you added', 'rooms you added')}${elsewhere}.`;
    }
  }
}
