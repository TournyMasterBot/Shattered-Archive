import type { ViewSink } from './feed';
import { fanOut, WorldRouter } from './router';

type Args = Parameters<ViewSink['apply']>;
const view = { title: 'Hall' } as unknown as Args[0];
const ctx = { day: '2026-11-11', session: 's' } as unknown as Args[1];

function sink(answer: unknown = { ok: true }) {
  const s = { apply: jest.fn(async () => answer), endSession: jest.fn(), noteRefused: jest.fn() };
  return s;
}

describe('WorldRouter: a view goes to the layer of the world its connection went to', () => {
  const DSL = 'dsl-mud.org:4000';
  const SIM = 'simulacrum-server.shatteredarchive.dev:65001';

  it('refuses every view until a connection of a known world is seen, and counts them', async () => {
    const dsl = sink();
    const router = new WorldRouter({ dsl });
    expect(router.current).toBeUndefined();
    expect(await router.apply(view, ctx)).toEqual({ ok: false, reason: 'no-world' });
    expect(dsl.apply).not.toHaveBeenCalled();
    expect(router.refused).toBe(1);
  });

  it('sends the DSL\'s views to the DSL sink and the Simulacrum\'s to the sandbox sink, never across', async () => {
    const dsl = sink('dsl answer');
    const sandbox = sink('sandbox answer');
    const router = new WorldRouter({ dsl, sandbox });
    router.setTarget(DSL);
    expect(router.current).toBe('dsl');
    expect(await router.apply(view, ctx)).toBe('dsl answer');
    router.setTarget(SIM);
    expect(router.current).toBe('sandbox');
    expect(await router.apply(view, ctx)).toBe('sandbox answer');
    expect(dsl.apply).toHaveBeenCalledTimes(1);
    expect(sandbox.apply).toHaveBeenCalledTimes(1);
  });

  it('a target that is no world (another port of the DSL host, another game) and a closed connection refuse', async () => {
    const dsl = sink();
    const router = new WorldRouter({ dsl });
    router.setTarget('dsl-mud.org:8000');
    expect(await router.apply(view, ctx)).toEqual({ ok: false, reason: 'no-world' });
    router.setTarget(DSL);
    await router.apply(view, ctx);
    router.setTarget(undefined);
    expect(router.current).toBeUndefined();
    expect(await router.apply(view, ctx)).toEqual({ ok: false, reason: 'no-world' });
    expect(dsl.apply).toHaveBeenCalledTimes(1);
    expect(router.refused).toBe(2);
  });

  it('a world with no sink (no memory for it) refuses too', async () => {
    const router = new WorldRouter({ dsl: sink() });
    router.setTarget(SIM);
    expect(router.current).toBe('sandbox');
    expect(await router.apply(view, ctx)).toEqual({ ok: false, reason: 'no-world' });
  });

  it('ends the session in every world\'s memory', () => {
    const dsl = sink();
    const sandbox = sink();
    const router = new WorldRouter({ dsl, sandbox });
    router.endSession();
    expect(dsl.endSession).toHaveBeenCalledTimes(1);
    expect(sandbox.endSession).toHaveBeenCalledTimes(1);
  });

  it('passes a refused view to the memory of the current world, or counts it when there is none', () => {
    const dsl = sink();
    const sandbox = sink();
    const router = new WorldRouter({ dsl, sandbox });
    router.noteRefused();
    expect(router.refused).toBe(1);
    router.setTarget(SIM);
    router.noteRefused();
    expect(sandbox.noteRefused).toHaveBeenCalledTimes(1);
    expect(dsl.noteRefused).not.toHaveBeenCalled();
    expect(router.refused).toBe(1);
  });
});

describe('fanOut', () => {
  it('gives every view to all the sinks and answers with the first one\'s answer', async () => {
    const a = sink('first');
    const b = sink('second');
    const both = fanOut(a, b);
    expect(await both.apply(view, ctx)).toBe('first');
    expect(a.apply).toHaveBeenCalledWith(view, ctx);
    expect(b.apply).toHaveBeenCalledWith(view, ctx);
  });

  it('ends the session and notes a refusal in all of them', () => {
    const a = sink();
    const b = sink();
    const both = fanOut(a, b);
    both.endSession();
    both.noteRefused();
    for (const s of [a, b]) {
      expect(s.endSession).toHaveBeenCalledTimes(1);
      expect(s.noteRefused).toHaveBeenCalledTimes(1);
    }
  });
});
