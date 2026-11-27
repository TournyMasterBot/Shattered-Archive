// apps/game-client/src/features/autoleveling/autoleveling-route-overrides.ts

/**
 * Personal override of an area's pre-loaded route (`dirs`) — pure helpers, no storage.
 *
 * The server's route is never changed. A player's edit is ONE record per area holding the whole list of
 * steps they want (a list has no meaningful per-field diff, unlike a target). An edit that ends up equal to
 * the served route leaves no record. `requiredActions` (the area's own "c pass"-style preamble) are not
 * part of the override: they stay the server's and `fullRoute` still puts them first.
 *
 * Every step is sent to the game as a command, so a step is refused if it is empty, over 200 characters, or
 * contains `;` (command stacking), a line break or a control character — including when it arrives from the
 * cloud. The server validator (AutolevelUserRecords.cs) enforces the same limits.
 * Storage and sync are in autoleveling-user-data.ts.
 */

import { isSafeTargetText, MAX_TARGET_TEXT } from './autoleveling-target-overrides';
import type { AutoPilotArea } from './autoleveling-content-types';

/** Longest route a player may save (the longest served route is ~120 steps). Matches the server's validator. */
export const MAX_ROUTE_STEPS = 1000;
/** Longest single step. Same limit as target text. */
export const MAX_ROUTE_STEP_TEXT = MAX_TARGET_TEXT;

/** What a route-override record's `data` holds. */
export interface RouteOverrideData {
  dirs: string[];
}

/** Why an edited route was refused. */
export type RouteEditError = 'empty' | 'unsafe' | 'too-long';

/**
 * Splits the editor's text into steps. `;` and line breaks both separate steps (the wizard's other command
 * fields use `;`), each step is trimmed and empty pieces are dropped, so "e;;se;\n" is ["e", "se"].
 */
export function parseRouteText(text: string): string[] {
  return String(text ?? '')
    .split(/[;\r\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The editor's text for a route: steps joined with `;`, the wizard's convention for command lists. */
export function routeToText(dirs: readonly string[]): string {
  return dirs.join(';');
}

/**
 * Validates a route record's `data` (from the editor or a cloud import). Returns the normalized data, or
 * null when it must be refused: not an object, an unknown field, `dirs` not an array of 1-1000 safe strings.
 */
export function normalizeRouteOverrideData(raw: unknown): RouteOverrideData | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  for (const field of Object.keys(src)) if (field !== 'dirs') return null;
  if (!Array.isArray(src.dirs) || src.dirs.length === 0 || src.dirs.length > MAX_ROUTE_STEPS) return null;
  const dirs: string[] = [];
  for (const step of src.dirs) {
    if (typeof step !== 'string' || !isSafeTargetText(step.trim())) return null;
    dirs.push(step.trim());
  }
  return { dirs };
}

/**
 * Turns what the player wants into what is stored: the data to save, `null` when it equals the served route
 * (no override should exist), or the reason it was refused so the editor can say so.
 */
export function diffRouteAgainstDefault(
  defaultDirs: readonly string[],
  wanted: readonly string[],
): RouteOverrideData | null | RouteEditError {
  const dirs = wanted.map((s) => String(s ?? '').trim());
  if (dirs.length === 0) return 'empty';
  if (dirs.length > MAX_ROUTE_STEPS) return 'too-long';
  if (!dirs.every((s) => isSafeTargetText(s))) return 'unsafe';
  const same = dirs.length === defaultDirs.length && dirs.every((s, i) => s === defaultDirs[i]);
  return same ? null : { dirs };
}

/** The area with the player's route in place of the served one; the served route is returned when there is no override. */
export function applyRouteOverride(
  area: AutoPilotArea,
  override: RouteOverrideData | null,
): { area: AutoPilotArea; overridden: boolean } {
  if (!override) return { area, overridden: false };
  return { area: { ...area, dirs: [...override.dirs] }, overridden: true };
}
