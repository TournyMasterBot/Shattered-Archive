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
import {
  normalizeDeselected,
  normalizeStepPrefs,
  stepPrefsFrom,
  stepValuesFrom,
  type StepPrefs,
  type StepValues,
} from './autoleveling-step-prefs';
import {
  ENEMY_BAND_FLOORS,
  type AutoLevelCombatState,
  type AutoLevelEnemyBand,
  type AutoLevelEnemyGate,
  type AutoLevelOnceKey,
  type AutoLevelVitalsGate,
} from './autoleveling-types';
import {
  diffAgainstDefault,
  isSafeTargetText,
  normalizeTargetOverrideData,
  targetOverrideKey,
  type TargetOverrideData,
  type TargetOverridePatch,
} from './autoleveling-target-overrides';
import {
  diffRouteAgainstDefault,
  normalizeRouteOverrideData,
  type RouteEditError,
  type RouteOverrideData,
} from './autoleveling-route-overrides';

export type UserRecordKind =
  | 'target'
  | 'buff'
  | 'fight'
  | 'path'
  | 'pref'
  | 'abilityTiming'
  | 'targetOverride'
  | 'routeOverride';

/**
 * Every record kind this store holds, and therefore every kind `exportAll()` can hand to Save to cloud.
 * CONTRACT with the server's `AutolevelUserRecords.Kinds` (DSL repo, Server.Dsl/AgentApi): a kind missing
 * there makes the whole upload fail with a 400. Add a kind in both places, and in the mobile copy, together.
 */
