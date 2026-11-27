import { DispatchEvent, ListenEvent } from '../event-emitter/event-dispatcher';
import { createReplyCollector, toDisplayText, toLines, type ReplyCollector } from './replyCollector';

const raw = (payload: unknown): void => DispatchEvent('game:remote-server:raw', { type: 'raw', receivedTimestamp: 'x', payload } as never);

let collector: ReplyCollector;
beforeEach(() => {
  jest.useFakeTimers();
  collector = createReplyCollector();
});
afterEach(() => {
  collector.dispose();
  jest.useRealTimers();
});

describe('toDisplayText / toLines (E22)', () => {
  it('removes colour escapes, other escapes and {x codes, and keeps {{ as {', () => {
    expect(toDisplayText('\u001b[1;31mRed\u001b[0m {RBold{x {{literal}')).toBe('Red Bold {literal}');
    expect(toDisplayText('a\u001b]0;title\u0007b\u001b]8;;x\u001b\\c')).toBe('abc');
    expect(toDisplayText('a\u001bMb\u0001c\u007fd')).toBe('abcd');
  });

  it('splits on the game newline and plain newlines, trims line ends and drops blank edges', () => {
    expect(toLines('\n\r\n\rOk.  \n\rTwo\r\n\n\r')).toEqual(['Ok.', 'Two']);
    expect(toLines('a\r\n\r\nb')).toEqual(['a', '', 'b']);
    expect(toLines('')).toEqual([]);
  });
});

describe('the reply collector (E6, E22)', () => {
  it('joins chunks and ends 600 ms after the last one', async () => {
    const done = collector.begin();
    raw('They aren');
    jest.advanceTimersByTime(500);
    raw("'t here.\n\r");
    jest.advanceTimersByTime(599);
    let settled = false;
    void done.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    jest.advanceTimersByTime(1);
    await expect(done).resolves.toEqual({ lines: ["They aren't here."], rawText: "They aren't here.\n\r", endedBy: 'quiet' });
  });

  it('removes an escape sequence that was split across two chunks, and keeps the raw text', async () => {
    const done = collector.begin();
    raw('\u001b[3');
    raw('1mOk.\u001b[0m\n\r');
    jest.advanceTimersByTime(600);
    const reply = await done;
    expect(reply.lines).toEqual(['Ok.']);
    expect(reply.rawText).toBe('\u001b[31mOk.\u001b[0m\n\r');
  });

  it('does not attribute a line that arrives after the quiet period to the finished reply', async () => {
    const done = collector.begin();
    raw('Ok.\n\r');
    jest.advanceTimersByTime(600);
    const reply = await done;
    raw('Someone tells you, "hi"\n\r');
    jest.advanceTimersByTime(5000);
    expect(reply.lines).toEqual(['Ok.']);
    const next = collector.begin();
    jest.advanceTimersByTime(4000);
    expect((await next).lines).toEqual([]);
  });

  it('ignores text that arrives while no command is waiting', async () => {
    raw('before any send\n\r');
    const done = collector.begin();
    raw('Ok.\n\r');
    jest.advanceTimersByTime(600);
    expect((await done).lines).toEqual(['Ok.']);
  });

  it('ends at 4 s with an empty reply when nothing arrives', async () => {
    const done = collector.begin();
    jest.advanceTimersByTime(3999);
    let settled = false;
    void done.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    jest.advanceTimersByTime(1);
    await expect(done).resolves.toEqual({ lines: [], rawText: '', endedBy: 'timeout' });
  });

  it('cuts a reply that keeps arriving at 4 s', async () => {
    const done = collector.begin();
    for (let i = 0; i < 10; i++) {
      raw(`line ${i}\n\r`);
      jest.advanceTimersByTime(500);
    }
    const reply = await done;
    expect(reply.endedBy).toBe('timeout');
    expect(reply.lines.length).toBeLessThan(10);
    expect(reply.lines[0]).toBe('line 0');
  });

  it('ignores a payload that is not text', async () => {
    const done = collector.begin();
    raw(undefined);
    raw({ not: 'text' });
    jest.advanceTimersByTime(4000);
    expect((await done).rawText).toBe('');
  });

  it('refuses a second collection while one runs', async () => {
    const first = collector.begin();
    await expect(collector.begin()).rejects.toThrow('already being collected');
    jest.advanceTimersByTime(4000);
    await first;
  });

  it('cancel ends a running collection with what arrived, and does nothing when idle', async () => {
    collector.cancel();
    const done = collector.begin();
    raw('partial\n\r');
    collector.cancel();
    await expect(done).resolves.toEqual({ lines: ['partial'], rawText: 'partial\n\r', endedBy: 'cancelled' });
  });

  it('dispose cancels a running collection and stops listening', async () => {
    const done = collector.begin();
    collector.dispose();
    expect((await done).endedBy).toBe('cancelled');
    const other = createReplyCollector();
    const next = other.begin();
    raw('seen by the new one\n\r');
    jest.advanceTimersByTime(600);
    expect((await next).lines).toEqual(['seen by the new one']);
    other.dispose();
  });

  it('does not replace a listener the app registered for the same event (E26)', async () => {
    const app = jest.fn();
    const stop = ListenEvent('game:remote-server:raw', app);
    const done = collector.begin();
    raw('Ok.\n\r');
    jest.advanceTimersByTime(600);
    await done;
    expect(app).toHaveBeenCalledTimes(1);
    stop();
  });
});
