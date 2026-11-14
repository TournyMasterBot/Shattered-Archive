import type { AutoLevelRunState } from './autoleveling-types';
import { createAutopilotSignals } from './autopilot-signals';

function setup() {
  const sent: { name: string; payload: object }[] = [];
  const signals = createAutopilotSignals((name, payload) => sent.push({ name, payload }));
  return { sent, observe: (s: AutoLevelRunState) => signals.observe(s) };
}

const running: AutoLevelRunState = { status: 'running', round: 1, step: 'move', actionIndex: 0 };

describe('createAutopilotSignals', () => {
  it('reports each change of status, once', () => {
    const t = setup();
    t.observe({ status: 'idle' }); // the assumed start: silent
    t.observe(running);
    t.observe({ ...running, step: 'fight', actionIndex: 3 }); // same status, new details: silent
    t.observe({ status: 'paused', round: 1, step: 'move', actionIndex: 0 });
    expect(t.sent).toEqual([
      { name: 'shatteredarchive:autopilot-status', payload: { status: 'running' } },
      { name: 'shatteredarchive:autopilot-status', payload: { status: 'paused' } },
    ]);
  });

  it('asks for help once when the status becomes error, with the message', () => {
    const t = setup();
    t.observe(running);
    t.observe({ status: 'error', message: 'No route to the area' });
    expect(t.sent.map((s) => s.name)).toEqual([
      'shatteredarchive:autopilot-status',
      'shatteredarchive:autopilot-status',
      'shatteredarchive:autopilot-need-help',
    ]);
    expect(t.sent[2].payload).toEqual({ reason: 'error', message: 'No route to the area' });
  });

  it('a repeat error does not ask again, but entering error again later does', () => {
    const t = setup();
    t.observe({ status: 'error', message: 'first' });
    t.observe({ status: 'error', message: 'second' });
    expect(t.sent.filter((s) => s.name.endsWith('need-help'))).toHaveLength(1);
    t.observe({ status: 'idle' });
    t.observe({ status: 'error', message: 'third' });
    const helps = t.sent.filter((s) => s.name.endsWith('need-help'));
    expect(helps).toHaveLength(2);
    expect(helps[1].payload).toEqual({ reason: 'error', message: 'third' });
  });

  it('a state that never leaves idle stays silent', () => {
    const t = setup();
    t.observe({ status: 'idle' });
    t.observe({ status: 'idle' });
    expect(t.sent).toEqual([]);
  });
});
