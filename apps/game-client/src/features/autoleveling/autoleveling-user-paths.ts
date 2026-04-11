// apps/game-client/src/features/autoleveling/autoleveling-user-paths.ts

/**
 * User-Built Training Paths
 * -------------------------
 * Persistence, export, and import for paths created via the Build tab.
 * Stored in localStorage. Export/import uses plain JSON.
 */

export type BuildStep =
  | { kind: 'move'; dir: string }
  | { kind: 'mob'; lookName: string; engageName: string };

export type UserBuiltPath = {
  id: string;
  name: string;
  continentName: string;
  areaName: string;
  mode: 'auto_level' | 'sightsee';
  steps: BuildStep[];
  raw: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
};

const STORAGE_KEY = 'shatteredarchive:autoleveling:user-paths';
const EXPORT_VERSION = 1;

/* ---------- serialization ---------- */

export function serializeBuildPath(steps: BuildStep[]): string {
  return steps
    .map((s) => (s.kind === 'move' ? s.dir : `${s.lookName}|${s.engageName}`))
    .join(';');
}

/* ---------- storage ---------- */

export function loadUserPaths(): UserBuiltPath[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidUserPath);
  } catch {
    return [];
  }
}

export function saveUserPaths(paths: UserBuiltPath[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(paths));
  } catch {
    // ignore quota errors
  }
}

export function upsertUserPath(paths: UserBuiltPath[], path: UserBuiltPath): UserBuiltPath[] {
  const idx = paths.findIndex((p) => p.id === path.id);
  if (idx >= 0) {
    const next = [...paths];
    next[idx] = path;
    return next;
  }
  return [...paths, path];
}

export function deleteUserPath(paths: UserBuiltPath[], id: string): UserBuiltPath[] {
  return paths.filter((p) => p.id !== id);
}

/* ---------- export ---------- */

export function exportPathsToJson(paths: UserBuiltPath[]): string {
  return JSON.stringify(
    { version: EXPORT_VERSION, exportedAt: new Date().toISOString(), paths },
    null,
    2,
  );
}

export function triggerJsonDownload(json: string, filename: string): void {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ---------- import ---------- */

export type ImportResult = {
  imported: UserBuiltPath[];
  skipped: number;
  errors: string[];
};

export function parseImportJson(json: string): ImportResult {
  const errors: string[] = [];
  let skipped = 0;

  try {
    const obj = JSON.parse(json);
    // Accept both a bare array and the { version, paths } envelope
    const raw: unknown[] = Array.isArray(obj)
      ? obj
      : Array.isArray((obj as any)?.paths)
        ? (obj as any).paths
        : [];

    const imported: UserBuiltPath[] = [];
    for (const item of raw) {
      if (isValidUserPath(item)) {
        imported.push(item);
      } else {
        skipped++;
        errors.push(`Skipped invalid entry: ${JSON.stringify(item).slice(0, 120)}`);
      }
    }
    return { imported, skipped, errors };
  } catch (e) {
    errors.push(`JSON parse error: ${String((e as any)?.message ?? e)}`);
    return { imported: [], skipped: 0, errors };
  }
}

/* ---------- validation ---------- */

function isValidBuildStep(s: unknown): s is BuildStep {
  if (!s || typeof s !== 'object') return false;
  const o = s as any;
  if (o.kind === 'move') return typeof o.dir === 'string' && o.dir.length > 0;
  if (o.kind === 'mob')
    return typeof o.lookName === 'string' && o.lookName.length > 0 && typeof o.engageName === 'string';
  return false;
}

function isValidUserPath(obj: unknown): obj is UserBuiltPath {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as any;
  return (
    typeof o.id === 'string' &&
    o.id.length > 0 &&
    typeof o.name === 'string' &&
    typeof o.continentName === 'string' &&
    typeof o.areaName === 'string' &&
    (o.mode === 'auto_level' || o.mode === 'sightsee') &&
    Array.isArray(o.steps) &&
    (o.steps as unknown[]).every(isValidBuildStep) &&
    typeof o.raw === 'string'
  );
}
