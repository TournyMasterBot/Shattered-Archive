import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import {
  parseAreaFile,
  emitAreaFile,
  vnumsOutsideRange,
  validateRefs,
  validateScripts,
  collectDefinedEntities,
  type AreaFile,
  type AreaHeaderSection,
  type ExternalVnumRef,
  type RefKind,
  type RefsSummary,
} from '@shatteredarchive/merc-area';

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

/** Import upload cap — a .are is plain text; the largest stock file is well under this. */
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

export class AreaStoreError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'AreaStoreError';
  }
}

/**
 * A save arrived with a baseHash that no longer matches the on-disk file —
 * someone else saved in between. Carries the current hash so the client can
 * offer reload/re-apply instead of silently last-write-wins.
 */
export class AreaConflictError extends AreaStoreError {
  constructor(
    file: string,
    public readonly currentHash: string | null,
  ) {
    super(`${file} changed on disk since it was loaded — reload before saving (or save without baseHash to force)`, 409);
    this.name = 'AreaConflictError';
  }
}

/** Quarantine validation result for an uploaded .are file. Never touches disk. */
export interface ImportReport {
  file: string;
  /** The file already exists on disk (committing requires the overwrite flag). */
  exists: boolean;
  /** The file is already registered in area.lst (no copyover needed to reload). */
  registered: boolean;
  /** Any entry here blocks the commit entirely. */
  errors: string[];
  warnings: string[];
  /** Cross-area refs PROVEN to exist in another listed area (linkable). */
  externalRefs: ExternalVnumRef[];
  /** Canonical re-emitted text — what a commit would write. Null when parsing failed. */
  normalizedText: string | null;
  /** Entity counts by section kind (rooms, mobiles, ...). Null when parsing failed. */
  summary: Record<string, number> | null;
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

  /** Registered area file names from area.lst (the `$` terminator dropped). */
  private listAreaFiles(): string[] {
    const listPath = path.join(this.areaPath, 'area.lst');
    if (!fs.existsSync(listPath)) {
      throw new AreaStoreError(`area.lst not found at ${listPath} — is MERC_MUD_PATH correct?`, 500);
    }
    return fs
      .readFileSync(listPath, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && l !== '$');
  }

  listAreas(): AreaListEntry[] {
    return this.listAreaFiles().map((file) => {
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
   * Content identity of the raw on-disk bytes — the baseHash the client holds
   * while editing so a save can detect concurrent modification.
   */
  areaHash(file: string): string {
    return AreaStore.hashText(this.readAreaText(file));
  }

  private static hashText(text: string): string {
    return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
  }

  /** Per-file entity cache for the world vnum index, invalidated on mtime/size change. */
  private readonly worldIndexCache = new Map<
    string,
    { mtimeMs: number; size: number; entities: { kind: RefKind; vnum: number; name: string }[] }
  >();

  /**
   * kind → vnum → defining entity, across every area.lst entry except
   * excludeFile (the file being edited/imported supplies its OWN definitions
   * from the incoming model — its stale on-disk copy must not resolve refs).
   * Unparseable files contribute nothing. First definition wins on duplicates.
   */
  worldVnumIndex(excludeFile?: string): Record<RefKind, Map<number, { file: string; name: string }>> {
    const index: Record<RefKind, Map<number, { file: string; name: string }>> = {
      mob: new Map(),
      object: new Map(),
      room: new Map(),
    };
    for (const file of this.listAreaFiles()) {
      if (file === excludeFile) continue;
      let stat: fs.Stats;
      try {
        stat = fs.statSync(path.join(this.areaPath, file));
      } catch {
        continue;
      }
      const cached = this.worldIndexCache.get(file);
      let entities: { kind: RefKind; vnum: number; name: string }[];
      if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
        entities = cached.entities;
      } else {
        try {
          entities = collectDefinedEntities(this.readArea(file));
        } catch {
          entities = [];
        }
        this.worldIndexCache.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, entities });
      }
      for (const e of entities) {
        if (!index[e.kind].has(e.vnum)) index[e.kind].set(e.vnum, { file, name: e.name });
      }
    }
    return index;
  }

