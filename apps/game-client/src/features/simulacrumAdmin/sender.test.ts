import { DispatchEvent, ListenEvent } from '../event-emitter/event-dispatcher';
import { createActivityLog, type ActivityLog } from './activityLog';
import { createReplyCollector, type ReplyCollector } from './replyCollector';
import { createSender, type Sender } from './sender';

const raw = (payload: string): void => DispatchEvent('game:remote-server:raw', { type: 'raw', receivedTimestamp: 'x', payload } as never);
/** Lets queued promise callbacks run without moving the fake clock. */
const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

let active: boolean;
let collector: ReplyCollector;
let activity: ActivityLog;
let sent: string[];
let sender: Sender;
const confirmYes = jest.fn(() => true);

beforeEach(() => {
  jest.useFakeTimers();
  active = true;
  sent = [];
  confirmYes.mockClear();
  collector = createReplyCollector();
  activity = createActivityLog();
  sender = createSender({
    isActive: () => active,
    collector,
    activity,
    dispatch: (cmd) => sent.push(cmd),
    now: () => '2026-11-07T10:00:00.000Z',
  });
});
afterEach(() => {
  collector.dispose();
  jest.useRealTimers();
});

/** Runs a command, lets the game answer with `reply` and returns the outcome. */
async function runAndAnswer(
  run: () => ReturnType<Sender['run']>,
  reply: string,
): Promise<Awaited<ReturnType<Sender['run']>>> {
  const pending = run();
  await flush();
  if (reply) raw(reply);
  jest.advanceTimersByTime(600);
  return pending;
}

describe('sender.run: what is sent', () => {
  it('sends the exact built line, waits for the reply and records a verdict from the game (ADMIN-03)', async () => {
    const outcome = await runAndAnswer(() => sender.run('stat', 'char', { target: 'Testchar' }), 'Name: Testchar\n\rLevel: 5\n\r');
    expect(sent).toEqual(['stat Testchar']);
    expect(outcome).toEqual({
      status: 'sent',
      entry: expect.objectContaining({
        line: 'stat Testchar',
        at: '2026-11-07T10:00:00.000Z',
        verdict: 'accepted',
        reason: 'Name: Testchar',
        replyLines: ['Name: Testchar', 'Level: 5'],
        rawReply: 'Name: Testchar\n\rLevel: 5\n\r',
      }),
    });
    expect(activity.getEntries()).toHaveLength(1);
  });

  it('leaves the game prompt out of the reply lines and keeps it in the raw text', async () => {
    const reply = 'Name: Testchar\n\r<60hp 100m 100mv> ';
    const outcome = await runAndAnswer(() => sender.run('stat', 'char', { target: 'Testchar' }), reply);
    expect(outcome.status === 'sent' && outcome.entry.replyLines).toEqual(['Name: Testchar']);
    expect(outcome.status === 'sent' && outcome.entry.rawReply).toBe(reply);
  });

  it('records a refusal as refused and not as done (E7)', async () => {
    const outcome = await runAndAnswer(() => sender.run('stat', 'char', { target: 'Testchar' }), 'Huh?\n\r');
    expect(outcome.status === 'sent' && outcome.entry.verdict).toBe('refused');
  });

  it("records the game's own refusal of a good-looking command", async () => {
    const outcome = await runAndAnswer(() => sender.run('goto', 'run', { where: '99999' }), 'No such location.\n\r');
    expect(outcome.status === 'sent' && outcome.entry).toEqual(expect.objectContaining({ verdict: 'refused', reason: 'No such location.' }));
  });

  it('records unknown, without a reason, when the game says nothing', async () => {
    const pending = sender.run('holylight', 'run', {});
    await flush();
    jest.advanceTimersByTime(4000);
    const outcome = await pending;
    expect(outcome.status === 'sent' && outcome.entry).toEqual(expect.objectContaining({ verdict: 'unknown', replyLines: [] }));
    expect(outcome.status === 'sent' && 'reason' in outcome.entry).toBe(false);
  });

  it('uses a form without its own success lines the command-level lines, or none', async () => {
    const outcome = await runAndAnswer(() => sender.run('copyover', 'run', {}, { confirm: confirmYes }), 'The world shakes.\n\r');
    expect(outcome.status === 'sent' && outcome.entry.verdict).toBe('unknown');
    expect(sent).toEqual(['copyover confirm']);
  });
});

