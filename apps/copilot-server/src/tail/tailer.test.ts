import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Tailer, nodeTailIo, type FileInfo, type TailBatch, type TailIo, type TailerOptions } from './tailer';

let root: string;
let logs: string;
let cpFile: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-tail-'));
  logs = path.join(root, 'logs');
  fs.mkdirSync(logs, { recursive: true });
  cpFile = path.join(root, 'data', 'tail', 'checkpoints.json');
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const file = (rel: string): string => path.join(logs, ...rel.split('/'));
function write(rel: string, text: string, mtimeSeconds?: number): void {
  fs.mkdirSync(path.dirname(file(rel)), { recursive: true });
  fs.writeFileSync(file(rel), text);
  if (mtimeSeconds !== undefined) fs.utimesSync(file(rel), mtimeSeconds, mtimeSeconds);
}
const append = (rel: string, text: string): void => fs.appendFileSync(file(rel), text);
const lines = (...l: string[]): string => l.map((x) => `${x}\n`).join('');

/** A tailer over the scratch folder that records every delivered line. */
function make(extra: Partial<TailerOptions> = {}): { tailer: Tailer; got: string[]; batches: TailBatch[] } {
  const got: string[] = [];
  const batches: TailBatch[] = [];
  const tailer = new Tailer({
    dir: logs,
    checkpointPath: cpFile,
    onBatch: (b) => {
      batches.push(b);
      got.push(...b.lines);
    },
    ...extra,
  });
  return { tailer, got, batches };
}

/** The real file operations, counted, with optional failures injected per operation. */
function counted(fail: Partial<Record<keyof TailIo, Error>> = {}): { io: TailIo; calls: Record<keyof TailIo, number> } {
  const calls = { list: 0, stat: 0, read: 0, readText: 0, writeText: 0 };
  const wrap = <K extends keyof TailIo>(name: K): TailIo[K] =>
    (async (...args: unknown[]) => {
      calls[name]++;
      const error = fail[name];
      if (error) throw error;
      return (nodeTailIo[name] as (...a: unknown[]) => unknown)(...args);
    }) as TailIo[K];
  return { io: { list: wrap('list'), stat: wrap('stat'), read: wrap('read'), readText: wrap('readText'), writeText: wrap('writeText') }, calls };
}

describe('discovery (LOGTAIL-01, E16)', () => {
  it('reads only .jsonl files, at any depth, and ignores the plain-text twin beside each one', async () => {
    const { tailer, got } = make();
    await tailer.poll(true); // first scan of an empty folder: nothing there yet
    write('2026/11/05/server.log-2026-11-06.jsonl', lines('json-a', 'json-b'));
    write('2026/11/05/server-2026-11-06.log', lines('text twin 1', 'text twin 2'));
    write('2026/11/06/server.log-2026-11-06.jsonl.bak', lines('backup'));
    await tailer.poll(true);
    expect(got).toEqual(['json-a', 'json-b']);
    expect(tailer.snapshot().map((c) => c.path)).toEqual(['2026/11/05/server.log-2026-11-06.jsonl']);
  });

  it('finds the next date file inside the previous day folder, because it lists instead of building a name from the date (T1)', async () => {
    const { tailer, got } = make();
    write('2026/11/05/server.log-2026-11-05.jsonl', lines('day-1'));
    await tailer.poll(true);
    write('2026/11/05/server.log-2026-11-06.jsonl', lines('day-2 in the day-1 folder'));
    await tailer.poll(true);
    expect(got).toEqual(['day-1', 'day-2 in the day-1 folder']);
  });

  it('handles a missing log folder: nothing to read, no error', async () => {
    const { tailer, got } = make({ dir: path.join(root, 'absent') });
    await tailer.poll(true);
    expect(got).toEqual([]);
    expect(tailer.stats.ioErrors).toBe(0);
    expect(tailer.stats.files).toBe(0);
  });

  it('does not descend past the depth limit', async () => {
    const deep = Array.from({ length: 14 }, (_, i) => `d${i}`).join('/');
    const { tailer, got } = make();
    await tailer.poll(true);
    write(`${deep}/x.jsonl`, lines('too deep'));
    write('shallow/x.jsonl', lines('shallow'));
    await tailer.poll(true);
    expect(got).toEqual(['shallow']);
  });
});

describe('first scan (baseline)', () => {
  it('does not replay history: existing files start at their end, the newest is backfilled', async () => {
    write('old/server.log-2026-11-01.jsonl', lines('old-1', 'old-2'), 1_000);
    write('new/server.log-2026-11-02.jsonl', lines('new-1', 'new-2'), 2_000);
    const { tailer, got } = make();
    await tailer.poll(true);
    expect(got).toEqual(['new-1', 'new-2']);
    append('old/server.log-2026-11-01.jsonl', lines('old-3'));
    await tailer.poll(true);
    expect(got).toEqual(['new-1', 'new-2', 'old-3']);
  });

  it('starts the backfill of a long newest file on a line boundary', async () => {
    const all = Array.from({ length: 100 }, (_, i) => `line-${String(i).padStart(3, '0')}`);
    write('a/server.log-2026-11-02.jsonl', lines(...all));
    const { tailer, got } = make({ backfillBytes: 100 }); // each line is 9 bytes, so about 11 lines
    await tailer.poll(true);
    expect(got.length).toBeGreaterThan(5);
    expect(got.length).toBeLessThan(15);
    expect(got.every((l) => /^line-\d{3}$/.test(l))).toBe(true); // no cut line
    expect(got[got.length - 1]).toBe('line-099');
  });

  it('skips the whole window when it holds no line break at all', async () => {
    write('a/server.log-2026-11-02.jsonl', `${'x'.repeat(500)}\n`);
    const { tailer, got } = make({ backfillBytes: 50 });
    await tailer.poll(true);
    expect(got).toEqual([]);
    append('a/server.log-2026-11-02.jsonl', lines('after'));
    await tailer.poll(true);
    expect(got).toEqual(['after']);
  });

  it('handles an empty newest file', async () => {
    write('a/server.log-2026-11-02.jsonl', '');
    const { tailer, got } = make();
    await tailer.poll(true);
    append('a/server.log-2026-11-02.jsonl', lines('first'));
    await tailer.poll(true);
    expect(got).toEqual(['first']);
  });

  it('a file created after the first scan is read from its first byte', async () => {
    write('a/server.log-2026-11-02.jsonl', lines('seen'), 100);
    const { tailer, got } = make();
    await tailer.poll(true);
    write('a/server.log-2026-11-03.jsonl', lines('brand', 'new'), 200);
    await tailer.poll(true);
    expect(got).toEqual(['seen', 'brand', 'new']);
  });
});