  /**
   * validateRefs with the REAL world as the cross-area resolver: locally
   * missing refs that another listed area defines come back as structured
   * external refs (file + entity name — linkable); only vnums missing from
   * every listed area remain warnings.
   */
  resolveRefs(area: AreaFile, selfFile?: string): RefsSummary {
    const index = this.worldVnumIndex(selfFile);
    return validateRefs(area, {
      resolveExternal: (kind, vnum) => index[kind].get(vnum) ?? null,
    });
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

  /**
   * Atomic write with timestamped backup. Refused unless write-enabled.
   * When opts.baseHash is given, the save is conditional: it must match the
   * hash of what is on disk RIGHT NOW or the write is refused with a 409
   * conflict (before any backup is taken). Absent baseHash keeps the historic
   * unconditional behavior.
   */
  writeArea(file: string, area: AreaFile, opts: { baseHash?: string } = {}): { backupPath: string | null; hash: string } {
    if (!this.writeEnabled) {
      throw new AreaStoreError(
        'disk writes are disabled (MUD_WRITE_ENABLED is not "true"); use preview/download instead',
        403,
      );
    }
    const target = this.areaFilePath(file);
    const text = this.emitValidated(file, area);

    if (opts.baseHash !== undefined) {
      const currentHash = fs.existsSync(target) ? AreaStore.hashText(fs.readFileSync(target, 'utf8')) : null;
      if (currentHash !== opts.baseHash) {
        throw new AreaConflictError(file, currentHash);
      }
    }

    const backupPath = fs.existsSync(target) ? this.backupExistingFile(file) : null;

    const tmp = `${target}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, text, 'utf8');
    fs.renameSync(tmp, target);
    return { backupPath, hash: AreaStore.hashText(text) };
  }

  /** Timestamped copy of an existing area file into backups/. Caller checks existence. */
  private backupExistingFile(file: string): string {
    const backupDir = path.join(this.areaPath, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `${file}.${stamp}.bak`);
    fs.copyFileSync(path.join(this.areaPath, file), backupPath);
    return backupPath;
  }

  /**
   * Guard #AREA header range edits before a preview/save. Enforced ONLY when
   * the incoming range differs from the on-disk header — stock files whose
   * declared ranges are already loose must keep saving untouched (corpus
   * tolerance). A changed range must (a) be sane, (b) still cover every vnum
   * the file defines (shrink guard), and (c) not overlap any OTHER listed
   * area's range — the same rule createArea enforces for new files.
   */
  assertHeaderChangeSafe(file: string, area: AreaFile): void {
    const header = area.sections.find((s): s is AreaHeaderSection => s.kind === 'area');
    if (!header) return;

    let rangeChanged = true;
    try {
      const onDisk = this.readArea(file);
      const current = onDisk.sections.find((s): s is AreaHeaderSection => s.kind === 'area');
      if (current && current.minVnum === header.minVnum && current.maxVnum === header.maxVnum) {
        rangeChanged = false;
      }
    } catch {
      // Missing or unparseable on-disk file: treat the range as changed and
      // enforce the full checks — never skip validation on unknown state.
    }
    if (!rangeChanged) return;

    const { minVnum, maxVnum } = header;
    const noRange = minVnum === 0 && maxVnum === 0; // helps/socials-style files declare no range
    if (
      !noRange &&
      (!Number.isInteger(minVnum) ||
        !Number.isInteger(maxVnum) ||
        minVnum < 1 ||
        maxVnum > 32767 || // AREA_DATA vnums are sh_int in merc.h
        minVnum > maxVnum)
    ) {
      throw new AreaStoreError('vnum range must satisfy 1 <= minVnum <= maxVnum <= 32767 (or 0 0 for no range)', 400);
    }

    const outside = vnumsOutsideRange(area, minVnum, maxVnum);
    if (outside.length > 0) {
      throw new AreaStoreError(
        `vnum range ${minVnum}-${maxVnum} no longer covers defined vnum(s) ${outside.slice(0, 5).join(', ')}` +
          (outside.length > 5 ? ` (+${outside.length - 5} more)` : '') +
          ' — delete or renumber those entities first',
        400,
      );
    }

    if (!noRange) {
      for (const a of this.listAreas()) {
        if (a.file.toLowerCase() === file.toLowerCase()) continue; // the area being edited
        if (a.minVnum === undefined || a.maxVnum === undefined) continue; // unparseable entry — cannot claim a range
        if (a.minVnum === 0 && a.maxVnum === 0) continue;
        if (minVnum <= a.maxVnum && maxVnum >= a.minVnum) {
          throw new AreaStoreError(
            `vnum range ${minVnum}-${maxVnum} overlaps ${a.file} (${a.minVnum}-${a.maxVnum})`,
            400,
          );
        }
      }
    }
  }

  /**
   * Create a brand-new area file and register it in area.lst. Boot-critical
   * ordering: the .are file is written and re-parse-validated BEFORE area.lst
   * gains its line, so a crash between the two steps leaves a harmless orphan
   * file, never a listed-but-missing area (which would kill boot_db).
   *
   * The C hot reload refuses files it did not see at boot
   * (area_reload.c: "'%s' is not a booted area (new areas need a
   * reboot/copyover)"), so the caller must run a copyover for first load —
   * reflected in the returned `requiresCopyover`.
   */
  createArea(input: {
    file: string;
    name: string;
    credits?: string;
    minVnum: number;
    maxVnum: number;
  }): { file: string; requiresCopyover: true; lstBackupPath: string } {
    if (!this.writeEnabled) {
      throw new AreaStoreError(
        'disk writes are disabled (MUD_WRITE_ENABLED is not "true"); use preview/download instead',
        403,
      );
    }
    const { file, name, minVnum, maxVnum } = input;
    const target = this.areaFilePath(file);
    if (typeof name !== 'string' || name.trim() === '') {
      throw new AreaStoreError('area name must be a non-empty string', 400);
    }
    if (
      !Number.isInteger(minVnum) ||
      !Number.isInteger(maxVnum) ||
      minVnum < 1 ||
      maxVnum > 32767 || // AREA_DATA vnums are sh_int in merc.h
      minVnum > maxVnum
    ) {
      throw new AreaStoreError('vnum range must satisfy 1 <= minVnum <= maxVnum <= 32767', 400);
    }
    if (fs.existsSync(target)) {
      throw new AreaStoreError(`area file already exists: ${file}`, 409);
    }

    const listed = this.listAreas();
    if (listed.some((a) => a.file.toLowerCase() === file.toLowerCase())) {
      throw new AreaStoreError(`${file} is already registered in area.lst`, 409);
    }
    for (const a of listed) {
      if (a.minVnum === undefined || a.maxVnum === undefined) continue; // unparseable entry — cannot claim a range
      if (a.minVnum === 0 && a.maxVnum === 0) continue; // helps/socials-style files declare no range
      if (minVnum <= a.maxVnum && maxVnum >= a.minVnum) {
        throw new AreaStoreError(
          `vnum range ${minVnum}-${maxVnum} overlaps ${a.file} (${a.minVnum}-${a.maxVnum})`,
          400,
        );
      }
    }

    const credits =
      input.credits !== undefined && input.credits.trim() !== '' ? input.credits : `{ 1 99} Builder  ${name.trim()}`;
    const area: AreaFile = {
      sections: [{ kind: 'area', fileName: file, name: name.trim(), credits, minVnum, maxVnum }],
    };
    const text = this.emitValidated(file, area);

    const tmp = `${target}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, text, 'utf8');
    fs.renameSync(tmp, target);

    const lstBackupPath = this.registerInAreaLst(file);

    return { file, requiresCopyover: true, lstBackupPath };
  }