describe('sender.run: what is not sent', () => {
  it('sends nothing when not connected to the simulacrum (E3)', async () => {
    active = false;
    await expect(sender.run('stat', 'char', { target: 'Testchar' })).resolves.toEqual({ status: 'inactive' });
    expect(sent).toEqual([]);
    expect(activity.getEntries()).toEqual([]);
  });

  it('sends nothing when the connection ended while the send waited its turn', async () => {
    const first = sender.run('stat', 'char', { target: 'One' });
    const second = sender.run('stat', 'char', { target: 'Two' });
    await flush();
    active = false;
    raw('Name: One\n\r');
    jest.advanceTimersByTime(600);
    await first;
    await expect(second).resolves.toEqual({ status: 'inactive' });
    expect(sent).toEqual(['stat One']);
  });

  it('keeps nothing of a reply when the connection ended while it was being collected', async () => {
    const pending = sender.run('stat', 'char', { target: 'Testchar' });
    await flush();
    raw('Name: Testchar\n\r');
    active = false;
    collector.cancel();
    await expect(pending).resolves.toEqual({ status: 'inactive' });
    expect(activity.getEntries()).toEqual([]);
  });

  it('reports a bad value with the field and sends nothing', async () => {
    const outcome = await sender.run('stat', 'char', { target: 'Test char' });
    expect(outcome).toEqual({ status: 'invalid', error: { field: 'target', message: 'One word only, no spaces.' } });
    expect(sent).toEqual([]);
  });

  it('reports an unknown command or form', async () => {
    expect(await sender.run('nonesuch', 'run', {})).toEqual({
      status: 'invalid',
      error: { field: 'line', message: 'Unknown command form: nonesuch run.' },
    });
    expect((await sender.run('stat', 'nope', {})).status).toBe('invalid');
    expect(sent).toEqual([]);
  });

  it('never sends a hidden abbreviation', async () => {
    expect((await sender.run('reboo', 'run', {})).status).toBe('invalid');
    expect((await sender.run('shutdow', 'run', {})).status).toBe('invalid');
    expect(sent).toEqual([]);
  });
});

describe('sender.run: confirmation (E21, E25)', () => {
  it('sends nothing until the owner confirms, then sends once', async () => {
    let answer: (v: boolean) => void = () => {};
    const confirm = jest.fn(() => new Promise<boolean>((resolve) => (answer = resolve)));
    const pending = sender.run('freeze', 'run', { target: 'Testchar' }, { confirm });
    await flush();
    expect(confirm).toHaveBeenCalledWith({
      command: 'freeze',
      line: 'freeze Testchar',
      scope: '"freeze" changes a player or the server and cannot be undone from this panel.',
    });
    expect(sent).toEqual([]);
    answer(true);
    await flush();
    raw('FREEZE set.\n\r');
    jest.advanceTimersByTime(600);
    const outcome = await pending;
    expect(sent).toEqual(['freeze Testchar']);
    expect(outcome.status === 'sent' && outcome.entry.verdict).toBe('accepted');
  });

  it('sends nothing when the owner declines, and nothing is logged', async () => {
    await expect(sender.run('freeze', 'run', { target: 'Testchar' }, { confirm: () => false })).resolves.toEqual({ status: 'declined' });
    expect(sent).toEqual([]);
    expect(activity.getEntries()).toEqual([]);
  });

  it('sends nothing when a confirmation is needed and no callback was given', async () => {
    await expect(sender.run('copyover', 'run', {})).resolves.toEqual({ status: 'declined' });
    expect(sent).toEqual([]);
  });

  it('asks for `transfer all` and not for `transfer <name>`', async () => {
    const confirm = jest.fn(() => false);
    await sender.run('transfer', 'run', { target: 'all', where: '3001' }, { confirm });
    expect(confirm).toHaveBeenCalledTimes(1);
    const none = jest.fn();
    await runAndAnswer(() => sender.run('transfer', 'run', { target: 'Testchar', where: '3001' }, { confirm: none }), 'Ok.\n\r');
    expect(none).not.toHaveBeenCalled();
    expect(sent).toEqual(['transfer Testchar 3001']);
  });

  it('sends the bare word for the copyover explanation and the confirm word only after confirmation (E25)', async () => {
    await runAndAnswer(() => sender.run('copyover', 'info', {}), "Type 'copyover confirm' to proceed.\n\r");
    expect(sent).toEqual(['copyover']);
    await runAndAnswer(() => sender.run('copyover', 'run', {}, { confirm: confirmYes }), 'Copyover.\n\r');
    expect(sent).toEqual(['copyover', 'copyover confirm']);
    expect(confirmYes).toHaveBeenCalledTimes(1);
  });
});