describe('complete lines and restarts (LOGTAIL-01)', () => {
  it('reads a half-written last line once, when it is finished', async () => {
    const { tailer, got } = make();
    await tailer.poll(true);
    write('a/x.jsonl', 'whole\npart');
    await tailer.poll(true);
    expect(got).toEqual(['whole']);
    append('a/x.jsonl', 'ial\n');
    await tailer.poll(true);
    expect(got).toEqual(['whole', 'partial']);
    await tailer.poll(true);
    expect(got).toEqual(['whole', 'partial']);
  });

  it('strips CRLF line endings and drops blank lines', async () => {
    const { tailer, got } = make();
    await tailer.poll(true);
    write('a/x.jsonl', 'one\r\n\r\ntwo\n\n');
    await tailer.poll(true);
    expect(got).toEqual(['one', 'two']);
  });

  it('decodes multi-byte text and never splits a character across batches', async () => {
    const { tailer, got } = make({ chunkBytes: 7 });
    await tailer.poll(true);
    write('a/x.jsonl', lines('héllo wörld ✓', 'ünïcode'));
    await tailer.poll(true);
    expect(got).toEqual(['héllo wörld ✓', 'ünïcode']);
  });

  it('continues after a restart from the saved checkpoint: no repeat, no loss', async () => {
    const first = make();
    await first.tailer.poll(true);
    write('a/x.jsonl', lines('1', '2', '3'));
    await first.tailer.poll(true);
    expect(first.got).toEqual(['1', '2', '3']);

    append('a/x.jsonl', lines('4')); // written while Copilot is down
    const second = make();
    await second.tailer.poll(true);
    expect(second.got).toEqual(['4']);
    append('a/x.jsonl', lines('5'));
    await second.tailer.poll(true);
    expect(second.got).toEqual(['4', '5']);
  });

  it('a restart picks up a file created while it was down, from its first byte', async () => {
    const first = make();
    await first.tailer.poll(true);
    write('a/x.jsonl', lines('1'), 100);
    await first.tailer.poll(true);

    write('a/y.jsonl', lines('while', 'down'), 200);
    const second = make();
    await second.tailer.poll(true);
    expect(second.got).toEqual(['while', 'down']);
  });

  it('survives a corrupt checkpoint file by starting from the end of each file, not from the start', async () => {
    write('a/x.jsonl', lines('old'.repeat(10)).repeat(1));
    fs.mkdirSync(path.dirname(cpFile), { recursive: true });
    fs.writeFileSync(cpFile, '{not json');
    const { tailer, got } = make({ backfillBytes: 0 });
    await tailer.poll(true);
    expect(got).toEqual([]);
    append('a/x.jsonl', lines('new'));
    await tailer.poll(true);
    expect(got).toEqual(['new']);
  });
});

describe('rotation, replacement and truncation', () => {
  it('a renamed file keeps its checkpoint and its old lines are not delivered again', async () => {
    const { tailer, got } = make();
    await tailer.poll(true);
    write('a/server.jsonl', lines('old-1', 'old-2'));
    await tailer.poll(true);

    fs.renameSync(file('a/server.jsonl'), file('a/server.1.jsonl'));
    write('a/server.jsonl', lines('fresh-1'));
    await tailer.poll(true);
    expect(got).toEqual(['old-1', 'old-2', 'fresh-1']);
    expect(tailer.stats.renames).toBe(1);
    expect(tailer.snapshot().map((c) => c.path)).toEqual(['a/server.1.jsonl', 'a/server.jsonl']);

    append('a/server.1.jsonl', lines('old-3')); // the rotated file grows once more
    await tailer.poll(true);
    expect(got).toEqual(['old-1', 'old-2', 'fresh-1', 'old-3']);
  });

  it('a different file at the same path (bigger than the old one) is read from the start', async () => {
    const { tailer, got } = make();
    await tailer.poll(true);
    write('a/x.jsonl', lines('old-a', 'old-b'));
    await tailer.poll(true);

    write('a/x.jsonl', lines('new-file-line-1', 'new-file-line-2', 'new-file-line-3'));
    await tailer.poll(true);
    expect(got).toEqual(['old-a', 'old-b', 'new-file-line-1', 'new-file-line-2', 'new-file-line-3']);
    expect(tailer.stats.resets).toBe(1);
  });

  it('a file that shrinks is read again from the start', async () => {
    const { tailer, got } = make();
    await tailer.poll(true);
    write('a/x.jsonl', lines('a-long-first-line', 'another-long-line'));
    await tailer.poll(true);
    write('a/x.jsonl', lines('short'));
    await tailer.poll(true);
    expect(got).toEqual(['a-long-first-line', 'another-long-line', 'short']);
    expect(tailer.stats.resets).toBe(1);
  });

  it('forgets the checkpoint of a file that was deleted', async () => {
    const { tailer } = make();
    await tailer.poll(true);
    write('a/x.jsonl', lines('1'));
    await tailer.poll(true);
    fs.rmSync(file('a/x.jsonl'));
    await tailer.poll(true);
    expect(tailer.snapshot()).toEqual([]);
    expect(JSON.parse(fs.readFileSync(cpFile, 'utf8')).files).toEqual([]);
  });

  it('a vanished checkpoint whose prefix matches nothing stays unmatched: the new file is read from the start', async () => {
    const { tailer, got } = make();
    await tailer.poll(true);
    write('a/x.jsonl', lines('first-file-content'));
    await tailer.poll(true);
    fs.rmSync(file('a/x.jsonl'));
    write('b/y.jsonl', lines('unrelated'));
    await tailer.poll(true);
    expect(got).toEqual(['first-file-content', 'unrelated']);
    expect(tailer.stats.renames).toBe(0);
  });

  it('does not treat a smaller unrelated file as the renamed one', async () => {
    const { tailer, got } = make();
    await tailer.poll(true);
    write('a/x.jsonl', lines('a-line-that-is-fairly-long-so-the-offset-is-big'));
    await tailer.poll(true);
    fs.rmSync(file('a/x.jsonl'));
    write('b/y.jsonl', lines('tiny'));
    await tailer.poll(true);
    expect(got).toEqual(['a-line-that-is-fairly-long-so-the-offset-is-big', 'tiny']);
    expect(tailer.stats.renames).toBe(0);
  });

  it('a file that is shorter than the prefix being compared is not a match', async () => {
    const { tailer } = make();
    await tailer.poll(true);
    write('a/x.jsonl', lines('x'.repeat(100)));
    await tailer.poll(true);
    fs.rmSync(file('a/x.jsonl'));
    write('b/y.jsonl', 'x'.repeat(101)); // longer than the offset, same start, but the prefix hash differs (no line break)
    await tailer.poll(true);
    expect(tailer.stats.renames).toBe(0);
  });
});

