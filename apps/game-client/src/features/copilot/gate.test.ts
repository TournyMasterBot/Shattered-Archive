import { DispatchEvent, ListenEvent } from '../event-emitter/event-dispatcher';
import { createCommandGate } from './gate';

function setup(options: { status?: string; typingWindowMs?: number; keepRefusals?: number; isEnabled?: () => boolean } = {}) {
  let clock = 100_000;
  let status = options.status ?? 'idle';
  const sent: string[] = [];
  const stop = ListenEvent<{ cmd: string }>('shatteredarchive:send-command', (p) => sent.push(p.cmd), { key: `gate-test::${Math.random()}` });
  const gate = createCommandGate({ now: () => clock, getAutopilotStatus: () => status, typingWindowMs: options.typingWindowMs, keepRefusals: options.keepRefusals, isEnabled: options.isEnabled });
  return { gate, sent, stop, advance: (ms: number) => void (clock += ms), setStatus: (s: string) => void (status = s) };
}

describe('CommandGate (E2: one controller at a time)', () => {
  it('sends a command through the one send-command event when nobody else has the line', () => {
    const t = setup();
    expect(t.gate.send('  look  ')).toEqual({ ok: true });
    expect(t.sent).toEqual(['look']);
    expect(t.gate.refusals()).toEqual([]);
    t.stop();
  });

  it('is refused while Autopilot is running, and the refusal is recorded; nothing is queued', () => {
    const t = setup({ status: 'running' });
    expect(t.gate.send('north')).toEqual({ ok: false, reason: 'autopilot-running' });
    t.setStatus('idle');
    expect(t.sent).toEqual([]); // the refused command did not leak out when Autopilot stopped
    expect(t.gate.refusals()).toEqual([{ at: 100_000, reason: 'autopilot-running' }]);
    t.stop();
  });

  it('is refused while Copilot is switched off, whatever else is true, and allowed again when it is switched on', () => {
    let on = false;
    const t = setup({ isEnabled: () => on });
    expect(t.gate.send('look')).toEqual({ ok: false, reason: 'copilot-off' });
    expect(t.gate.send('')).toEqual({ ok: false, reason: 'copilot-off' }); // off comes first: not 'invalid-command'
    expect(t.sent).toEqual([]);
    expect(t.gate.refusals()).toEqual([
      { at: 100_000, reason: 'copilot-off' },
      { at: 100_000, reason: 'copilot-off' },
    ]);
    on = true;
    expect(t.gate.send('look')).toEqual({ ok: true });
    expect(t.sent).toEqual(['look']);
    t.stop();
  });

  it.each(['idle', 'paused', 'waiting', 'resting', 'stopping', 'error'])('is allowed while Autopilot is %s', (status) => {
    const t = setup({ status });
    expect(t.gate.send('look').ok).toBe(true);
    t.stop();
  });

  it('is refused for 2 seconds after the user last typed, then allowed', () => {
    const t = setup();
    t.gate.noteUserTyped(100_000);
    t.advance(1_999);
    expect(t.gate.send('look')).toEqual({ ok: false, reason: 'user-typing' });
    t.advance(1);
    expect(t.gate.send('look')).toEqual({ ok: true });
    expect(t.gate.refusals()).toEqual([{ at: 101_999, reason: 'user-typing' }]);
    t.stop();
  });

  it('the user wins over Autopilot: both busy is reported as user-typing', () => {
    const t = setup({ status: 'running' });
    t.gate.noteUserTyped();
    expect(t.gate.send('look')).toEqual({ ok: false, reason: 'user-typing' });
    t.stop();
  });

  it('honours a different typing window', () => {
    const t = setup({ typingWindowMs: 500 });
    t.gate.noteUserTyped(100_000);
    t.advance(500);
    expect(t.gate.send('look').ok).toBe(true);
    t.stop();
  });

  it.each([
    ['empty', ''],
    ['blank', '   '],
    ['a line break (a second command)', 'north\nsouth'],
    ['a carriage return inside', 'north\rsouth'],
    ['a control character', 'north\u0007'],
    ['too long', 'x'.repeat(201)],
    ['not a string', 5 as unknown as string],
  ])('refuses a command that is %s', (_label, command) => {
    const t = setup();
    expect(t.gate.send(command)).toEqual({ ok: false, reason: 'invalid-command' });
    expect(t.sent).toEqual([]);
    t.stop();
  });

  it('keeps only the most recent refusals', () => {
    const t = setup({ status: 'running', keepRefusals: 3 });
    for (let i = 0; i < 5; i++) {
      t.advance(1);
      t.gate.send('north');
    }
    expect(t.gate.refusals().map((r) => r.at)).toEqual([100_003, 100_004, 100_005]);
    t.stop();
  });

  it('uses the clock when noteUserTyped has no time', () => {
    const t = setup();
    t.gate.noteUserTyped();
    expect(t.gate.send('look').ok).toBe(false);
    t.stop();
  });

  it('uses the real clock by default', () => {
    const gate = createCommandGate({ getAutopilotStatus: () => 'idle' });
    gate.noteUserTyped();
    expect(gate.send('look')).toEqual({ ok: false, reason: 'user-typing' });
  });
});

describe('trackUserTyping', () => {
  it('learns of the user typing from the event, and stops when told to', () => {
    const t = setup();
    const stopTracking = t.gate.trackUserTyping();
    DispatchEvent('shatteredarchive:user-typing', { at: 100_000 });
    expect(t.gate.send('look').ok).toBe(false);
    stopTracking();
    t.advance(5_000);
    DispatchEvent('shatteredarchive:user-typing', { at: 105_000 });
    expect(t.gate.send('look').ok).toBe(true); // no longer listening
    t.stop();
  });

  it('treats an event without a time as now', () => {
    const t = setup();
    const stopTracking = t.gate.trackUserTyping();
    DispatchEvent('shatteredarchive:user-typing', {});
    expect(t.gate.send('look').ok).toBe(false);
    stopTracking();
    t.stop();
  });
});