describe('sender.run: one at a time (E24)', () => {
  it('holds the second send until the first reply is complete, so replies are never mixed', async () => {
    const first = sender.run('stat', 'char', { target: 'One' });
    const second = sender.run('stat', 'char', { target: 'Two' });
    await flush();
    expect(sent).toEqual(['stat One']);
    raw('Name: One\n\r');
    jest.advanceTimersByTime(600);
    await flush();
    expect(sent).toEqual(['stat One', 'stat Two']);
    raw('Name: Two\n\r');
    jest.advanceTimersByTime(600);
    const [a, b] = await Promise.all([first, second]);
    expect(a.status === 'sent' && a.entry.replyLines).toEqual(['Name: One']);
    expect(b.status === 'sent' && b.entry.replyLines).toEqual(['Name: Two']);
  });
});

describe('sender.run: a send that fails', () => {
  it('rejects, frees the collector and lets the next send go through', async () => {
    let fail = true;
    const flaky = createSender({
      isActive: () => true,
      collector,
      activity,
      dispatch: (cmd) => {
        if (fail) throw new Error('socket gone');
        sent.push(cmd);
      },
    });
    await expect(flaky.run('stat', 'char', { target: 'One' })).rejects.toThrow('socket gone');
    fail = false;
    const next = flaky.run('stat', 'char', { target: 'Two' });
    await flush();
    raw('Name: Two\n\r');
    jest.advanceTimersByTime(600);
    expect((await next).status).toBe('sent');
    expect(sent).toEqual(['stat Two']);
  });
});

describe('the dispatched event (S6, E5)', () => {
  it('goes out as shatteredarchive:send-command with the exact line, which the connection bridge writes unchanged', async () => {
    const seen: string[] = [];
    const stop = ListenEvent<{ cmd: string }>('shatteredarchive:send-command', (p) => seen.push(p.cmd), { key: 'sender-test' });
    const real = createSender({ isActive: () => true, collector, activity });
    const pending = real.run('areload', 'run', { file: 'midgaard.are' }, { confirm: confirmYes });
    await flush();
    raw('Reloaded midgaard.are in place: rooms 1 upd/0 new\n\r');
    jest.advanceTimersByTime(600);
    const outcome = await pending;
    stop();
    expect(seen).toEqual(['areload midgaard.are']);
    expect(outcome.status === 'sent' && outcome.entry.verdict).toBe('accepted');
  });
});

describe('sender.refreshAvailable (S5, E7)', () => {
  const answerWizhelp = async (reply: string) => {
    const pending = sender.refreshAvailable();
    await flush();
    if (reply) raw(reply);
    jest.advanceTimersByTime(reply ? 600 : 4000);
    return pending;
  };

  it('sends wizhelp, parses a six-column reply and keeps the names', async () => {
    const listener = jest.fn();
    sender.subscribe(listener);
    const result = await answerWizhelp(
      'admin       gmcp        goto        holylight   incognito   memory      \n\rstat        transfer    wizhelp     wiznet      \n\r<20hp 100m 100mv> ',
    );
    expect(sent).toEqual(['wizhelp']);
    expect(result.verdict).toBe('accepted');
    expect(result.names).toEqual(['admin', 'gmcp', 'goto', 'holylight', 'incognito', 'memory', 'stat', 'transfer', 'wizhelp', 'wiznet']);
    expect(sender.getAvailable()).toEqual(new Set(result.names));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('a mortal character that gets Huh? can run none: the list is empty, not unknown', async () => {
    const result = await answerWizhelp('Huh?\n\r');
    expect(result).toEqual({ verdict: 'refused', names: [] });
    expect(sender.getAvailable()).toEqual(new Set());
  });

  it('keeps the previous list when the game says nothing, and reports unknown', async () => {
    await answerWizhelp('stat        goto        \n\r');
    const before = sender.getAvailable();
    const result = await answerWizhelp('');
    expect(result).toEqual({ verdict: 'unknown', names: [] });
    expect(sender.getAvailable()).toBe(before);
  });

  it('sends nothing and reports unknown when not connected', async () => {
    active = false;
    await expect(sender.refreshAvailable()).resolves.toEqual({ verdict: 'unknown', names: [] });
    expect(sent).toEqual([]);
  });

  it('forgets the list on clearAvailable, telling subscribers once, and is quiet when there is none', async () => {
    const listener = jest.fn();
    sender.clearAvailable();
    sender.subscribe(listener);
    await answerWizhelp('stat        \n\r');
    listener.mockClear();
    sender.clearAvailable();
    expect(sender.getAvailable()).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(1);
    sender.clearAvailable();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('stops notifying an unsubscribed listener', async () => {
    const listener = jest.fn();
    sender.subscribe(listener)();
    await answerWizhelp('stat        \n\r');
    expect(listener).not.toHaveBeenCalled();
  });
});