export const SYNCED_RECORD_KINDS: readonly UserRecordKind[] = [
  'target',
  'buff',
  'fight',
  'path',
  'pref',
  'abilityTiming',
  'targetOverride',
  'routeOverride',
];

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
  /** Paused: the row stays (command, gate, order) but the engine does not send it. Absent = active. */
  disabled?: boolean;
  /**
   * Set when the row was seeded from a class ability with no `BUFF_CATALOG` match,
   * so `cmd` / `affect` are a best guess the player should double-check against
   * their real affects. UI hint only — the engine ignores it.
   */
  unverified?: boolean;
  /** Optional HP/MP/MV percentage precondition — see AutoLevelVitalsGate. */
  vitalsGate?: AutoLevelVitalsGate;
  /** Fire at most once per round/fight — see AutoLevelOnceKey. */
  onceKey?: AutoLevelOnceKey;
  /** Only in (`in`) or only out of (`out`) combat. Absent = either. See AutoLevelCombatState. */
  combatState?: AutoLevelCombatState;
  /** Optional enemy-condition precondition — see AutoLevelEnemyGate. */
  enemyGate?: AutoLevelEnemyGate;
  /**
   * Re-arm until the affect shows. Only ever stored as `false` (switched off): absent means on for an affect-gated row, so a
   * later change of that default reaches every row the player left alone (SETTINGS-01).
   */
  retryUntilSet?: false;
}
export interface FightRow {
  cmd: string;
  cooldownSec: number;
  /** Paused: the row stays (cooldown, gates, order) but the engine does not send it. Absent = active. */
  disabled?: boolean;
  /** Optional HP/MP/MV percentage precondition — see AutoLevelVitalsGate. */
  vitalsGate?: AutoLevelVitalsGate;
  /** Fire at most once per round/fight — see AutoLevelOnceKey. */
  onceKey?: AutoLevelOnceKey;
  /** Only in (`in`) or only out of (`out`) combat. Absent = either. See AutoLevelCombatState. */
  combatState?: AutoLevelCombatState;
  /** Optional enemy-condition precondition — see AutoLevelEnemyGate. */
  enemyGate?: AutoLevelEnemyGate;
}
/** The global preference record: the remembered class and alignment, plus the Rest, Weight and lap-wait values (only those that differ from the default). */
export interface AutoLevelPrefs extends StepPrefs {
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

/**
 * The one gate every route that writes a record from outside goes through (cloud load, and the editor
 * through its own validated setters): returns the record to store, or null to refuse it. Refuses an
 * unknown kind, a `targetOverride` whose data fails `normalizeTargetOverrideData`, and a custom `target`
 * whose room line or keyword is unsafe (`;`, control characters, empty, too long).
 */
export function normalizeRecord(rec: unknown): UserRecord | null {
  if (!rec || typeof rec !== 'object') return null;
  const r = rec as Partial<UserRecord>;
  if (typeof r.id !== 'string' || !r.id) return null;
  if (typeof r.kind !== 'string' || !SYNCED_RECORD_KINDS.includes(r.kind as UserRecordKind)) return null;
  if (r.data === undefined) return null;
  const updatedAt = typeof r.updatedAt === 'number' && Number.isFinite(r.updatedAt) ? r.updatedAt : 0;

  if (r.kind === 'targetOverride') {
    const data = normalizeTargetOverrideData(r.data);
    if (!data || typeof r.areaSlug !== 'string' || !r.areaSlug) return null;
    return { ...(r as UserRecord), updatedAt, data };
  }
  if (r.kind === 'routeOverride') {
    const data = normalizeRouteOverrideData(r.data);
    if (!data || typeof r.areaSlug !== 'string' || !r.areaSlug) return null;
    return { ...(r as UserRecord), updatedAt, data };
  }
  if (r.kind === 'target') {
    const t = r.data as Partial<CustomTarget> | null;
    if (!t || !isSafeTargetText(t.lookName) || !isSafeTargetText(t.engageName)) return null;
  }
  if (r.kind === 'pref') {
    if (r.id === PREFS_ID) return { ...(r as UserRecord), updatedAt, data: cleanPrefsData(r.data) };
    if (r.id.startsWith(TARGET_SELECTION_PREFIX)) {
      const deselected = normalizeDeselected(r.data);
      if (!deselected || typeof r.areaSlug !== 'string' || !r.areaSlug) return null;
      return { ...(r as UserRecord), updatedAt, data: { deselected } };
    }
  }
  if ((r.kind === 'buff' || r.kind === 'fight') && Array.isArray(r.data)) {
    return { ...(r as UserRecord), updatedAt, data: r.data.map(normalizeRowOptions) };
  }
  return { ...(r as UserRecord), updatedAt };
}

/**
 * The options added to buff and fight rows on 2026-11-18 (combat state, enemy gate, retry switch), checked on the way in from
 * the cloud or a file: a value that is not one of the known ones is dropped from the ROW (the row and its other fields stay).
 * Returns a new object and never touches its input.
 */
export function normalizeRowOptions(row: unknown): unknown {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
  const { combatState, enemyGate, retryUntilSet, ...rest } = row as Record<string, unknown>;
  const out: Record<string, unknown> = { ...rest };
  if (combatState === 'in' || combatState === 'out') out.combatState = combatState;
  const gate = cleanEnemyGate(enemyGate);
  if (gate) out.enemyGate = gate;
  if (retryUntilSet === false) out.retryUntilSet = false;
  return out;
}

function cleanEnemyGate(v: unknown): AutoLevelEnemyGate | null {
  if (!v || typeof v !== 'object') return null;
  const g = v as { op?: unknown; band?: unknown };
  if (g.op !== 'above' && g.op !== 'below') return null;
  if (typeof g.band !== 'number' || !(ENEMY_BAND_FLOORS as readonly number[]).includes(g.band)) return null;
  return { op: g.op, band: g.band as AutoLevelEnemyBand };
}

/** Merge in records from a profile sync (last-writer-wins by updatedAt). Malformed records are skipped. */
export async function importRecords(incoming: UserRecord[]): Promise<void> {
  const current = new Map((await allRecords()).map((r) => [r.id, r]));
  for (const raw of incoming) {
    const rec = normalizeRecord(raw);
    if (!rec) continue;
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

export type TargetEditResult<T> = { ok: true; record: T } | { ok: false; error: 'unsafe' | 'missing' | 'storage' };

/** Edits a custom target in place (same record id, so a later sync updates rather than duplicates). */
export async function updateCustomTarget(
  recordId: string,
  target: CustomTarget,
): Promise<TargetEditResult<UserRecord<CustomTarget>>> {
  const lookName = String(target?.lookName ?? '').trim();
  const engageName = String(target?.engageName ?? '').trim();
  if (!isSafeTargetText(lookName) || !isSafeTargetText(engageName)) return { ok: false, error: 'unsafe' };
  try {
    const existing = (await allRecords()).find((r) => r.id === recordId && r.kind === 'target');
    if (!existing) return { ok: false, error: 'missing' };
    const next = { ...existing, data: { ...(existing.data as CustomTarget), lookName, engageName } };
    return { ok: true, record: (await putRecord(next)) as UserRecord<CustomTarget> };
  } catch {
    console.warn('[autoleveling] could not save the target');
    return { ok: false, error: 'storage' };
  }
}

/** Removes a custom target for good (the wizard used to drop it from the draft only, so it came back). */
export async function removeCustomTarget(recordId: string): Promise<void> {
  try {
    const existing = (await allRecords()).find((r) => r.id === recordId && r.kind === 'target');
    if (existing) await deleteRecord(recordId);
  } catch {
    console.warn('[autoleveling] could not remove the target');
  }
}

/* --------------------- overrides of pre-loaded (area) targets --------------------- */
// See autoleveling-target-overrides.ts for the rules. One record per (area, key); the id is
// deterministic so two devices editing the same target write the same record (last writer wins).

const targetOverrideId = (areaSlug: string, key: string) => `targetOverride:${areaSlug}:${key}`;

/** The player's overrides for one area. Unreadable storage or a malformed record yields nothing, never throws. */
export async function getTargetOverrides(areaSlug: string): Promise<UserRecord<TargetOverrideData>[]> {
  try {
    await ensureMigrated();
    const out: UserRecord<TargetOverrideData>[] = [];
    for (const r of await allRecords()) {
      if (r.kind !== 'targetOverride' || r.areaSlug !== areaSlug) continue;
      const data = normalizeTargetOverrideData(r.data);
      if (data) out.push({ ...r, data });
    }
    return out;
  } catch {
    console.warn('[autoleveling] could not read target overrides');
    return [];
  }
}

/**
 * Sets what the player wants an area target to look like. Only fields that differ from the server value are
 * kept; when nothing differs the override record is deleted (an edit back to the default leaves no trace).
 */
export async function setTargetOverride(
  areaSlug: string,
  defaultTarget: Pick<CustomTarget, 'lookName' | 'engageName'>,
  patch: TargetOverridePatch,
): Promise<TargetEditResult<UserRecord<TargetOverrideData> | null>> {
  try {
    const key = targetOverrideKey(defaultTarget.lookName);
    const existingRec = (await getTargetOverrides(areaSlug)).find((r) => r.data.key === key);
    const diff = diffAgainstDefault(defaultTarget, existingRec?.data ?? null, patch);
    if (diff === 'unsafe') return { ok: false, error: 'unsafe' };
    const id = existingRec?.id ?? targetOverrideId(areaSlug, key);
    if (diff === null) {
      await deleteRecord(id);
      return { ok: true, record: null };
    }
    const saved = await putRecord({ id, kind: 'targetOverride', areaSlug, data: diff, updatedAt: 0 });
    return { ok: true, record: saved as UserRecord<TargetOverrideData> };
  } catch {
    console.warn('[autoleveling] could not save the target override');
    return { ok: false, error: 'storage' };
  }
}

/** Resets one area target to the server default: removes the whole override (edit and hidden flag). */
export async function resetTargetOverride(areaSlug: string, key: string): Promise<void> {
  try {
    await deleteRecord(targetOverrideId(areaSlug, key));
    // an imported record may carry a different id for the same key: remove those too
    for (const r of await getTargetOverrides(areaSlug)) if (r.data.key === key) await deleteRecord(r.id);
  } catch {
    console.warn('[autoleveling] could not reset the target override');
  }
}

/** Deletes an override that no longer matches the area's list (the player's own action). */
export async function deleteTargetOverride(recordId: string): Promise<void> {
  try {
    const existing = (await allRecords()).find((r) => r.id === recordId && r.kind === 'targetOverride');
    if (existing) await deleteRecord(recordId);
  } catch {
    console.warn('[autoleveling] could not delete the target override');
  }
}

/* ------------------------- override of an area's route ------------------------- */
// See autoleveling-route-overrides.ts. One record per area; the id is deterministic so two devices
// editing the same area's route write the same record (last writer wins).

const routeOverrideId = (areaSlug: string) => `routeOverride:${areaSlug}`;

/** The player's route for one area, or null when they have none. Unreadable storage yields null, never throws. */
export async function getRouteOverride(areaSlug: string): Promise<UserRecord<RouteOverrideData> | null> {
  try {
    await ensureMigrated();
    let best: UserRecord<RouteOverrideData> | null = null;
    for (const r of await allRecords()) {
      if (r.kind !== 'routeOverride' || r.areaSlug !== areaSlug) continue;
      const data = normalizeRouteOverrideData(r.data);
      if (data && (!best || (r.updatedAt ?? 0) >= (best.updatedAt ?? 0))) best = { ...r, data };
    }
    return best;
  } catch {
    console.warn('[autoleveling] could not read the route override');
    return null;
  }
}

export type RouteSaveResult =
  | { ok: true; record: UserRecord<RouteOverrideData> | null }
  | { ok: false; error: RouteEditError | 'storage' };

/**
 * Saves the route the player wants for an area. A route equal to the served one deletes the override
 * (an edit back to the default leaves no trace); an empty, over-long or unsafe route is refused.
 */
export async function setRouteOverride(
  areaSlug: string,
  defaultDirs: readonly string[],
  wanted: readonly string[],
): Promise<RouteSaveResult> {
  const diff = diffRouteAgainstDefault(defaultDirs, wanted);
  if (typeof diff === 'string') return { ok: false, error: diff };
  try {
    const existing = await getRouteOverride(areaSlug);
    const id = existing?.id ?? routeOverrideId(areaSlug);
    if (diff === null) {
      await resetRouteOverride(areaSlug);
      return { ok: true, record: null };
    }
    const saved = await putRecord({ id, kind: 'routeOverride', areaSlug, data: diff, updatedAt: 0 });
    return { ok: true, record: saved as UserRecord<RouteOverrideData> };
  } catch {
    console.warn('[autoleveling] could not save the route override');
    return { ok: false, error: 'storage' };
  }
}

/** Back to the served route: removes the area's override (also an imported copy stored under another id). */
export async function resetRouteOverride(areaSlug: string): Promise<void> {
  try {
    for (const r of await allRecords()) {
      if (r.kind === 'routeOverride' && r.areaSlug === areaSlug) await deleteRecord(r.id);
    }
  } catch {
    console.warn('[autoleveling] could not reset the route override');
  }
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

/**
 * Like getBuffOverlay, but `null` means "no record" (never saved) and `[]` means "saved as empty" — only the
 * former may be pre-filled with class defaults, so a list the player emptied stays empty (SETTINGS-06).
 * Unreadable storage answers `[]` and warns: nothing is seeded over data that may exist.
 */
export async function getBuffOverlayOrNull(areaSlug: string): Promise<BuffRow[] | null> {
  try {
    await ensureMigrated();
    const rec = (await allRecords()).find((r) => r.kind === 'buff' && r.areaSlug === areaSlug);
    if (!rec) return null;
    return Array.isArray(rec.data) ? (rec.data as BuffRow[]) : [];
  } catch {
    console.warn('[autoleveling] could not read the buff overlay');
    return [];
  }
}

/* --------------------------- fight commands --------------------------- */

/** See getBuffOverlayOrNull: `null` = never saved for this (area, class), `[]` = saved as empty. */
export async function getFightOverlayOrNull(areaSlug: string, className: string): Promise<FightRow[] | null> {
  try {
    await ensureMigrated();
    const key = className.trim().toLowerCase();
    const rec = (await allRecords()).find(
      (r) => r.kind === 'fight' && r.areaSlug === areaSlug && r.className === key,
    );
    if (!rec) return null;
    return Array.isArray(rec.data) ? (rec.data as FightRow[]) : [];
  } catch {
    console.warn('[autoleveling] could not read the fight overlay');
    return [];
  }
}

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

/* --------------------------- learned ability timing --------------------------- */
// Cooldown the engine has learned for a fight-command ability, keyed by the command
// string itself (normalized) — NOT per-area/per-class. Real in-game lag is a property
// of the ability, not where you're standing, so this is global: cast it once, too fast,
// anywhere, and every future add of that same ability (any area, any character) starts
// from the learned value instead of 0.

function normalizeAbilityCmd(cmd: string): string {
  return String(cmd ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

const abilityTimingId = (cmdKey: string) => `abilityTiming:${cmdKey}`;

export async function getLearnedCooldown(cmd: string): Promise<number | null> {
  await ensureMigrated();
  const key = normalizeAbilityCmd(cmd);
  if (!key) return null;
  const rec = await store.get<UserRecord<{ cooldownSec: number }>>(abilityTimingId(key));
  const sec = rec?.data?.cooldownSec;
  return typeof sec === 'number' && Number.isFinite(sec) ? sec : null;
}

/** Overwrites the learned value (last write wins — the engine only ever bumps upward). */
export async function bumpLearnedCooldown(cmd: string, cooldownSec: number): Promise<void> {
  const key = normalizeAbilityCmd(cmd);
  if (!key) return;
  await putRecord({
    id: abilityTimingId(key),
    kind: 'abilityTiming',
    data: { cooldownSec },
    updatedAt: 0,
  });
}

/* -------------------------------- prefs -------------------------------- */

/** The global preference data with the step values checked: anything invalid is dropped, the class and alignment are kept as they are. */
function cleanPrefsData(data: unknown): AutoLevelPrefs {
  const raw = data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  const { rest: _rest, weight: _weight, lapWaitMin: _lap, ...other } = raw;
  return { ...(other as AutoLevelPrefs), ...normalizeStepPrefs(raw) };
}

export async function getPrefs(): Promise<AutoLevelPrefs> {
  await ensureMigrated();
  const rec = await store.get<UserRecord<AutoLevelPrefs>>(PREFS_ID);
  return cleanPrefsData(rec?.data);
}

export async function setPrefs(patch: Partial<AutoLevelPrefs>): Promise<void> {
  const current = await getPrefs();
  await putRecord({ id: PREFS_ID, kind: 'pref', data: { ...current, ...patch }, updatedAt: 0 });
}

/* ------------------- Rest, Weight and lap-wait values (live findings) ------------------- */

/** The remembered Rest, Weight and lap-wait values, every missing piece the default. Unreadable storage gives the defaults and never throws. */
export async function getStepValues(): Promise<StepValues> {
  try {
    return stepValuesFrom(await getPrefs());
  } catch {
    console.warn('[autoleveling] could not read the step values');
    return stepValuesFrom(null);
  }
}

/** Remembers the values, storing only what differs from the default (a draft that is all defaults leaves no step values behind). */
export async function saveStepValues(values: StepValues): Promise<void> {
  try {
    const current = await getPrefs();
    const { rest: _rest, weight: _weight, lapWaitMin: _lap, ...other } = current;
    const next: AutoLevelPrefs = { ...other, ...stepPrefsFrom(values) };
    if (Object.keys(next).length === 0) await deleteRecord(PREFS_ID);
    else await putRecord({ id: PREFS_ID, kind: 'pref', data: next, updatedAt: 0 });
  } catch {
    console.warn('[autoleveling] could not save the step values');
  }
}

/* ------------------------- targets the player unticked ------------------------ */

const TARGET_SELECTION_PREFIX = 'pref:targets:';
const targetSelectionId = (areaSlug: string) => `${TARGET_SELECTION_PREFIX}${areaSlug}`;

/**
 * The target rows (`targetRowId`s) the player unticked for an area. Rows that are not ticked off stay selected, so a target the server adds
 * later starts ticked. Unreadable storage gives [] (everything ticked) and never throws.
 */
export async function getTargetSelection(areaSlug: string): Promise<string[]> {
  try {
    await ensureMigrated();
    const rec = await store.get<UserRecord>(targetSelectionId(areaSlug));
    return normalizeDeselected(rec?.data) ?? [];
  } catch {
    console.warn('[autoleveling] could not read the target selection');
    return [];
  }
}

/** Stores the unticked ids for an area; none unticked leaves no record at all. */
export async function setTargetSelection(areaSlug: string, deselected: readonly string[]): Promise<void> {
  try {
    const ids = normalizeDeselected({ deselected }) ?? [];
    if (ids.length === 0) await deleteRecord(targetSelectionId(areaSlug));
    else await putRecord({ id: targetSelectionId(areaSlug), kind: 'pref', areaSlug, data: { deselected: ids }, updatedAt: 0 });
  } catch {
    console.warn('[autoleveling] could not save the target selection');
  }
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