  /** area.lst: backup, then atomically insert the new line before the '$'. */
  private registerInAreaLst(file: string): string {
    const listPath = path.join(this.areaPath, 'area.lst');
    const backupDir = path.join(this.areaPath, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const lstBackupPath = path.join(backupDir, `area.lst.${stamp}.bak`);
    fs.copyFileSync(listPath, lstBackupPath);

    const lines = fs.readFileSync(listPath, 'utf8').split(/\r?\n/);
    const endIdx = lines.findIndex((l) => l.trim() === '$');
    if (endIdx === -1) {
      throw new AreaStoreError('area.lst has no "$" terminator — refusing to modify it', 500);
    }
    lines.splice(endIdx, 0, file);
    const lstTmp = `${listPath}.tmp-${process.pid}`;
    fs.writeFileSync(lstTmp, lines.join('\n'), 'utf8');
    fs.renameSync(lstTmp, listPath);
    return lstBackupPath;
  }

  /**
   * Phase 10 quarantine validation of an UPLOADED .are text. Pure — never
   * touches the area dir. The commit is refused unless this returns zero
   * errors, so every check the editors enforce piecemeal runs here at once:
   * parse, canonical round-trip stability, header/range sanity, range overlap
   * against area.lst (skipping the file itself), refs and scripts.
   */
  importArea(file: string, text: string): ImportReport {
    assertValidAreaFileName(file);
    if (typeof text !== 'string' || text.trim().length === 0) {
      throw new AreaStoreError('import text must be a non-empty string', 400);
    }
    if (Buffer.byteLength(text, 'utf8') > MAX_IMPORT_BYTES) {
      throw new AreaStoreError(`import text exceeds the ${MAX_IMPORT_BYTES / (1024 * 1024)} MB limit`, 400);
    }
    if (text.includes('\u0000') || text.includes('\uFFFD')) {
      throw new AreaStoreError('import text contains binary/non-UTF8 content — .are files are plain text', 400);
    }

    const exists = fs.existsSync(path.join(this.areaPath, file));
    const listed = this.listAreas();
    const registered = listed.some((a) => a.file.toLowerCase() === file.toLowerCase());

    const errors: string[] = [];
    const warnings: string[] = [];
    const externalRefs: ExternalVnumRef[] = [];
    const report = (normalizedText: string | null, summary: Record<string, number> | null): ImportReport => ({
      file,
      exists,
      registered,
      errors,
      warnings,
      externalRefs,
      normalizedText,
      summary,
    });

    let area: AreaFile;
    try {
      area = parseAreaFile(text);
    } catch (e) {
      errors.push(`parse failed: ${(e as Error).message}`);
      return report(null, null);
    }

    // Round-trip stability: the canonical form we would write must survive its
    // own parse→emit cycle byte-identically, or the model is losing data.
    let normalizedText: string;
    try {
      normalizedText = emitAreaFile(area);
      if (emitAreaFile(parseAreaFile(normalizedText)) !== normalizedText) {
        errors.push('round-trip unstable: re-emitting the re-parsed canonical text differs — refusing to import');
      }
    } catch (e) {
      errors.push(`round-trip failed: ${(e as Error).message}`);
      return report(null, null);
    }
    if (normalizedText !== text) {
      warnings.push('formatting differs from canonical form — the file will be stored normalized (content is preserved by the round-trip check)');
    }

    const header = area.sections.find((s): s is AreaHeaderSection => s.kind === 'area');
    if (!header) {
      errors.push('missing #AREA header section — every importable area declares name/credits/vnum range');
    } else {
      const { minVnum, maxVnum } = header;
      const noRange = minVnum === 0 && maxVnum === 0; // helps/socials-style files declare no range
      if (
        !noRange &&
        (!Number.isInteger(minVnum) ||
          !Number.isInteger(maxVnum) ||
          minVnum < 1 ||
          maxVnum > 32767 || // AREA_DATA vnums are sh_int in merc.h
          minVnum > maxVnum)
      ) {
        errors.push('vnum range must satisfy 1 <= minVnum <= maxVnum <= 32767 (or 0 0 for no range)');
      } else {
        const outside = vnumsOutsideRange(area, minVnum, maxVnum);
        if (outside.length > 0) {
          errors.push(
            `declared range ${minVnum}-${maxVnum} does not cover defined vnum(s) ${outside.slice(0, 5).join(', ')}` +
              (outside.length > 5 ? ` (+${outside.length - 5} more)` : ''),
          );
        }
        if (!noRange) {
          for (const a of listed) {
            if (a.file.toLowerCase() === file.toLowerCase()) continue; // re-importing over itself
            if (a.minVnum === undefined || a.maxVnum === undefined) continue; // unparseable entry — cannot claim a range
            if (a.minVnum === 0 && a.maxVnum === 0) continue;
            if (minVnum <= a.maxVnum && maxVnum >= a.minVnum) {
              errors.push(`vnum range ${minVnum}-${maxVnum} overlaps ${a.file} (${a.minVnum}-${a.maxVnum})`);
            }
          }
        }
      }
    }

    const scripts = validateScripts(area);
    for (const e of scripts.errors) errors.push(`script: ${e}`);
    // Cross-area refs resolve against the real world index (self excluded — a
    // stale on-disk copy must not vouch for the incoming text); only vnums no
    // listed area defines remain warnings.
    const refs = this.resolveRefs(area, file);
    for (const e of refs.errors) errors.push(`refs: ${e}`);
    for (const w of refs.warnings) warnings.push(`refs: ${w}`);
    externalRefs.push(...refs.external);

    if (exists) {
      warnings.push(`${file} already exists on disk — committing requires "overwrite": true (a timestamped backup is taken first)`);
    }

    const summary: Record<string, number> = {};
    for (const s of area.sections) {
      const count =
        s.kind === 'mobiles' ? s.mobiles.length
        : s.kind === 'objects' ? s.objects.length
        : s.kind === 'rooms' ? s.rooms.length
        : s.kind === 'resets' ? s.resets.length
        : s.kind === 'shops' ? s.shops.length
        : s.kind === 'specials' ? s.specials.length
        : s.kind === 'helps' ? s.helps.length
        : s.kind === 'socials' ? s.socials.length
        : s.kind === 'scripts' ? s.scripts.length
        : null;
      if (count !== null) summary[s.kind] = (summary[s.kind] ?? 0) + count;
    }
    return report(normalizedText, summary);
  }

  /**
   * Commit a validated import: quarantine checks re-run here (never trust a
   * stale client-side report), then the canonical text lands atomically with
   * the same backup semantics as every other save. New files are registered
   * in area.lst AFTER the .are write (boot-safe ordering, as createArea) and
   * need a copyover to load; overwrites of listed files can hot-reload.
   */
  importAreaCommit(
    file: string,
    text: string,
    opts: { overwrite?: boolean } = {},
  ): { file: string; imported: true; backupPath: string | null; lstBackupPath: string | null; requiresCopyover: boolean; report: ImportReport } {
    if (!this.writeEnabled) {
      throw new AreaStoreError(
        'disk writes are disabled (MUD_WRITE_ENABLED is not "true"); use preview/download instead',
        403,
      );
    }
    const report = this.importArea(file, text);
    if (report.errors.length > 0) {
      throw new AreaStoreError(`import blocked: ${report.errors.join('; ')}`, 400);
    }
    if (report.exists && !opts.overwrite) {
      throw new AreaStoreError(`${file} already exists — set "overwrite": true to replace it (a timestamped backup is taken first)`, 409);
    }

    const target = this.areaFilePath(file);
    const backupPath = report.exists ? this.backupExistingFile(file) : null;
    const tmp = `${target}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, report.normalizedText as string, 'utf8');
    fs.renameSync(tmp, target);

    const lstBackupPath = report.registered ? null : this.registerInAreaLst(file);
    return { file, imported: true, backupPath, lstBackupPath, requiresCopyover: !report.registered, report };
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
