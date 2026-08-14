import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  parseGroupsFile,
  emitGroupsFile,
  validateGroups,
  stockGroupsFile,
  type GroupsFile,
  type GroupEntry,
} from '@shatteredarchive/merc-area';

import { AreaConflictError, AreaStoreError } from './area-store.js';

/**
 * groups.dat access (MUD Builder Phase 8). Same shape as SkillsStore: one
 * global optional overlay file in the area dir, GET falls back to the
 * compiled stock table, validate-before-anything, timestamped backup,
 * atomic rename, writes gated by MUD_WRITE_ENABLED. Changes apply at the
 * next copyover (the overlay loads at boot only).
 */
export class GroupsStore {
  constructor(
    private readonly areaPath: string,
    private readonly writeEnabled: boolean,
  ) {}

  private get filePath(): string {
    return path.join(this.areaPath, 'groups.dat');
  }

  /**
   * The current model: the on-disk overlay when present, else the compiled
   * stock table. A corrupt on-disk file is reported, not thrown — the UI
   * must stay usable to author the replacement.
   */
  read(): { groups: GroupEntry[]; source: 'overlay' | 'stock'; parseError?: string } {
    if (fs.existsSync(this.filePath)) {
      try {
        const model = parseGroupsFile(fs.readFileSync(this.filePath, 'utf8'));
        return { groups: model.groups, source: 'overlay' };
      } catch (e) {
        return { groups: stockGroupsFile().groups, source: 'stock', parseError: (e as Error).message };
      }
    }
    return { groups: stockGroupsFile().groups, source: 'stock' };
  }

  /**
   * Content identity of the on-disk overlay bytes; null when no overlay file
   * exists (the game would boot its compiled stock table). This is the
   * baseHash a client holds while editing (Phase 12, same contract as areas).
   */
  hash(): string | null {
    if (!fs.existsSync(this.filePath)) return null;
    return crypto.createHash('sha256').update(fs.readFileSync(this.filePath, 'utf8'), 'utf8').digest('hex');
  }

  /** Emit + validate without touching disk (the preview contract). */
  preview(model: GroupsFile): { text: string; errors: string[]; warnings: string[] } {
    const { errors, warnings } = validateGroups(model);
    if (errors.length > 0) {
      throw new AreaStoreError(`invalid groups: ${errors.join('; ')}`, 400);
    }
    const text = emitGroupsFile(model);
    parseGroupsFile(text); // prove the round trip before showing it as saveable
    return { text, errors, warnings };
  }

  /**
   * Atomic write with timestamped backup. Refused unless write-enabled.
   * When opts.baseHash is given (string = expected overlay bytes, null =
   * "there was no overlay when I loaded"), the save is conditional: a
   * mismatch 409s BEFORE any backup or write. Absent baseHash keeps the
   * historic unconditional behavior.
   */
  write(model: GroupsFile, opts: { baseHash?: string | null } = {}): {
    backupPath: string | null;
    warnings: string[];
    hash: string;
  } {
    if (!this.writeEnabled) {
      throw new AreaStoreError(
        'disk writes are disabled (MUD_WRITE_ENABLED is not "true"); use preview/download instead',
        403,
      );
    }
    const { text, warnings } = this.preview(model);

    if (opts.baseHash !== undefined) {
      const currentHash = this.hash();
      if (currentHash !== opts.baseHash) {
        throw new AreaConflictError('groups.dat', currentHash);
      }
    }

    let backupPath: string | null = null;
    if (fs.existsSync(this.filePath)) {
      const backupDir = path.join(this.areaPath, 'backups');
      fs.mkdirSync(backupDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      backupPath = path.join(backupDir, `groups.dat.${stamp}.bak`);
      fs.copyFileSync(this.filePath, backupPath);
    }

    const tmp = `${this.filePath}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, text, 'utf8');
    fs.renameSync(tmp, this.filePath);
    return { backupPath, warnings, hash: crypto.createHash('sha256').update(text, 'utf8').digest('hex') };
  }

  /** Remove the overlay (revert to the compiled table at next copyover). */
  remove(): { removed: boolean } {
    if (!this.writeEnabled) {
      throw new AreaStoreError('disk writes are disabled (MUD_WRITE_ENABLED is not "true")', 403);
    }
    if (!fs.existsSync(this.filePath)) return { removed: false };
    const backupDir = path.join(this.areaPath, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(this.filePath, path.join(backupDir, `groups.dat.${stamp}.bak`));
    fs.rmSync(this.filePath);
    return { removed: true };
  }
}
