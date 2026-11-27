/** How far each log file has been consumed. Persisted in the data directory so a restart neither repeats nor skips lines. */
export interface Checkpoint {
  /** Path relative to the log folder, with forward slashes. Never absolute and never contains `..`. */
  path: string;
  /** Bytes consumed: always the end of a complete line. */
  offset: number;
  /** File size when it was last read. A file that is now smaller was truncated. */
  size: number;
  /** Length of the fingerprinted prefix (0 until something has been consumed, at most FINGERPRINT_BYTES). */
  fpLen: number;
  /** sha1 of the first `fpLen` bytes: tells a renamed file (same prefix) from a recreated one (different prefix). */
  fp: string;
}

export interface CheckpointFile {
  /** True once the first scan has decided where to start in the files that existed then. */
  baselined: boolean;
  files: Checkpoint[];
}

export const FINGERPRINT_BYTES = 256;
const FORMAT_VERSION = 1;
const SHA1_HEX = /^[0-9a-f]{40}$/;

/** A relative, forward-slash path that stays inside the log folder. */
export function isSafeRelativePath(p: unknown): p is string {
  if (typeof p !== 'string' || p === '' || p.includes('\\') || p.includes('\0') || p.startsWith('/') || /^[a-zA-Z]:/.test(p)) return false;
  return p.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

function isCount(n: unknown): n is number {
  return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
}

function toCheckpoint(raw: unknown): Checkpoint | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const c = raw as Record<string, unknown>;
  if (!isSafeRelativePath(c.path) || !isCount(c.offset) || !isCount(c.size) || !isCount(c.fpLen)) return undefined;
  if (typeof c.fp !== 'string') return undefined;
  if (c.fpLen > FINGERPRINT_BYTES || c.fpLen > c.offset) return undefined;
  if (c.fpLen === 0 ? c.fp !== '' : !SHA1_HEX.test(c.fp)) return undefined;
  return { path: c.path, offset: c.offset, size: c.size, fpLen: c.fpLen, fp: c.fp };
}

/**
 * Read the checkpoint file. Anything unreadable gives "not baselined, no files", which is the safe direction: the next scan starts
 * every existing file at its end (no repeats). A single bad entry is dropped; a path that could leave the log folder is dropped.
 */
export function parseCheckpoints(text: string | undefined): CheckpointFile {
  const empty: CheckpointFile = { baselined: false, files: [] };
  if (text === undefined) return empty;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return empty;
  }
  if (typeof data !== 'object' || data === null) return empty;
  const d = data as Record<string, unknown>;
  if (d.v !== FORMAT_VERSION || !Array.isArray(d.files)) return empty;
  const files: Checkpoint[] = [];
  const seen = new Set<string>();
  for (const raw of d.files) {
    const cp = toCheckpoint(raw);
    if (cp !== undefined && !seen.has(cp.path)) {
      seen.add(cp.path);
      files.push(cp);
    }
  }
  return { baselined: d.baselined === true, files };
}

export function serializeCheckpoints(file: CheckpointFile): string {
  return JSON.stringify({ v: FORMAT_VERSION, baselined: file.baselined, files: file.files });
}
