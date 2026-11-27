import type { Validated } from './records.js';

/** The file operations the ledger needs. Supplied by the server (real files) or a test (an in-memory fake). */
export interface LedgerFs {
  /** Append `text` to the file, creating it. The text is one whole line; a failure may leave nothing or a torn line. */
  append(path: string, text: string): Promise<void>;
  /** The whole file, or undefined when it does not exist. */
  read(path: string): Promise<string | undefined>;
  /** The size in bytes, or undefined when the file does not exist. */
  size(path: string): Promise<number | undefined>;
  rename(from: string, to: string): Promise<void>;
  /** Paths of existing files whose path starts with `prefix`. */
  list(prefix: string): Promise<string[]>;
}

export interface StoreOptions<T> {
  fs: LedgerFs;
  /** The active file, for example `<data>/ledger/decisions.jsonl`. Rotated files are `<path>.1`, `<path>.2`, ... */
  path: string;
  validate: (value: unknown) => Validated<T>;
  schemaVersion?: number;
  /** Rotate the active file to `<path>.<n>` before an append when it has reached this many bytes. */
  maxBytes?: number;
}

export interface LoadReport {
  /** Distinct records now in the index. */
  records: number;
  /** Lines that could not be used: torn, not JSON, another schema version, or failing validation. */
  skipped: number;
}

export type AppendResult = { ok: true; written: boolean } | { ok: false; error: string };

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * An append-only JSONL store of records with an `id`. Every line is `{"v":<schema version>,"r":<record>}`.
 *
 * - Appending a record whose id exists adds a new version; queries return the latest version of each id, in the order the ids first
 *   appeared. Appending an identical record writes nothing, so a retry cannot duplicate.
 * - A torn last line (a crash in the middle of an append) is skipped and counted, and the next append starts on a fresh line.
 * - A failed write returns an error and changes nothing in memory.
 * - Calls are serialised, so a rotation or an append never interleaves with another.
 */
export class JsonlStore<T extends { id: string }> {
  private readonly index = new Map<string, T>();
  private needsNewline = false;
  private archives: number[] = [];
  private tail: Promise<unknown> = Promise.resolve();
  private skippedLines = 0;

  private constructor(private readonly options: StoreOptions<T>) {}

  /** Read the archives and the active file into memory. */
  static async open<R extends { id: string }>(options: StoreOptions<R>): Promise<{ store: JsonlStore<R>; report: LoadReport }> {
    const store = new JsonlStore<R>(options);
    const report = await store.load();
    return { store, report };
  }

  get skipped(): number {
    return this.skippedLines;
  }

  get(id: string): T | undefined {
    return this.index.get(id);
  }

  /** The latest version of every record, optionally filtered. */
  query(filter?: (record: T) => boolean): T[] {
    const all = [...this.index.values()];
    return filter ? all.filter(filter) : all;
  }

  append(record: T): Promise<AppendResult> {
    return this.enqueue(() => this.appendNow(record));
  }

  private enqueue<R>(task: () => Promise<R>): Promise<R> {
    const next = this.tail.then(task, task);
    this.tail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private get version(): number {
    return this.options.schemaVersion ?? 1;
  }

  private async load(): Promise<LoadReport> {
    const { fs, path } = this.options;
    const found = await fs.list(`${path}.`);
    this.archives = found
      .map((p) => /\.(\d+)$/.exec(p))
      .flatMap((m) => (m ? [Number(m[1])] : []))
      .sort((a, b) => a - b);

    for (const seq of this.archives) this.ingest(await fs.read(`${path}.${seq}`), false);
    this.ingest(await fs.read(path), true);
    return { records: this.index.size, skipped: this.skippedLines };
  }

  private ingest(text: string | undefined, active: boolean): void {
    if (text === undefined || text === '') return;
    if (active) this.needsNewline = !text.endsWith('\n');
    for (const line of text.split('\n')) {
      if (line === '') continue;
      let wrapper: unknown;
      try {
        wrapper = JSON.parse(line) as unknown;
      } catch {
        this.skippedLines++;
        continue;
      }
      if (typeof wrapper !== 'object' || wrapper === null || (wrapper as { v?: unknown }).v !== this.version) {
        this.skippedLines++;
        continue;
      }
      const checked = this.options.validate((wrapper as { r?: unknown }).r);
      if (!checked.ok) {
        this.skippedLines++;
        continue;
      }
      this.index.set(checked.value.id, checked.value);
    }
  }

  private async appendNow(record: T): Promise<AppendResult> {
    const { fs, path, maxBytes } = this.options;
    const checked = this.options.validate(record);
    if (!checked.ok) return { ok: false, error: `invalid record: ${checked.errors.join('; ')}` };

    const current = this.index.get(checked.value.id);
    if (current !== undefined && deepEqual(current, checked.value)) return { ok: true, written: false };

    try {
      if (maxBytes !== undefined && ((await fs.size(path)) ?? 0) >= maxBytes) {
        const next = (this.archives[this.archives.length - 1] ?? 0) + 1;
        await fs.rename(path, `${path}.${next}`);
        this.archives.push(next);
        this.needsNewline = false;
      }
      const line = `${JSON.stringify({ v: this.version, r: checked.value })}\n`;
      // a torn tail from a crash must not swallow the new record: start it on its own line
      const text = this.needsNewline ? `\n${line}` : line;
      this.needsNewline = true; // until the write is known to have completed, assume a partial line may exist
      await fs.append(path, text);
      this.needsNewline = false;
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'write failed' };
    }
    this.index.set(checked.value.id, checked.value);
    return { ok: true, written: true };
  }
}