describe('ordering and polling cadence', () => {
  it('delivers files that both have new data oldest first, so the newest file has the last word', async () => {
    const { tailer, got } = make();
    await tailer.poll(true);
    write('a/new.jsonl', lines('from-newer-file'), 2_000);
    write('a/old.jsonl', lines('from-older-file'), 1_000);
    await tailer.poll(true);
    expect(got).toEqual(['from-older-file', 'from-newer-file']);
  });

  it('breaks a modification-time tie by path so the order is stable', async () => {
    write('a.jsonl', 'from-a\n');
    write('b.jsonl', 'from-b\n');
    for (const order of [['a.jsonl', 'b.jsonl'], ['b.jsonl', 'a.jsonl']]) {
      fs.rmSync(cpFile, { force: true });
      let visible = false;
      const listing = async (): Promise<FileInfo[]> => (visible ? order.map((p) => ({ path: p, size: 7, mtimeMs: 5 })) : []);
      const { tailer, got } = make({ io: { ...nodeTailIo, list: listing } });
      await tailer.poll(true); // first scan sees nothing
      visible = true;
      await tailer.poll(true);
      expect(got).toEqual(['from-a', 'from-b']);
    }
  });

  it('between full scans only the newest files are checked', async () => {
    write('a/1.jsonl', lines('seed'), 100);
    write('a/2.jsonl', lines('seed'), 200);
    const { tailer, got } = make({ hotFiles: 1 });
    await tailer.poll(true); // baseline: the newest (2) is backfilled
    got.length = 0;

    append('a/2.jsonl', lines('hot'));
    append('a/1.jsonl', lines('cold'));
    await tailer.poll(false);
    expect(got).toEqual(['hot']); // the cold file is not looked at until the next full scan
    await tailer.poll(true);
    expect(got).toEqual(['hot', 'cold']);
  });

  it('a hot file that disappears makes the next run pass list the folder', async () => {
    write('a/1.jsonl', lines('seed'), 100);
    const { io, calls } = counted();
    const { tailer, got } = make({ io, scanMs: 1_000_000, pollMs: 1 });
    await tailer.poll(true);
    fs.renameSync(file('a/1.jsonl'), file('a/2.jsonl'));
    await tailer.poll(false); // the stat finds it gone
    const listed = calls.list;

    const controller = new AbortController();
    let sleeps = 0;
    const again = make({ io, scanMs: 1_000_000, sleep: async () => void (++sleeps === 1 && controller.abort()) });
    // a separate tailer sharing the checkpoint reads the renamed file without repeating its line
    await again.tailer.run(controller.signal);
    expect(calls.list).toBeGreaterThan(listed);
    expect(got.concat(again.got)).toEqual(['seed']);
  });

  it('run() lists the folder on the first pass and then every scan interval, polling the hot files in between', async () => {
    let clock = 0;
    const { io, calls } = counted();
    const controller = new AbortController();
    let sleeps = 0;
    const { tailer } = make({
      io,
      now: () => clock,
      scanMs: 100,
      pollMs: 30,
      sleep: async (ms) => {
        clock += ms;
        if (++sleeps === 5) controller.abort();
      },
    });
    write('a/x.jsonl', lines('seed'));
    await tailer.run(controller.signal);
    // passes at t = 0 (scan), 30, 60, 90 (hot), 120 (scan); the fifth sleep stops the loop
    expect(tailer.stats.scans).toBe(2);
    expect(calls.list).toBe(2);
    expect(calls.stat).toBe(3);
  });
});

