import fs from 'fs';
import path from 'path';

import { parseAreaFile, emitAreaFile, type AreaFile, type AreaHeaderSection } from '@shatteredarchive/merc-area';

/**
 * Disk access for the target MUD's area directory.
 *
 * Stability rules enforced here:
 * - File names are strictly validated (no path traversal, `.are` only).
 * - Writes are atomic (temp file + rename) and always preceded by a timestamped
 *   backup of the previous content under `backups/`.
 * - Writes are refused entirely unless the store was constructed write-enabled
 *   (MUD_WRITE_ENABLED=true — the experimental compose deployment).
 * - Nothing here throws raw fs errors at callers without context.
 */

const AREA_FILE_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]*\.are$/;

export class AreaStoreError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'AreaStoreError';
  }
}

export interface AreaListEntry {
  file: string;
  name?: string;
  credits?: string;
  minVnum?: number;
  maxVnum?: number;
  /** Present when the file failed to parse; the entry is still listed. */
  error?: string;
}

export function assertValidAreaFileName(file: string): void {
  if (!AREA_FILE_RE.test(file)) {
    throw new AreaStoreError(`invalid area file name: ${JSON.stringify(file)}`, 400);
  }
}

export class AreaStore {
  constructor(
    private readonly areaPath: string,
    private readonly writeEnabled: boolean,
  ) {}

  private areaFilePath(file: string): string {
    assertValidAreaFileName(file);
    return path.join(this.areaPath, file);
  }

  listAreas(): AreaListEntry[] {
    const listPath = path.join(this.areaPath, 'area.lst');
    if (!fs.existsSync(listPath)) {
      throw new AreaStoreError(`area.lst not found at ${listPath} — is MERC_MUD_PATH correct?`, 500);
    }
    const files = fs
      .readFileSync(listPath, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && l !== '$');

    return files.map((file) => {
      try {
        const area = this.readArea(file);
        const header = area.sections.find((s): s is AreaHeaderSection => s.kind === 'area');
        return {
          file,
          name: header?.name,
          credits: header?.credits,
          minVnum: header?.minVnum,
          maxVnum: header?.maxVnum,
        };
      } catch (e) {
        return { file, error: (e as Error).message };
      }
    });
  }

  readAreaText(file: string): string {
    const p = this.areaFilePath(file);
    if (!fs.existsSync(p)) {
      throw new AreaStoreError(`area file not found: ${file}`, 404);
    }
    return fs.readFileSync(p, 'utf8');
  }

  readArea(file: string): AreaFile {
    return parseAreaFile(this.readAreaText(file));
  }

  /**
   * Emit the given model and prove it re-parses (validate-before-anything —
   * a model that cannot round-trip never reaches disk or the wire).
   */
  emitValidated(file: string, area: AreaFile): string {
    const text = emitAreaFile(area);
    try {
      parseAreaFile(text);
    } catch (e) {
      throw new AreaStoreError(`emitted ${file} failed to re-parse (model invalid): ${(e as Error).message}`, 400);
    }
    return text;
  }

  /** Atomic write with timestamped backup. Refused unless write-enabled. */
  writeArea(file: string, area: AreaFile): { backupPath: string | null } {
    if (!this.writeEnabled) {
      throw new AreaStoreError(
        'disk writes are disabled (MUD_WRITE_ENABLED is not "true"); use preview/download instead',
        403,
      );
    }
    const target = this.areaFilePath(file);
    const text = this.emitValidated(file, area);

    let backupPath: string | null = null;
    if (fs.existsSync(target)) {
      const backupDir = path.join(this.areaPath, 'backups');
      fs.mkdirSync(backupDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      backupPath = path.join(backupDir, `${file}.${stamp}.bak`);
      fs.copyFileSync(target, backupPath);
    }

    const tmp = `${target}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, text, 'utf8');
    fs.renameSync(tmp, target);
    return { backupPath };
  }

  /** Write a reload sentinel for the MUD (step 6/7 mechanisms). Write-gated. */
  requestReload(mode: 'hot' | 'copyover', file?: string): { signalPath: string } {
    if (!this.writeEnabled) {
      throw new AreaStoreError('reload requests are disabled (MUD_WRITE_ENABLED is not "true")', 403);
    }
    if (mode === 'hot') {
      if (file === undefined) {
        throw new AreaStoreError('hot reload requires "file" (the area file to reload)', 400);
      }
      assertValidAreaFileName(file);
      const signalPath = path.join(this.areaPath, 'reload.signal');
      fs.writeFileSync(signalPath, `${file}\n`, 'utf8');
      return { signalPath };
    }
    const signalPath = path.join(this.areaPath, 'copyover.signal');
    fs.writeFileSync(signalPath, '\n', 'utf8');
    return { signalPath };
  }
}
