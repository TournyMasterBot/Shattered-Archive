import { createHash } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { mkdir, open, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FINGERPRINT_BYTES, parseCheckpoints, serializeCheckpoints, type Checkpoint } from './checkpoints.js';
import { SessionScan } from './primer.js';

export interface FileInfo {
  /** Relative to the log folder, forward slashes. */
  path: string;
  size: number;
  mtimeMs: number;
}

/** The file operations the tailer needs. The real ones are `nodeTailIo`; tests wrap them to count calls or inject failures. */
export interface TailIo {
  /** Every `.jsonl` file under `dir`, at any depth. Only that extension: the plain-text `.log` twin beside each one is never read. */
  list(dir: string): Promise<FileInfo[]>;
  /** The size, or undefined when the file is gone. */
  stat(file: string): Promise<{ size: number; mtimeMs: number } | undefined>;
  /** Up to `length` bytes from `start` (fewer at the end of the file). */
  read(file: string, start: number, length: number): Promise<Buffer>;
  readText(file: string): Promise<string | undefined>;
  /** Replaces the file whole (a temporary file, then a rename). */
  writeText(file: string, text: string): Promise<void>;
}

export interface TailBatch {
  /** Relative path of the source file. */
  file: string;
  /** Whole lines, without the line ending; blank lines removed. */
  lines: string[];
}

export interface TailStats {
  scans: number;
  files: number;
  lines: number;
  bytes: number;
  /** A file that shrank or was replaced and was read again from the start. */
  resets: number;
  /** A file that moved to a new name and kept its checkpoint. */
  renames: number;
  /** A line longer than `maxLineBytes`, skipped. */
  oversize: number;
  /** Reads, listings or checkpoint writes that failed (the loop carries on). */
  ioErrors: number;
  /** Batches the consumer threw on (skipped, not retried). */
  consumerErrors: number;
  lastScanAt?: number;
}

export interface TailerOptions {
  dir: string;
  checkpointPath: string;
  /** Awaited before the next read, so a slow consumer slows the tailer instead of filling memory. */
  onBatch: (batch: TailBatch) => void | Promise<void>;
  /** Called at the end of every pass, after reading (for example to close a block that has stopped growing). A failure is counted. */
  onPollEnd?: () => void | Promise<void>;
  io?: TailIo;
  /** Bytes per read (default 1 MiB): the most that is in memory for one batch. */
  chunkBytes?: number;
  /** A line longer than this is skipped (default 8 MiB). */
  maxLineBytes?: number;
  /** How many of the newest files are checked on every poll; the rest only on a full scan (default 4). */
  hotFiles?: number;
  /** On the very first scan the newest file is read from this far before its end, so the state is not empty (default 256 KiB). */
  backfillBytes?: number;
  /** After a resume, how far back (newest file first) to look for the open connection and the logged-in character (default 8 MiB). */
  primeBytes?: number;
  pollMs?: number;
  scanMs?: number;
  now?: () => number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

const MAX_DEPTH = 12;

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ENOENT';
}