describe('long and oversize lines', () => {
  it('reads a line longer than one chunk whole', async () => {
    const { tailer, got } = make({ chunkBytes: 32, maxLineBytes: 1024 });
    await tailer.poll(true);
    const long = 'L'.repeat(300);
    write('a/x.jsonl', lines('short', long, 'after'));
    await tailer.poll(true);
    expect(got).toEqual(['short', long, 'after']);
  });

  it('a long line that is still being written is waited for', async () => {
    const { tailer, got } = make({ chunkBytes: 32, maxLineBytes: 1024 });
    await tailer.poll(true);
    write('a/x.jsonl', 'P'.repeat(100));
    await tailer.poll(true);
    expect(got).toEqual([]);
    append('a/x.jsonl', `${'Q'.repeat(10)}\n`);
    await tailer.poll(true);
    expect(got).toEqual(['P'.repeat(100) + 'Q'.repeat(10)]);
  });

  it('skips a line beyond the limit, counts it, and reads the lines after it', async () => {
    const { tailer, got } = make({ chunkBytes: 32, maxLineBytes: 128 });
    await tailer.poll(true);
    write('a/x.jsonl', lines('before', 'Z'.repeat(400), 'after-1', 'after-2'));
    await tailer.poll(true);
    expect(tailer.stats.oversize).toBeGreaterThanOrEqual(1);
    expect(got[0]).toBe('before');
    expect(got.slice(-2)).toEqual(['after-1', 'after-2']);
    expect(got.every((l) => l === 'before' || l.startsWith('after') || /^Z+$/.test(l))).toBe(true); // only a fragment of the long line survives
  });
});

describe('consumer, back-pressure and errors', () => {
  it('waits for a slow consumer before reading further (back-pressure)', async () => {
    const { io, calls } = counted();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const seen: string[][] = [];
    const tailer = new Tailer({
      dir: logs,
      checkpointPath: cpFile,
      io,
      chunkBytes: 20,
      maxLineBytes: 200,
      onBatch: async (b) => {
        seen.push(b.lines);
        await gate;
      },
    });
    await tailer.poll(true);
    write('a/x.jsonl', lines(...Array.from({ length: 12 }, (_, i) => `line-number-${i}`)));
    const polling = tailer.poll(true);
    await new Promise((resolve) => setTimeout(resolve, 80));
    const readsWhileBlocked = calls.read;
    expect(seen).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(calls.read).toBe(readsWhileBlocked); // nothing was read ahead while the consumer was busy
    release();
    await polling;
    expect(seen.flat()).toEqual(Array.from({ length: 12 }, (_, i) => `line-number-${i}`));
  });

  it('calls onPollEnd after reading on every pass, and counts a failure in it without stopping', async () => {
    const order: string[] = [];
    let fail = true;
    const { tailer } = make({
      onBatch: (b) => void order.push(`batch:${b.lines.join(',')}`),
      onPollEnd: () => {
        order.push('end');
        if (fail) {
          fail = false;
          throw new Error('boom');
        }
      },
    });
    await tailer.poll(true);
    write('a/x.jsonl', lines('one'));
    await tailer.poll(true);
    await tailer.poll(false);
    expect(order).toEqual(['end', 'batch:one', 'end', 'end']);
    expect(tailer.stats.ioErrors).toBe(1);
  });

  it('a consumer that throws costs that batch only: it is counted, not retried, and the loop goes on', async () => {
    let first = true;
    const got: string[] = [];
    const tailer = new Tailer({
      dir: logs,
      checkpointPath: cpFile,
      chunkBytes: 16,
      onBatch: (b) => {
        if (first) {
          first = false;
          throw new Error('poison');
        }
        got.push(...b.lines);
      },
    });
    await tailer.poll(true);
    write('a/x.jsonl', lines('aaaaaaaa', 'bbbbbbbb', 'cccccccc', 'dddddddd'));
    await tailer.poll(true);
    expect(tailer.stats.consumerErrors).toBe(1);
    expect(got.length).toBeGreaterThan(0);
    await tailer.poll(true);
    expect(tailer.stats.consumerErrors).toBe(1); // not retried
  });

  it('a failing folder listing is counted and the next pass tries again', async () => {
    const failing = counted({ list: new Error('EACCES') });
    const { tailer } = make({ io: failing.io });
    await tailer.poll(true);
    await tailer.poll(true);
    expect(tailer.stats.ioErrors).toBe(2);
    expect(failing.calls.list).toBe(2);
  });

  it('a file that cannot be read is counted and the other files are still read', async () => {
    const { tailer, got } = make({
      io: {
        ...nodeTailIo,
        read: async (f, start, length) => {
          if (f.endsWith('bad.jsonl')) throw new Error('EIO');
          return nodeTailIo.read(f, start, length);
        },
      },
    });
    await tailer.poll(true);
    write('a/bad.jsonl', lines('lost'), 100);
    write('a/good.jsonl', lines('kept'), 200);
    await tailer.poll(true);
    expect(got).toEqual(['kept']);
    expect(tailer.stats.ioErrors).toBe(1);
  });

  it('a checkpoint that cannot be written is retried on the next pass', async () => {
    let fail = true;
    const { tailer } = make({
      io: {
        ...nodeTailIo,
        writeText: async (f, t) => {
          if (fail) throw new Error('ENOSPC');
          return nodeTailIo.writeText(f, t);
        },
      },
    });
    await tailer.poll(true);
    expect(tailer.stats.ioErrors).toBe(1);
    expect(fs.existsSync(cpFile)).toBe(false);
    fail = false;
    await tailer.poll(true);
    expect(fs.existsSync(cpFile)).toBe(true);
  });

  it('an unreadable checkpoint file is counted and treated as empty', async () => {
    const { tailer } = make({ io: { ...nodeTailIo, readText: async () => Promise.reject(new Error('EIO')) } });
    await tailer.poll(true);
    expect(tailer.stats.ioErrors).toBe(1);
    expect(tailer.stats.scans).toBe(1);
  });

  it('a chunk of only blank lines moves the position without a batch', async () => {
    const { tailer, got, batches } = make();
    await tailer.poll(true);
    write('a/x.jsonl', '\n\r\n\n');
    await tailer.poll(true);
    expect(batches).toEqual([]);
    expect(tailer.snapshot()[0].offset).toBe(4);
    append('a/x.jsonl', lines('real'));
    await tailer.poll(true);
    expect(got).toEqual(['real']);
  });

  it('a prefix read that comes back empty (the file was just truncated) leaves a checkpoint with no fingerprint', async () => {
    let dataReadDone = false;
    const { tailer, got } = make({
      io: {
        ...nodeTailIo,
        read: async (f, start, length) => {
          const answer = dataReadDone && start === 0 && length <= 256 ? Buffer.alloc(0) : await nodeTailIo.read(f, start, length);
          dataReadDone = true; // the first read is the data; the prefix read that follows it comes back empty
          return answer;
        },
      },
    });
    await tailer.poll(true);
    write('a/x.jsonl', lines('one', 'two'));
    await tailer.poll(true);
    expect(got).toEqual(['one', 'two']);
    expect(tailer.snapshot()[0]).toMatchObject({ offset: 8, fpLen: 0, fp: '' });
  });

  it('writes nothing when nothing changed', async () => {
    const { io, calls } = counted();
    const { tailer } = make({ io });
    await tailer.poll(true);
    const writes = calls.writeText;
    await tailer.poll(true);
    await tailer.poll(false);
    expect(calls.writeText).toBe(writes);
  });
});

