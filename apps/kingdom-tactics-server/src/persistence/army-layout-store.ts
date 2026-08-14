import { JsonAccountStore } from './json-account-store.js';

/** Mirrors kt-client's `state/saved-armies.ts` SavedArmy/ArmyPick shape exactly (whole-collection sync, same idiom as Phase C's scripts/plugin-configs). */
export interface ArmyPick {
  readonly raceKey: string;
  readonly classKey: string;
  readonly god?: string;
}

export interface SavedArmy {
  readonly name: string;
  readonly picks: readonly ArmyPick[];
}

/** Generous cap — army layouts are small, user-curated data, not fast-growing telemetry (contrast MatchHistoryStore's 25). */
const MAX_ARMIES_PER_ACCOUNT = 100;

export class ArmyLayoutStore {
  private readonly store: JsonAccountStore<SavedArmy>;

  constructor(dataDir: string) {
    this.store = new JsonAccountStore<SavedArmy>(dataDir, 'army-layouts');
  }

  list(accountId: string): SavedArmy[] {
    return this.store.list(accountId);
  }

  save(accountId: string, armies: readonly SavedArmy[]): void {
    this.store.save(accountId, armies.slice(0, MAX_ARMIES_PER_ACCOUNT));
  }
}
