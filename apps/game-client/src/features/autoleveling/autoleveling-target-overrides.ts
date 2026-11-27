// apps/game-client/src/features/autoleveling/autoleveling-target-overrides.ts

/**
 * Personal overrides of the pre-loaded (area) mob targets — pure helpers, no storage.
 *
 * The server's `recommendedTargets` list is never changed. A player's correction is a small record
 * keyed to the area target's normalized ORIGINAL room line, holding only what differs from the server
 * value (a new room line and/or kill keyword, and/or `hidden`). Storage and sync live in
 * autoleveling-user-data.ts; the wizard applies the records with `applyTargetOverrides`.
 *
 * Why the rules are what they are:
 * - only differences are stored, so a later server fix still reaches every field the player left alone
 *   (SETTINGS-01), and "same as the default" is a strict string comparison (SETTINGS-02);
 * - an override whose key is no longer in the area's list is kept and reported as `unmatched` rather than
 *   dropped, so a server rename never silently erases a player's edit (CLOUDSYNC-03);
 * - the room line and keyword end up in `kill {name}` and in the encounter match, so text containing `;`
 *   (command stacking), line breaks or control characters is refused, including when it arrives from the
 *   cloud (E3).
 */

import type { AutoPilotTarget } from './autoleveling-content-types';

/** Longest room line or keyword an override may hold (matches the server's validator). */
export const MAX_TARGET_TEXT = 200;

/** What an override record's `data` holds: the key plus only the fields that differ from the server value. */
export interface TargetOverrideData {
  /** `targetOverrideKey` of the area target's original room line. */
  key: string;
  lookName?: string;
  engageName?: string;
  hidden?: boolean;
}

/** The part of a stored record this module needs (a `UserRecord` satisfies it). */
export interface OverrideRecordLike {
  id: string;
  areaSlug?: string;
  data: unknown;
  updatedAt: number;
}

/** One area target as the Targets step shows it: server value with the player's override applied. */
export interface AreaTargetRow {
  key: string;
  lookName: string;
  engageName: string;
  level?: number;
  hidden: boolean;
  /** True when a stored override changes this row (edit or hidden). */
  overridden: boolean;
  defaultLookName: string;
  defaultEngageName: string;
}

/** An override whose area target is no longer in the served list. */
export interface UnmatchedOverride {
  id: string;
  key: string;
  lookName?: string;
  engageName?: string;
  hidden?: boolean;
}

/** Lowercase, trimmed, whitespace collapsed — the same identity the wizard already uses to dedupe area targets. */
export function targetOverrideKey(lookName: string): string {
  return String(lookName ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** A room line or keyword that is safe to store and to send: 1-200 characters, no `;`, no control characters. */
export function isSafeTargetText(text: unknown): text is string {
  if (typeof text !== 'string') return false;
  if (text.length === 0 || text.length > MAX_TARGET_TEXT) return false;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (text[i] === ';' || code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f)) return false;
  }
  return true;
}

/**
 * Validates an override record's `data` (from the editor or from a cloud import). Returns the normalized
 * data, or null when it must be refused: not an object, an unsafe or missing key, an unsafe edited text,
 * a non-boolean `hidden`, or an unknown field.
 */
export function normalizeTargetOverrideData(raw: unknown): TargetOverrideData | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  for (const field of Object.keys(src)) {
    if (field !== 'key' && field !== 'lookName' && field !== 'engageName' && field !== 'hidden') return null;
  }
  if (!isSafeTargetText(src.key)) return null;
  const out: TargetOverrideData = { key: targetOverrideKey(src.key) };
  if (src.lookName !== undefined) {
    if (!isSafeTargetText(src.lookName)) return null;
    out.lookName = src.lookName.trim();
  }
  if (src.engageName !== undefined) {
    if (!isSafeTargetText(src.engageName)) return null;
    out.engageName = src.engageName.trim();
  }
  if (src.hidden !== undefined) {
    if (typeof src.hidden !== 'boolean') return null;
    if (src.hidden) out.hidden = true;
  }
  return out;
}

/** The fields a player may set; each given field is the value they want the row to have. */
export interface TargetOverridePatch {
  lookName?: string;
  engageName?: string;
  hidden?: boolean;
}

/**
 * Combines the existing override (if any) with a patch and drops every field that strictly equals the
 * server value. Returns null when nothing differs, meaning the override record should not exist.
 * Throws nothing: an unsafe text returns 'unsafe' so the editor can show a message.
 */
export function diffAgainstDefault(
  defaultTarget: Pick<AutoPilotTarget, 'lookName' | 'engageName'>,
  existing: TargetOverrideData | null,
  patch: TargetOverridePatch,
): TargetOverrideData | null | 'unsafe' {
  const wantLook = patch.lookName !== undefined ? patch.lookName.trim() : (existing?.lookName ?? defaultTarget.lookName);
  const wantEngage =
    patch.engageName !== undefined ? patch.engageName.trim() : (existing?.engageName ?? defaultTarget.engageName);
  const wantHidden = patch.hidden !== undefined ? patch.hidden : existing?.hidden === true;

  if (!isSafeTargetText(wantLook) || !isSafeTargetText(wantEngage)) return 'unsafe';

  const out: TargetOverrideData = { key: targetOverrideKey(defaultTarget.lookName) };
  if (wantLook !== defaultTarget.lookName) out.lookName = wantLook;
  if (wantEngage !== defaultTarget.engageName) out.engageName = wantEngage;
  if (wantHidden) out.hidden = true;

  return out.lookName === undefined && out.engageName === undefined && out.hidden === undefined ? null : out;
}

/**
 * Applies a player's overrides to the area's served targets. Duplicate server rows (same key) keep the
 * first, as the wizard seed always has. Overrides whose key matches no served row come back as `unmatched`
 * (kept in storage, not applied).
 */
export function applyTargetOverrides(
  areaTargets: readonly AutoPilotTarget[],
  overrides: readonly OverrideRecordLike[],
): { rows: AreaTargetRow[]; unmatched: UnmatchedOverride[] } {
  const byKey = new Map<string, { id: string; updatedAt: number; data: TargetOverrideData }>();
  for (const rec of overrides) {
    const data = normalizeTargetOverrideData(rec?.data);
    if (!data) continue;
    const mine = byKey.get(data.key);
    if (!mine || (rec.updatedAt ?? 0) >= mine.updatedAt) byKey.set(data.key, { id: rec.id, updatedAt: rec.updatedAt ?? 0, data });
  }

  const seen = new Set<string>();
  const rows: AreaTargetRow[] = [];
  for (const t of areaTargets) {
    const key = targetOverrideKey(t.lookName);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const ov = byKey.get(key)?.data;
    rows.push({
      key,
      lookName: ov?.lookName ?? t.lookName,
      engageName: ov?.engageName ?? t.engageName,
      level: t.level,
      hidden: ov?.hidden === true,
      overridden: !!ov,
      defaultLookName: t.lookName,
      defaultEngageName: t.engageName,
    });
  }

  const unmatched: UnmatchedOverride[] = [];
  for (const [key, entry] of byKey) {
    if (seen.has(key)) continue;
    unmatched.push({
      id: entry.id,
      key,
      lookName: entry.data.lookName,
      engageName: entry.data.engageName,
      hidden: entry.data.hidden,
    });
  }
  return { rows, unmatched };
}