describe('stop signal', () => {
  it('ends the loop; afterwards there is no listing, read, wait or timer', async () => {
    write('a/x.jsonl', lines('seed'));
    const { io, calls } = counted();
    const controller = new AbortController();
    let sleeps = 0;
    const { tailer } = make({
      io,
      sleep: async () => {
        if (++sleeps === 2) controller.abort();
      },
    });
    await tailer.run(controller.signal);
    expect(sleeps).toBe(2);
    const frozen = { ...calls };
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(calls).toEqual(frozen);
    expect(sleeps).toBe(2);
  });

  it('stops between chunks and keeps the checkpoint of what was delivered, so a restart loses and repeats nothing', async () => {
    const all = Array.from({ length: 30 }, (_, i) => `entry-${String(i).padStart(2, '0')}`);
    const controller = new AbortController();
    const delivered: string[] = [];
    const tailer = new Tailer({
      dir: logs,
      checkpointPath: cpFile,
      chunkBytes: 40,
      onBatch: (b) => {
        delivered.push(...b.lines);
        controller.abort();
      },
    });
    await tailer.poll(true);
    write('a/x.jsonl', lines(...all));
    await tailer.poll(true, controller.signal);
    expect(delivered.length).toBeGreaterThan(0);
    expect(delivered.length).toBeLessThan(all.length);
    expect(JSON.parse(fs.readFileSync(cpFile, 'utf8')).files[0].offset).toBeGreaterThan(0);

    const rest = make({ chunkBytes: 40 });
    await rest.tailer.poll(true);
    expect([...delivered, ...rest.got]).toEqual(all);
  });

  it('a signal that is already aborted does no work', async () => {
    write('a/x.jsonl', lines('seed'));
    const { io, calls } = counted();
    const controller = new AbortController();
    controller.abort();
    const { tailer } = make({ io });
    await tailer.run(controller.signal);
    expect(calls.list + calls.read + calls.stat).toBe(0);
  });

  it('the real wait ends at once on abort and does not leave a timer running', async () => {
    write('a/x.jsonl', lines('seed'));
    const controller = new AbortController();
    const { tailer } = make({ pollMs: 60_000 });
    const running = tailer.run(controller.signal);
    await new Promise((resolve) => setTimeout(resolve, 50));
    controller.abort();
    await expect(running).resolves.toBeUndefined();
  });

  it('the real wait returns by itself after pollMs', async () => {
    write('a/x.jsonl', lines('seed'));
    const controller = new AbortController();
    const { tailer, got } = make({ pollMs: 10 });
    const running = tailer.run(controller.signal);
    await new Promise((resolve) => setTimeout(resolve, 60));
    append('a/x.jsonl', lines('while running'));
    await new Promise((resolve) => setTimeout(resolve, 80));
    controller.abort();
    await running;
    expect(got).toEqual(['seed', 'while running']);
  });

  it('a stop that arrives during a pass ends run() without another wait', async () => {
    const controller = new AbortController();
    let sleeps = 0;
    const { tailer } = make({
      sleep: async () => void sleeps++,
      onBatch: () => controller.abort(),
    });
    write('a/x.jsonl', lines('seed'));
    await tailer.run(controller.signal);
    expect(sleeps).toBe(0);
  });

  it('a first scan that fails half way is finished by the next full scan; the passes in between skip files without a position', async () => {
    write('a/1.jsonl', lines('first'), 100);
    write('a/2.jsonl', lines('second'), 200);
    let failReads = 1;
    const { tailer, got } = make({
      io: {
        ...nodeTailIo,
        read: async (f, start, length) => {
          if (failReads-- > 0) throw new Error('EIO');
          return nodeTailIo.read(f, start, length);
        },
      },
    });
    await tailer.poll(true);
    expect(tailer.stats.ioErrors).toBe(1);
    await tailer.poll(false); // the newest file got its position before the failure; the other has none and is skipped
    expect(got).toEqual(['second']);
    await tailer.poll(true); // finishes the first scan: the old file starts at its end, nothing is repeated
    expect(got).toEqual(['second']);
    append('a/1.jsonl', lines('late'));
    await tailer.poll(true);
    expect(got).toEqual(['second', 'late']);
  });

  it('a stop in the middle of a pass leaves the files after the current one unread', async () => {
    const controller = new AbortController();
    const delivered: string[] = [];
    const tailer = new Tailer({
      dir: logs,
      checkpointPath: cpFile,
      onBatch: (b) => {
        delivered.push(...b.lines);
        controller.abort();
      },
    });
    await tailer.poll(true);
    write('a/1.jsonl', lines('older'), 100);
    write('a/2.jsonl', lines('newer'), 200);
    await tailer.poll(true, controller.signal);
    expect(delivered).toEqual(['older']);
    const rest = make();
    await rest.tailer.poll(true);
    expect(rest.got).toEqual(['newer']);
  });
});