export const nodeTailIo: TailIo = {
  async list(dir) {
    const out: FileInfo[] = [];
    const walk = async (rel: string, depth: number): Promise<void> => {
      if (depth > MAX_DEPTH) return;
      let entries: Dirent[];
      try {
        entries = await readdir(path.join(dir, rel), { withFileTypes: true });
      } catch (error) {
        if (isMissing(error)) return;
        throw error;
      }
      for (const entry of entries) {
        const relPath = rel === '' ? entry.name : `${rel}/${entry.name}`;
        if (entry.isDirectory()) {
          await walk(relPath, depth + 1);
        } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          try {
            const s = await stat(path.join(dir, relPath));
            out.push({ path: relPath, size: s.size, mtimeMs: s.mtimeMs });
          } catch (error) {
            if (!isMissing(error)) throw error; // removed between the listing and the stat
          }
        }
      }
    };
    await walk('', 0);
    return out;
  },
  async stat(file) {
    try {
      const s = await stat(file);
      return { size: s.size, mtimeMs: s.mtimeMs };
    } catch (error) {
      if (isMissing(error)) return undefined;
      throw error;
    }
  },
  async read(file, start, length) {
    const handle = await open(file, 'r');
    try {
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, start);
      return buffer.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  },
  async readText(file) {
    try {
      return await readFile(file, 'utf8');
    } catch (error) {
      if (isMissing(error)) return undefined;
      throw error;
    }
  },
  async writeText(file, text) {
    await mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.tmp`;
    await writeFile(temp, text, 'utf8');
    await rename(temp, file);
  },
};

function defaultSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = (): void => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
  });
}

const sha1 = (buffer: Buffer): string => createHash('sha1').update(buffer).digest('hex');
const newestFirst = (a: FileInfo, b: FileInfo): number => b.mtimeMs - a.mtimeMs || (a.path < b.path ? 1 : -1);

/**
 * Follows the game-server's jsonl logs and hands whole lines to `onBatch`.
 *
 * - Files are found by LISTING the folder (any depth), never by building a name from the date: the file for one day can sit in the
 *   previous day's folder (LOGTAIL-01). Only `*.jsonl` is read.
 * - A checkpoint (path, byte offset, size, prefix fingerprint) per file survives restarts. The offset only ever moves past a
 *   complete line, so a half-written last line is read once, when it is finished.
 * - A file that shrinks, or whose prefix no longer matches, is read again from the start; a file that moved to a new name keeps
 *   its checkpoint (matched by prefix fingerprint).
 * - The first scan of a new installation does not replay the history: every existing file starts at its end, except the newest,
 *   which starts `backfillBytes` before its end so the current room and vitals are known.
 * - Files with new data are read oldest first, so the reducer's "last room" is the newest one.
 * - After `signal` aborts no further read or wait starts; the checkpoint of what was delivered is still written.
 */
export class Tailer {
  readonly stats: TailStats = { scans: 0, files: 0, lines: 0, bytes: 0, resets: 0, renames: 0, oversize: 0, ioErrors: 0, consumerErrors: 0 };
  private readonly io: TailIo;
  private readonly chunk: number;
  private readonly maxLine: number;
  private readonly hot: number;
  private readonly backfill: number;
  private readonly primeBytes: number;
  private readonly pollMs: number;
  private readonly scanMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  private checkpoints = new Map<string, Checkpoint>();
  private baselined = false;
  private loaded = false;
  private dirty = false;
  private layout: FileInfo[] = [];
  /** Files whose prefix was checked and whose size has not changed since: not re-checked on every poll. */
  private verified = new Set<string>();
  private rescan = false;
  /** Paused by the owner (Copilot is switched off): no pass reads anything. */
  private paused = false;
  /** Set when a pause ends: the next pass moves every file to its current end before it reads. */
  private skipAhead = false;

  constructor(private readonly options: TailerOptions) {
    this.io = options.io ?? nodeTailIo;
    this.chunk = options.chunkBytes ?? 1024 * 1024;
    this.maxLine = options.maxLineBytes ?? 8 * 1024 * 1024;
    this.hot = options.hotFiles ?? 4;
    this.backfill = options.backfillBytes ?? 256 * 1024;
    this.primeBytes = options.primeBytes ?? 8 * 1024 * 1024;
    this.pollMs = options.pollMs ?? 1000;
    this.scanMs = options.scanMs ?? 10_000;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? defaultSleep;
  }

  /**
   * Pause or resume. While paused no pass lists, reads or feeds anything. Resuming does NOT catch up: the next pass moves every file to
   * its current end first, so no game text or command written while paused (or before the very first resume after a start) is ever
   * learned. The one exception is the SESSION: the newest connect/close record and, after a connect, the login, room and vitals records,
   * are delivered (see `primeSession`), because without them a switch-on in the middle of a connection never learns it is connected.
   */
  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    if (!paused) {
      this.skipAhead = true;
      this.rescan = true;
    }
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** A copy of the current checkpoints, oldest path first. */
  snapshot(): Checkpoint[] {
    return [...this.checkpoints.values()].map((c) => ({ ...c })).sort((a, b) => a.path.localeCompare(b.path));
  }

  /** Poll until `signal` aborts. Never rejects: a failing pass is counted and the loop carries on. */
  async run(signal: AbortSignal): Promise<void> {
    let nextScan = 0;
    while (!signal.aborted) {
      const t = this.now();
      const full = t >= nextScan || this.rescan;
      if (full) nextScan = t + this.scanMs;
      await this.poll(full, signal);
      if (signal.aborted) break;
      await this.sleep(this.pollMs, signal);
    }
  }

  /**
   * One pass. `full` lists the whole folder (new files, renames, removals); otherwise only the newest files are checked.
   * Never throws.
   */
  async poll(full: boolean, signal?: AbortSignal): Promise<void> {
    if (this.paused) return;
    try {
      if (!this.loaded) await this.load();
      if (full || this.skipAhead || this.layout.length === 0) await this.scan();
      else await this.refreshHot();
      if (this.skipAhead) await this.skipToEnd();
      await this.drainAll(signal);
      await this.options.onPollEnd?.();
    } catch {
      this.stats.ioErrors++;
    }
    await this.save();
  }

  // ---- checkpoints -----------------------------------------------------------------------------------------------------

  private async load(): Promise<void> {
    this.loaded = true;
    let text: string | undefined;
    try {
      text = await this.io.readText(this.options.checkpointPath);
    } catch {
      this.stats.ioErrors++;
    }
    const file = parseCheckpoints(text);
    this.baselined = file.baselined;
    this.checkpoints = new Map(file.files.map((c) => [c.path, c]));
  }

  private async save(): Promise<void> {
    if (!this.dirty) return;
    this.dirty = false;
    try {
      await this.io.writeText(this.options.checkpointPath, serializeCheckpoints({ baselined: this.baselined, files: [...this.checkpoints.values()] }));
    } catch {
      this.dirty = true;
      this.stats.ioErrors++;
    }
  }

  private fingerprint(file: string, length: number): Promise<Buffer> {
    return this.io.read(path.join(this.options.dir, file), 0, length);
  }

  // ---- discovery ---------------------------------------------------------------------------------------------------------

  private async scan(): Promise<void> {
    const listed = (await this.io.list(this.options.dir)).sort(newestFirst);
    this.rescan = false;
    this.layout = listed;
    this.stats.scans++;
    this.stats.files = listed.length;
    this.stats.lastScanAt = this.now();

    const present = new Set(listed.map((f) => f.path));
    const vanished = [...this.checkpoints.values()].filter((c) => !present.has(c.path));
    const unknown = listed.filter((f) => !this.checkpoints.has(f.path));
    const moved = new Set<string>();

    // A new name whose prefix equals an old checkpoint's prefix is that file renamed (a rotation): it keeps its position. The old
    // file is gone from its name, or the name now holds a different file (the usual rotation: rename, then create a fresh one).
    if (unknown.length > 0 && this.baselined) {
      const sources = [...vanished];
      for (const cp of this.checkpoints.values()) {
        if (!present.has(cp.path) || cp.fpLen === 0) continue;
        const head = await this.fingerprint(cp.path, cp.fpLen);
        if (head.length !== cp.fpLen || sha1(head) !== cp.fp) sources.push(cp);
      }
      for (const info of unknown) {
        for (const old of sources) {
          if (old.fpLen === 0 || old.offset > info.size) continue;
          const head = await this.fingerprint(info.path, old.fpLen);
          if (head.length === old.fpLen && sha1(head) === old.fp) {
            this.checkpoints.delete(old.path);
            this.checkpoints.set(info.path, { ...old, path: info.path });
            this.verified.delete(old.path);
            sources.splice(sources.indexOf(old), 1);
            moved.add(old.path);
            this.stats.renames++;
            this.dirty = true;
            break;
          }
        }
      }
    }
    for (const gone of vanished) {
      if (moved.has(gone.path)) continue;
      this.checkpoints.delete(gone.path);
      this.verified.delete(gone.path);
      this.dirty = true;
    }

    const firstScan = !this.baselined;
    for (const [index, info] of listed.entries()) {
      if (this.checkpoints.has(info.path)) continue;
      if (firstScan) await this.baseline(info, index === 0);
      else this.checkpoints.set(info.path, { path: info.path, offset: 0, size: 0, fpLen: 0, fp: '' }); // a file created later: from the start
      this.dirty = true;
    }
    if (firstScan) {
      this.baselined = true;
      this.dirty = true;
    }
  }

  /** After a pause: every listed file starts at its current end, as if the folder had just been found. */
  private async skipToEnd(): Promise<void> {
    this.skipAhead = false;
    for (const info of this.layout) await this.baseline(info, false);
    this.baselined = true;
    this.dirty = true;
    await this.primeSession();
  }

  /**
   * Delivers only the session records that were already in the logs when Copilot was switched on: whether a connection is open (and to
   * where), the character logged in on it, its room and vitals. Scans backwards from the end of the newest file, further back through
   * older files, until the newest connect or close record, a server start-up record, or `primeBytes` is reached. No text or command.
   */
  private async primeSession(): Promise<void> {
    const scan = new SessionScan();
    let budget = this.primeBytes;
    let source = '';
    for (const info of this.layout) {
      if (scan.done || budget <= 0) break;
      source = info.path;
      let end = info.size;
      let carry: Buffer = Buffer.alloc(0);
      while (end > 0 && budget > 0 && !scan.done) {
        const start = Math.max(0, end - Math.min(this.chunk, budget));
        const read = await this.io.read(path.join(this.options.dir, info.path), start, end - start);
        budget -= end - start;
        end = start;
        const joined = Buffer.concat([read, carry]);
        const firstBreak = start === 0 ? -1 : joined.indexOf(0x0a);
        const body = start === 0 ? joined : joined.subarray(firstBreak + 1);
        // the bytes before the first line ending belong to a line that starts in the previous (earlier) chunk
        carry = start === 0 || firstBreak < 0 ? (joined.length > this.maxLine ? Buffer.alloc(0) : joined) : joined.subarray(0, firstBreak);
        if (firstBreak < 0 && start !== 0) continue;
        const text = body.toString('utf8').split('\n');
        for (let i = text.length - 1; i >= 0 && !scan.done; i--) if (text[i] !== '') scan.offer(text[i].endsWith('\r') ? text[i].slice(0, -1) : text[i]);
      }
    }
    const primed = scan.lines();
    if (primed.length === 0) return;
    try {
      await this.options.onBatch({ file: source, lines: primed });
    } catch {
      this.stats.consumerErrors++;
    }
  }

  /** Decide where an existing file starts on the very first scan: its end, or (for the newest) a little before it. */
  private async baseline(info: FileInfo, newest: boolean): Promise<void> {
    let offset = info.size;
    if (newest && info.size > 0) {
      const start = Math.max(0, info.size - this.backfill);
      if (start === 0) {
        offset = 0;
      } else {
        const window = await this.io.read(path.join(this.options.dir, info.path), start, info.size - start);
        const firstBreak = window.indexOf(0x0a);
        offset = firstBreak < 0 ? info.size : start + firstBreak + 1; // start on a line boundary
      }
    }
    const cp: Checkpoint = { path: info.path, offset, size: info.size, fpLen: 0, fp: '' };
    await this.refreshFingerprint(cp);
    this.checkpoints.set(info.path, cp);
  }

  private async refreshHot(): Promise<void> {
    const next: FileInfo[] = [];
    for (const [index, info] of this.layout.entries()) {
      if (index >= this.hot) {
        next.push(info);
        continue;
      }
      const current = await this.io.stat(path.join(this.options.dir, info.path));
      if (current === undefined) {
        this.rescan = true; // gone or renamed: the next pass lists the folder
        continue;
      }
      next.push({ path: info.path, size: current.size, mtimeMs: current.mtimeMs });
    }
    this.layout = next;
  }

  // ---- reading -----------------------------------------------------------------------------------------------------------

  /** Read every file that has new data, oldest first. */
  private async drainAll(signal?: AbortSignal): Promise<void> {
    const work = [...this.layout].reverse();
    for (const info of work) {
      if (signal?.aborted || this.paused) return;
      const cp = this.checkpoints.get(info.path);
      if (cp === undefined) continue;
      try {
        await this.drain(cp, info, signal);
      } catch {
        this.stats.ioErrors++;
      }
    }
  }

  private async refreshFingerprint(cp: Checkpoint): Promise<void> {
    const want = Math.min(FINGERPRINT_BYTES, cp.offset);
    if (want === cp.fpLen) return;
    const head = await this.fingerprint(cp.path, want);
    cp.fpLen = head.length;
    cp.fp = head.length === 0 ? '' : sha1(head);
  }

  private async drain(cp: Checkpoint, info: FileInfo, signal?: AbortSignal): Promise<void> {
    const size = info.size;
    if (size < cp.offset) {
      this.reset(cp); // truncated
    } else if ((size !== cp.size || !this.verified.has(cp.path)) && cp.fpLen > 0) {
      const head = await this.fingerprint(cp.path, cp.fpLen);
      if (head.length !== cp.fpLen || sha1(head) !== cp.fp) this.reset(cp); // same name, different file
    }
    this.verified.add(cp.path);

    while (!signal?.aborted && !this.paused && cp.offset < size) {
      let want = Math.min(this.chunk, size - cp.offset);
      let buffer = await this.io.read(path.join(this.options.dir, cp.path), cp.offset, want);
      let lastBreak = buffer.lastIndexOf(0x0a);
      // A line longer than the chunk: widen the read until it ends, up to the line limit.
      while (lastBreak < 0 && buffer.length === want && cp.offset + want < size && want < this.maxLine) {
        want = Math.min(want * 2, size - cp.offset, this.maxLine);
        buffer = await this.io.read(path.join(this.options.dir, cp.path), cp.offset, want);
        lastBreak = buffer.lastIndexOf(0x0a);
      }

      if (lastBreak < 0) {
        if (buffer.length === want && want >= this.maxLine && cp.offset + want < size) {
          // No line ending in the longest line we accept: skip these bytes; what follows is read as a (malformed) fragment.
          this.stats.oversize++;
          cp.offset += buffer.length;
          this.dirty = true;
          await this.refreshFingerprint(cp);
          continue;
        }
        break; // the last line is still being written: wait for its end
      }

      const consumed = lastBreak + 1;
      const lines = buffer
        .subarray(0, lastBreak)
        .toString('utf8')
        .split('\n')
        .map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line))
        .filter((line) => line !== '');
      if (lines.length > 0) {
        try {
          await this.options.onBatch({ file: cp.path, lines });
        } catch {
          this.stats.consumerErrors++; // a poison batch is skipped, never retried forever
        }
        this.stats.lines += lines.length;
      }
      this.stats.bytes += consumed;
      cp.offset += consumed;
      this.dirty = true;
      await this.refreshFingerprint(cp);
    }
    if (cp.size !== size) {
      cp.size = size;
      this.dirty = true;
    }
  }

  private reset(cp: Checkpoint): void {
    cp.offset = 0;
    cp.size = 0;
    cp.fpLen = 0;
    cp.fp = '';
    this.stats.resets++;
    this.dirty = true;
  }
}
