import { DispatchEvent, ListenEvent } from '../event-emitter/event-dispatcher';
import { createAutopilotLink } from './autopilotLink';

const CONTROLS = ['start', 'pause', 'resume', 'stop'] as const;

describe('Copilot to Autopilot', () => {
  it.each(CONTROLS)('%s dispatches the matching autoleveling event exactly once', (control) => {
    const seen: string[] = [];
    const stops = CONTROLS.map((name) => ListenEvent(`shatteredarchive:autoleveling-${name}`, () => seen.push(name), { key: `link-test::${name}` }));
    createAutopilotLink()[control]();
    expect(seen).toEqual([control]);
    stops.forEach((stop) => stop());
  });
});

describe('Autopilot to Copilot', () => {
  it('reports need-help with its reason and message, once per event', () => {
    const link = createAutopilotLink();
    const seen: unknown[] = [];
    const stop = link.onNeedHelp((help) => seen.push(help));
    DispatchEvent('shatteredarchive:autopilot-need-help', { reason: 'error', message: 'No route to the area' });
    expect(seen).toEqual([{ reason: 'error', message: 'No route to the area' }]);
    stop();
    DispatchEvent('shatteredarchive:autopilot-need-help', { reason: 'error', message: 'again' });
    expect(seen).toHaveLength(1);
  });

  it('passes a timeout reason through, so Copilot can tell a stalled run from an error', () => {
    const link = createAutopilotLink();
    const seen: unknown[] = [];
    const off = link.onNeedHelp((h) => seen.push(h));
    DispatchEvent('shatteredarchive:autopilot-need-help', { reason: 'timeout', message: 'no reply to "n"' });
    off();
    expect(seen).toEqual([{ reason: 'timeout', message: 'no reply to "n"' }]);
  });

  it('fills in a reason and a message that are missing or not text', () => {
    const link = createAutopilotLink();
    const seen: unknown[] = [];
    const stop = link.onNeedHelp((help) => seen.push(help));
    DispatchEvent('shatteredarchive:autopilot-need-help', { reason: 5, message: null });
    expect(seen).toEqual([{ reason: 'unknown', message: '' }]);
    stop();
  });

  it('two listeners both hear it', () => {
    const link = createAutopilotLink();
    const a = jest.fn();
    const b = jest.fn();
    const stopA = link.onNeedHelp(a);
    const stopB = link.onNeedHelp(b);
    DispatchEvent('shatteredarchive:autopilot-need-help', { reason: 'error', message: 'x' });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    stopA();
    stopB();
  });

  it('follows Autopilot status once attached, ignores a status that is not text, and stops when detached', () => {
    const link = createAutopilotLink();
    expect(link.status()).toBe('idle');
    DispatchEvent('shatteredarchive:autopilot-status', { status: 'running' });
    expect(link.status()).toBe('idle'); // not attached yet

    const detach = link.attach();
    DispatchEvent('shatteredarchive:autopilot-status', { status: 'running' });
    expect(link.status()).toBe('running');
    DispatchEvent('shatteredarchive:autopilot-status', { status: 7 });
    expect(link.status()).toBe('running');
    detach();
    DispatchEvent('shatteredarchive:autopilot-status', { status: 'paused' });
    expect(link.status()).toBe('running');
  });
});