describe('bounded memory', () => {
  it('reads a 20,000-line file in chunks, every line once, never more than a chunk at a time', async () => {
    const chunkBytes = 64 * 1024;
    const { tailer, got, batches } = make({ chunkBytes });
    await tailer.poll(true);
    const total = 20_000;
    const body = Array.from({ length: total }, (_, i) => `{"n":${i},"pad":"${'p'.repeat(150)}"}`).join('\n') + '\n';
    expect(body.length).toBeGreaterThan(3_000_000);
    write('a/big.jsonl', body);
    await tailer.poll(true);
    expect(got).toHaveLength(total);
    expect(JSON.parse(got[total - 1]).n).toBe(total - 1);
    expect(batches.length).toBeGreaterThan(40);
    const biggest = Math.max(...batches.map((b) => b.lines.join('\n').length + 1));
    expect(biggest).toBeLessThanOrEqual(chunkBytes);
  });
});

describe('nodeTailIo', () => {
  it('stat answers undefined for a missing file and readText likewise', async () => {
    expect(await nodeTailIo.stat(file('nope.jsonl'))).toBeUndefined();
    expect(await nodeTailIo.readText(file('nope.json'))).toBeUndefined();
  });

  it('stat and read return the size and the requested range, and read stops at the end of the file', async () => {
    write('r.jsonl', '0123456789');
    expect((await nodeTailIo.stat(file('r.jsonl')))?.size).toBe(10);
    expect((await nodeTailIo.read(file('r.jsonl'), 3, 4)).toString()).toBe('3456');
    expect((await nodeTailIo.read(file('r.jsonl'), 8, 50)).toString()).toBe('89');
  });

  it('writeText replaces the file whole and leaves no temporary file behind', async () => {
    const target = path.join(root, 'out', 'cp.json');
    await nodeTailIo.writeText(target, 'one');
    await nodeTailIo.writeText(target, 'two');
    expect(fs.readFileSync(target, 'utf8')).toBe('two');
    expect(fs.readdirSync(path.dirname(target))).toEqual(['cp.json']);
  });

  it('propagates an error that is not "missing"', async () => {
    // A NUL in a path is rejected by Node itself (not ENOENT), on every platform.
    await expect(nodeTailIo.stat('bad\0path')).rejects.toBeDefined();
    await expect(nodeTailIo.readText(logs)).rejects.toBeDefined(); // a directory, not a file
    await expect(nodeTailIo.list('bad\0dir')).rejects.toBeDefined();
  });

  it('list reports a stat failure that is not "missing"', async () => {
    write('x.jsonl', 'x\n');
    const spy = jest.spyOn(fs.promises, 'stat').mockRejectedValue(Object.assign(new Error('io'), { code: 'EIO' }));
    try {
      await expect(nodeTailIo.list(logs)).rejects.toMatchObject({ code: 'EIO' });
    } finally {
      spy.mockRestore();
    }
  });

  it('list skips a file that disappears between the directory read and its stat', async () => {
    write('gone.jsonl', 'x\n');
    write('stays.jsonl', 'x\n');
    const original = fs.promises.stat;
    const spy = jest.spyOn(fs.promises, 'stat').mockImplementation(async (p, ...rest) => {
      if (String(p).endsWith('gone.jsonl')) throw Object.assign(new Error('gone'), { code: 'ENOENT' });
      return (original as (...a: unknown[]) => Promise<fs.Stats>)(p, ...rest);
    });
    try {
      const listed = await nodeTailIo.list(logs);
      expect(listed.map((f) => f.path)).toEqual(['stays.jsonl']);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('pause and resume (Copilot switched off and on)', () => {
  it('a paused tailer does nothing at all: it lists, reads and delivers nothing, and creates no checkpoint file', async () => {
    const counts = counted();
    write('2026/11/05/a.jsonl', lines('old'));
    const { tailer, got } = make({ io: counts.io });
    tailer.setPaused(true);
    expect(tailer.isPaused).toBe(true);
    await tailer.poll(true);
    write('2026/11/05/b.jsonl', lines('new file'));
    await tailer.poll(true);
    expect(got).toEqual([]);
    expect(counts.calls).toEqual({ list: 0, stat: 0, read: 0, readText: 0, writeText: 0 });
    expect(fs.existsSync(cpFile)).toBe(false);
    expect(tailer.stats.scans).toBe(0);
  });

  it('resuming skips what was written while paused and delivers only what comes after', async () => {
    write('2026/11/05/a.jsonl', lines('before the first pass'), 100);
    const { tailer, got } = make();
    tailer.setPaused(true);
    await tailer.poll(true);
    append('2026/11/05/a.jsonl', lines('written while paused'));

    tailer.setPaused(false);
    expect(tailer.isPaused).toBe(false);
    await tailer.poll(false); // the first pass after a resume scans by itself, and moves every file to its end
    expect(got).toEqual([]);
    append('2026/11/05/a.jsonl', lines('after the resume'));
    await tailer.poll(false);
    expect(got).toEqual(['after the resume']);
    expect(tailer.snapshot()[0].offset).toBe(fs.statSync(file('2026/11/05/a.jsonl')).size);
  });

  it('even the backfill of a first scan is skipped after a resume, and a file created while paused is read from its start only when it appears after the resume', async () => {
    write('2026/11/05/a.jsonl', lines('x'.repeat(50), 'tail line'), 100);
    const { tailer, got } = make({ backfillBytes: 1024 });
    tailer.setPaused(true);
    tailer.setPaused(false); // never paused for a pass: still counts as a resume
    await tailer.poll(true);
    expect(got).toEqual([]); // a normal first scan would backfill both lines
    write('2026/11/06/b.jsonl', lines('fresh file'), 200);
    await tailer.poll(true);
    expect(got).toEqual(['fresh file']);
  });

  it('a file created while paused is skipped as it was found by the resume scan, not replayed', async () => {
    const { tailer, got } = make();
    await tailer.poll(true); // baselined with nothing in the folder
    tailer.setPaused(true);
    write('2026/11/05/c.jsonl', lines('created while paused'));
    tailer.setPaused(false);
    await tailer.poll(false);
    expect(got).toEqual([]);
    append('2026/11/05/c.jsonl', lines('then this'));
    await tailer.poll(false);
    expect(got).toEqual(['then this']);
  });

  it('setting the state it already has changes nothing, and pause then resume then pause again works', async () => {
    write('2026/11/05/a.jsonl', lines('a'), 100);
    const { tailer, got } = make();
    tailer.setPaused(false); // already running: no skip is scheduled
    await tailer.poll(true);
    append('2026/11/05/a.jsonl', lines('one'));
    await tailer.poll(false);
    expect(got).toEqual(['a', 'one']); // the first scan backfilled the newest file; nothing was skipped

    tailer.setPaused(true);
    tailer.setPaused(true);
    append('2026/11/05/a.jsonl', lines('while paused'));
    await tailer.poll(false);
    tailer.setPaused(false);
    await tailer.poll(false);
    append('2026/11/05/a.jsonl', lines('two'));
    await tailer.poll(false);
    expect(got).toEqual(['a', 'one', 'two']);
  });

  it('saves the new positions, so a restart does not read what the pause skipped', async () => {
    write('2026/11/05/a.jsonl', lines('a'), 100);
    const first = make();
    await first.tailer.poll(true);
    first.tailer.setPaused(true);
    append('2026/11/05/a.jsonl', lines('skipped'));
    first.tailer.setPaused(false);
    await first.tailer.poll(false);
    const second = make();
    await second.tailer.poll(true);
    expect(second.got).toEqual([]);
  });

  it('a pause in the middle of a pass stops it between batches: the rest of the file is not read, and the resume skips it', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const seen: string[][] = [];
    const tailer = new Tailer({
      dir: logs,
      checkpointPath: cpFile,
      chunkBytes: 20,
      maxLineBytes: 200,
      onBatch: async (b) => {
        seen.push(b.lines);
        await gate;
      },
    });
    await tailer.poll(true);
    write('a/x.jsonl', lines(...Array.from({ length: 12 }, (_, i) => `line-number-${i}`)));
    const polling = tailer.poll(true);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(seen).toHaveLength(1);
    tailer.setPaused(true);
    release();
    await polling;
    expect(seen).toHaveLength(1); // the batch in hand was finished, nothing after it was read
    tailer.setPaused(false);
    await tailer.poll(false);
    expect(seen).toHaveLength(1); // and the unread rest is skipped, not learned late
    append('a/x.jsonl', lines('after'));
    await tailer.poll(false);
    expect(seen.flat().at(-1)).toBe('after');
  });

  it('run() idles while paused and starts reading after the resume', async () => {
    write('2026/11/05/a.jsonl', lines('a'), 100);
    const { tailer, got } = make({ pollMs: 5, scanMs: 5 });
    tailer.setPaused(true);
    const stop = new AbortController();
    const running = tailer.run(stop.signal);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(tailer.stats.scans).toBe(0);
    tailer.setPaused(false);
    await new Promise((resolve) => setTimeout(resolve, 40));
    append('2026/11/05/a.jsonl', lines('after'));
    for (let i = 0; i < 100 && got.length === 0; i++) await new Promise((resolve) => setTimeout(resolve, 10));
    stop.abort();
    await running;
    expect(got).toEqual(['after']);
  });
});

describe('a resume in the middle of a connection learns the session, and only the session', () => {
  const rec = (type: string, payload: unknown, second: number): string =>
    JSON.stringify({ type, subtype: '', level: 'info', timestamp: new Date(Date.UTC(2026, 10, 14, 13, 0, second)).toISOString(), payload });
  const connect = (second: number, host = 'dsl-mud.org'): string => rec('game:remote-server:connect', { host, port: 4000 }, second);
  const closed = (second: number): string => rec('game:server:connection:client-closed', { code: 1000 }, second);
  const gmcp = (data: string, second: number): string => rec('game:remote-server:gmcp', { type: 'gmcp', data }, second);
  const login = (name: string, second: number): string => gmcp(`login_data {"name": "${name}", "level": 25}`, second);
  const room = (name: string, second: number): string => gmcp(`room_data {"room": "${name}", "sector": "inside", "exits": ["N"]}`, second);
  const char = (hp: number, second: number): string => gmcp(`char_data {"hp": ${hp}, "max_hp": 100, "mana": 5, "max_mana": 5, "move": 9, "max_move": 9}`, second);
  const text = (data: string, second: number): string => rec('game:remote-server:raw', { type: 'raw', data }, second);
  const input = (command: string, second: number): string => rec('game:client:input', JSON.stringify({ type: 'data', data: command }), second);
  const started = (second: number): string => rec('[game-server] Listening on port', { port: 31000 }, second);

  /** A tailer that was switched on once, switched off, and is now switched on again over `content` (already in the file). */
  async function resumeOver(content: string[], extra: Partial<TailerOptions> = {}): Promise<ReturnType<typeof make>> {
    write('2026/11/14/a.jsonl', lines(...content), 100);
    const made = make(extra);
    made.tailer.setPaused(true);
    await made.tailer.poll(true);
    made.tailer.setPaused(false);
    await made.tailer.poll(false);
    return made;
  }

  it('delivers the open connection, its login, and the latest room and vitals, but no game text and no command', async () => {
    const { got } = await resumeOver([
      text('old text\r\n', 1),
      connect(2),
      login('Tester', 3),
      text('secret room description\r\n', 4),
      room('Hall', 5),
      char(90, 6),
      input('north', 7),
      room('Chamber', 8),
      char(80, 9),
      text('more secret text\r\n', 10),
    ]);
    expect(got).toEqual([connect(2), login('Tester', 3), room('Chamber', 8), char(80, 9)]);
  });

  it('after the priming the tailer carries on as before: only what is written next is delivered', async () => {
    const { tailer, got } = await resumeOver([connect(2), login('Tester', 3)]);
    got.length = 0;
    append('2026/11/14/a.jsonl', lines(text('new\r\n', 20)));
    await tailer.poll(false);
    expect(got).toEqual([text('new\r\n', 20)]);
    expect(tailer.snapshot()[0].offset).toBe(fs.statSync(file('2026/11/14/a.jsonl')).size);
  });

  it('delivers only the close when the newest connection record is a close (a later reconnect is read live)', async () => {
    const { got } = await resumeOver([connect(1), login('Tester', 2), room('Hall', 3), closed(4)]);
    expect(got).toEqual([closed(4)]);
  });

  it('ignores a session that ended before a newer one: only the newest connect and what followed it', async () => {
    const { got } = await resumeOver([connect(1, 'old.example'), login('Old', 2), room('Old room', 3), closed(4), connect(5), room('New room', 6)]);
    expect(got).toEqual([connect(5), room('New room', 6)]);
  });

  it('delivers nothing when the game-server restarted after the last connect (the connection did not survive)', async () => {
    const { got } = await resumeOver([connect(1), login('Tester', 2), started(3), text('boot\r\n', 4)]);
    expect(got).toEqual([]);
  });

  it('delivers nothing when the logs hold no connection record, or only the start-up ones', async () => {
    const { got } = await resumeOver([text('only text\r\n', 1), room('Hall', 2), started(3)]);
    expect(got).toEqual([]);
  });

  it('finds the connection in an older file when the newest file has only game text (the log rolled over)', async () => {
    write('2026/11/13/old.jsonl', lines(connect(1), login('Tester', 2), room('Hall', 3)), 50);
    write('2026/11/14/new.jsonl', lines(text('after midnight\r\n', 4)), 100);
    const made = make();
    made.tailer.setPaused(true);
    await made.tailer.poll(true);
    made.tailer.setPaused(false);
    await made.tailer.poll(false);
    expect(made.got).toEqual([connect(1), login('Tester', 2), room('Hall', 3)]);
    expect(made.batches[0].file).toBe('2026/11/13/old.jsonl');
  });

  it('reads backwards across chunk boundaries and hands over the lines whole', async () => {
    const filler = Array.from({ length: 30 }, (_, i) => text(`filler line ${i} ${'x'.repeat(40)}\r\n`, 10 + i));
    const { got } = await resumeOver([connect(1), login('Tester', 2), ...filler, room('Hall', 50), char(77, 51)], { chunkBytes: 100, maxLineBytes: 4096, primeBytes: 1_000_000 });
    expect(got).toEqual([connect(1), login('Tester', 2), room('Hall', 50), char(77, 51)]);
  });

  it('stops looking after primeBytes: a connection further back than that is not found', async () => {
    const filler = Array.from({ length: 30 }, (_, i) => text(`filler line ${i} ${'x'.repeat(40)}\r\n`, 10 + i));
    const { got } = await resumeOver([connect(1), login('Tester', 2), ...filler], { chunkBytes: 100, primeBytes: 500 });
    expect(got).toEqual([]);
  });

  it('drops a line longer than maxLineBytes instead of carrying it, and still finds the connection before it', async () => {
    const { got } = await resumeOver([connect(1), login('Tester', 2), text('y'.repeat(900), 3), room('Hall', 4)], { chunkBytes: 100, maxLineBytes: 200, primeBytes: 1_000_000 });
    expect(got).toEqual([connect(1), login('Tester', 2), room('Hall', 4)]);
  });

  it('reads CRLF line endings and skips blank lines', async () => {
    write('2026/11/14/a.jsonl', `${connect(1)}\r\n\r\n${login('Tester', 2)}\r\n\n`, 100);
    const { tailer, got } = make();
    tailer.setPaused(true);
    await tailer.poll(true);
    tailer.setPaused(false);
    await tailer.poll(false);
    expect(got).toEqual([connect(1), login('Tester', 2)]);
  });

  it('does not open an older file once primeBytes is used up by a newer one', async () => {
    write('2026/11/13/old.jsonl', lines(connect(1), login('Tester', 2)), 50);
    const newest = lines(text('after midnight\r\n', 4));
    write('2026/11/14/new.jsonl', newest, 100);
    const { tailer, got } = make({ primeBytes: Buffer.byteLength(newest) });
    tailer.setPaused(true);
    await tailer.poll(true);
    tailer.setPaused(false);
    await tailer.poll(false);
    expect(got).toEqual([]);
  });

  it('a consumer that throws on the primed batch is counted, and the resume still completes', async () => {
    write('2026/11/14/a.jsonl', lines(connect(1), login('Tester', 2)), 100);
    const tailer = new Tailer({
      dir: logs,
      checkpointPath: cpFile,
      onBatch: () => {
        throw new Error('consumer failed');
      },
    });
    tailer.setPaused(true);
    await tailer.poll(true);
    tailer.setPaused(false);
    await tailer.poll(false);
    expect(tailer.stats.consumerErrors).toBe(1);
    expect(tailer.stats.ioErrors).toBe(0);
    expect(tailer.snapshot()[0].offset).toBe(fs.statSync(file('2026/11/14/a.jsonl')).size);
  });
});
