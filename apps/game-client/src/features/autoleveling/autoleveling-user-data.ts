// apps/game-client/src/features/autoleveling/autoleveling-user-data.ts

/**
 * Auto-leveling USER data (local, syncable)
 * ----------------------------------------
 * Everything the player adds on top of the C#-served area content — custom kill
 * targets, buff-checklist overlays, per-class fight-command overlays, custom
 * paths, and small prefs (remembered class). Persisted in its own IndexedDB
 * database so it can later be diffed and synced to the account profile
 * (records carry `id` + `updatedAt`).
 *
 * On first use it migrates the legacy localStorage stores
 * (autoleveling-saved-targets, autoleveling-user-paths) in.
 */

import { indexedDbKvStore, type KvStore } from './autoleveling-idb';
import type { AutoPilotTarget } from './autoleveling-content-types';
import type { UserBuiltPath } from './autoleveling-user-paths';

export type UserRecordKind = 'target' | 'buff' | 'fight' | 'path' | 'pref';

export interface UserRecord<T = unknown> {
  id: string;
  kind: UserRecordKind;
  /** Area this record applies to (content-pack slug). Omitted for `path`/`pref`. */
  areaSlug?: string;
  /** Lowercase class name — only for `fight` records. */
  className?: string;
  data: T;
  updatedAt: number;
  /** Set when the record came from the legacy localStorage migration. */
  legacy?: boolean;
}

export type CustomTarget = AutoPilotTarget;
export interface BuffRow {
  label: string;
  cmd: string;
  /** Gate: skip the cast while this GMCP affect is active (`if_affect_missing`). */
  affect?: string;
  /**
   * Gate: recast every N game ticks (~40s each) since the last cast — for buffs
   * that never register a GMCP affect (berserk). Mutually exclusive with `affect`.
   */
  refreshTicks?: number;
  /**
   * If the affect drops mid-combat, fire this instead of `cmd` (an item action —
   * `quaff <potion>` / `brandish <staff>` / `zap <wand>`; the item must be in
   * inventory). Unset → the buff waits for combat to end. Affect-gated rows only.
   */
  inCombatCmd?: string;
  /**
   * Stop refreshing this buff (let it fall) when close to leveling. Haste
   * suppresses mana regen — casters want to ding at full mana. Affect-gated only.
   */
  holdNearLevel?: boolean;
  /**
   * Set when the row was seeded from a class ability with no `BUFF_CATALOG` match,
   * so `cmd` / `affect` are a best guess the player should double-check against
   * their real affects. UI hint only — the engine ignores it.
   */
  unverified?: boolean;
}
export interface FightRow {
  cmd: string;
  cooldownSec: number;
}
export interface AutoLevelPrefs {
  playerClass?: string;
  /** 'good' | 'neutral' | 'evil' — a character property, so remembered globally like the class. */
  playerAlignment?: string;
}

const MIGRATION_KEY = '__migratedFromLocalStorage_v1';
const PREFS_ID = 'pref:global';

let store: KvStore = indexedDbKvStore('shatteredarchive-autoleveling', 'userData');

/** Test seam. */
export function __setUserDataStoreForTests(s: KvStore): void {
  store = s;
}

