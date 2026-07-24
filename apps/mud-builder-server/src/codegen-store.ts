import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { validateSpellSpec, type SpellSpec } from '@shatteredarchive/merc-area';

import { AreaConflictError, AreaStoreError } from './area-store.js';

/**
 * `<area>/codegen/spells.json` access (MUD Builder Phase 14a). Builder metadata ONLY —
 * the game never reads this file. Unlike skills.dat/groups.dat there is no compiled
 * "stock" fallback (a missing file just means no specs authored yet), so readSpecs()
 * tolerates a missing file as []. No backups: this is regenerable authoring data, not a
 * game-critical overlay, and every write is already audited by app.ts's audit middleware.
 */
export class CodegenStore {
  constructor(
    private readonly areaPath: string,
    private readonly writeEnabled: boolean,
  ) {}

  private get filePath(): string {
    return path.join(this.areaPath, 'codegen', 'spells.json');
  }

  /** Tolerant of a missing or corrupt file — a builder must always be able to start fresh. */
  readSpecs(): SpellSpec[] {
    if (!fs.existsSync(this.filePath)) return [];
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as { specs?: unknown };
      return Array.isArray(parsed.specs) ? (parsed.specs as SpellSpec[]) : [];
    } catch {
      return [];
    }
  }

  /** Content identity of the on-disk bytes; null when no file exists (Phase 12 overlay sentinel contract). */
  hash(): string | null {
    if (!fs.existsSync(this.filePath)) return null;
    return crypto.createHash('sha256').update(fs.readFileSync(this.filePath, 'utf8'), 'utf8').digest('hex');
  }

  /**
   * Validates every spec (against existingOverlayNames — the current skills.dat rows —
   * AND against each other within this same array) before writing anything. A baseHash
   * mismatch throws AreaConflictError BEFORE validation-driven writes, same contract as
   * Skills/GroupsStore. Atomic tmp+rename; creates codegen/ on demand.
   */
  write(specs: SpellSpec[], opts: { baseHash?: string | null; existingOverlayNames: ReadonlySet<string> }): { hash: string; warnings: string[] } {
    if (!this.writeEnabled) {
      throw new AreaStoreError('disk writes are disabled (MUD_WRITE_ENABLED is not "true"); use the patch download instead', 403);
    }

    const errors: string[] = [];
    const warnings: string[] = [];
    const seenNames = new Set<string>();
    const seenFuns = new Set<string>();
    for (const spec of specs) {
      const summary = validateSpellSpec(spec, { existingOverlayNames: opts.existingOverlayNames, existingFunNames: seenFuns });
      errors.push(...summary.errors);
      warnings.push(...summary.warnings);
      if (seenNames.has(spec.name)) errors.push(`spell '${spec.name}': listed more than once in this manifest`);
      seenNames.add(spec.name);
      seenFuns.add(spec.funName);
    }
    if (errors.length > 0) throw new AreaStoreError(`invalid spell spec(s): ${errors.join('; ')}`, 400);

    if (opts.baseHash !== undefined) {
      const currentHash = this.hash();
      if (currentHash !== opts.baseHash) throw new AreaConflictError('codegen/spells.json', currentHash);
    }

    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const text = `${JSON.stringify({ specs }, null, 2)}\n`;
    const tmp = `${this.filePath}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, text, 'utf8');
    fs.renameSync(tmp, this.filePath);
    return { hash: crypto.createHash('sha256').update(text, 'utf8').digest('hex'), warnings };
  }
}