function newId(prefix: string): string {
  try {
    return `${prefix}:${crypto.randomUUID()}`;
  } catch {
    return `${prefix}:${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

/* ------------------------------ generic CRUD ----------------------------- */

async function allRecords(): Promise<UserRecord[]> {
  const keys = await store.keys();
  const out: UserRecord[] = [];
  for (const k of keys) {
    if (k.startsWith('__')) continue;
    const rec = await store.get<UserRecord>(k);
    if (rec && typeof rec.id === 'string' && typeof rec.kind === 'string') out.push(rec);
  }
  return out;
}

async function putRecord(rec: UserRecord): Promise<UserRecord> {
  const withTs = { ...rec, updatedAt: Date.now() };
  await store.set(rec.id, withTs);
  return withTs;
}

export async function deleteRecord(id: string): Promise<void> {
  await store.delete(id);
}

/** All records (for a profile-sync diff). */
export async function exportAll(): Promise<UserRecord[]> {
  await ensureMigrated();
  return allRecords();
}

/** Merge in records from a profile sync (last-writer-wins by updatedAt). */
export async function importRecords(incoming: UserRecord[]): Promise<void> {
  const current = new Map((await allRecords()).map((r) => [r.id, r]));
  for (const rec of incoming) {
    if (!rec?.id || !rec.kind) continue;
    const mine = current.get(rec.id);
    if (!mine || (rec.updatedAt ?? 0) >= (mine.updatedAt ?? 0)) {
      await store.set(rec.id, rec);
    }
  }
}

/* ------------------------------- targets ------------------------------- */

export async function getCustomTargets(areaSlug: string): Promise<UserRecord<CustomTarget>[]> {
  await ensureMigrated();
  return (await allRecords()).filter(
    (r): r is UserRecord<CustomTarget> => r.kind === 'target' && r.areaSlug === areaSlug,
  );
}

export async function addCustomTarget(areaSlug: string, target: CustomTarget): Promise<UserRecord<CustomTarget>> {
  return putRecord({ id: newId('target'), kind: 'target', areaSlug, data: target, updatedAt: 0 }) as Promise<
    UserRecord<CustomTarget>
  >;
}

/* -------------------------------- buffs -------------------------------- */

export async function getBuffOverlay(areaSlug: string): Promise<BuffRow[]> {
  await ensureMigrated();
  const rec = (await allRecords()).find((r) => r.kind === 'buff' && r.areaSlug === areaSlug);
  return Array.isArray(rec?.data) ? (rec!.data as BuffRow[]) : [];
}

export async function setBuffOverlay(areaSlug: string, rows: BuffRow[]): Promise<void> {
  const existing = (await allRecords()).find((r) => r.kind === 'buff' && r.areaSlug === areaSlug);
  await putRecord({
    id: existing?.id ?? `buff:${areaSlug}`,
    kind: 'buff',
    areaSlug,
    data: rows,
    updatedAt: 0,
  });
}

/* --------------------------- fight commands --------------------------- */

export async function getFightOverlay(areaSlug: string, className: string): Promise<FightRow[]> {
  await ensureMigrated();
  const key = className.trim().toLowerCase();
  const rec = (await allRecords()).find(
    (r) => r.kind === 'fight' && r.areaSlug === areaSlug && r.className === key,
  );
  return Array.isArray(rec?.data) ? (rec!.data as FightRow[]) : [];
}

export async function setFightOverlay(areaSlug: string, className: string, rows: FightRow[]): Promise<void> {
  const key = className.trim().toLowerCase();
  const existing = (await allRecords()).find(
    (r) => r.kind === 'fight' && r.areaSlug === areaSlug && r.className === key,
  );
  await putRecord({
    id: existing?.id ?? `fight:${areaSlug}:${key}`,
    kind: 'fight',
    areaSlug,
    className: key,
    data: rows,
    updatedAt: 0,
  });
}

/* -------------------------------- prefs -------------------------------- */

export async function getPrefs(): Promise<AutoLevelPrefs> {
  await ensureMigrated();
  const rec = await store.get<UserRecord<AutoLevelPrefs>>(PREFS_ID);
  return rec?.data ?? {};
}

export async function setPrefs(patch: Partial<AutoLevelPrefs>): Promise<void> {
  const current = await getPrefs();
  await putRecord({ id: PREFS_ID, kind: 'pref', data: { ...current, ...patch }, updatedAt: 0 });
}

/* ------------------------------ custom paths ---------------------------- */

export async function getCustomPaths(): Promise<UserRecord<UserBuiltPath>[]> {
  await ensureMigrated();
  return (await allRecords()).filter((r): r is UserRecord<UserBuiltPath> => r.kind === 'path');
}

export async function upsertCustomPath(path: UserBuiltPath): Promise<void> {
  const existing = (await allRecords()).find((r) => r.kind === 'path' && (r.data as UserBuiltPath)?.id === path.id);
  await putRecord({ id: existing?.id ?? `path:${path.id}`, kind: 'path', data: path, updatedAt: 0 });
}

/* ----------------------------- migration ------------------------------ */

let migrationPromise: Promise<void> | null = null;

export function ensureMigrated(): Promise<void> {
  migrationPromise ??= runMigration();
  return migrationPromise;
}

async function runMigration(): Promise<void> {
  if (await store.get(MIGRATION_KEY)) return;

  try {
    // legacy manual targets: Record<`${continent}::${area}`, {lookName, engageName}[]>
    const rawTargets = safeLocalStorage('shatteredarchive:autoleveling:manual-targets');
    if (rawTargets && typeof rawTargets === 'object') {
      for (const [areaKey, list] of Object.entries(rawTargets as Record<string, unknown>)) {
        if (!Array.isArray(list)) continue;
        for (const t of list) {
          const look = String((t as any)?.lookName ?? '').trim();
          const engage = String((t as any)?.engageName ?? '').trim();
          if (!look || !engage) continue;
          const id = newId('target');
          await store.set(id, {
            id,
            kind: 'target',
            // legacy key is "continent::area" (lowercased) — mapped to a best-effort slug
            areaSlug: legacyKeyToSlug(areaKey),
            data: { lookName: look, engageName: engage },
            updatedAt: Date.now(),
            legacy: true,
          } satisfies UserRecord);
        }
      }
    }

    // legacy user paths
    const rawPaths = safeLocalStorage('shatteredarchive:autoleveling:user-paths');
    if (Array.isArray(rawPaths)) {
      for (const p of rawPaths) {
        if (!p || typeof (p as any).id !== 'string') continue;
        await store.set(`path:${(p as any).id}`, {
          id: `path:${(p as any).id}`,
          kind: 'path',
          data: p,
          updatedAt: Date.now(),
          legacy: true,
        } satisfies UserRecord);
      }
    }
  } catch {
    // best-effort — a failed migration must not brick the store
  }

  await store.set(MIGRATION_KEY, true);
}

/** "arkania::centaur village" -> "centaur-village" (best effort; the wizard also matches by name). */
function legacyKeyToSlug(key: string): string {
  const area = key.includes('::') ? key.split('::')[1] : key;
  return area.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function safeLocalStorage(key: string): unknown {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
