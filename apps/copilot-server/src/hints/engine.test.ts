// The tier selection: the fastest tier that has commands answers; nothing is asked after it; a tier that throws is "cannot answer"; a room is escalated once.
import { createHintEngine, type HintEngineDeps } from './engine';
import type { TierFn } from './types';

const room = { title: 'Chamber of Rest' };
const says = (...commands: string[]): TierFn => jest.fn(async () => ({ commands, notes: ['n'] }));
const silent = (): TierFn => jest.fn(async () => null);

function engine(over: Partial<HintEngineDeps> = {}, clock = { t: 1_000 }) {
  const deps: HintEngineDeps = { learned: silent(), instant: silent(), now: () => clock.t, ...over };
  return { engine: createHintEngine(deps), deps, clock };
}

describe('createHintEngine', () => {
  it('stops at the first tier that has commands and does not ask the ones after it', async () => {
    const learned = says('enter orb');
    const instant = says('look fountain');
    const local = says('x');
    const { engine: e } = engine({ learned, instant, local });
    expect(await e.hint(room)).toMatchObject({ tier: 'learned', commands: ['enter orb'], notes: ['n'], tried: ['learned'] });
    expect(instant).not.toHaveBeenCalled();
    expect(local).not.toHaveBeenCalled();
  });

  it('goes on to the next tier when one has nothing, and says which tiers it asked', async () => {
    const { engine: e } = engine({ instant: says('look fountain'), local: says('x') });
    expect(await e.hint(room)).toMatchObject({ tier: 'instant', commands: ['look fountain'], tried: ['learned', 'instant'] });
    const { engine: f } = engine({ local: says('push button') });
    expect(await f.hint(room)).toMatchObject({ tier: 'local', commands: ['push button'], tried: ['learned', 'instant', 'local'] });
  });

  it('skips a tier that is not there, and counts a tier with no commands (or no notes) as having nothing or no notes', async () => {
    const { engine: e } = engine({ learned: jest.fn(async () => ({ commands: [] })), instant: jest.fn(async () => ({ commands: ['look'] })) });
    expect(await e.hint(room)).toMatchObject({ tier: 'instant', commands: ['look'], notes: [], tried: ['learned', 'instant'] });
  });

  it('takes a tier that throws for a tier that cannot answer', async () => {
    const { engine: e } = engine({ learned: jest.fn(async () => Promise.reject(new Error('boom'))), instant: says('look fountain') });
    expect(await e.hint(room)).toMatchObject({ tier: 'instant' });
  });

  it('measures how long the answer took', async () => {
    const clock = { t: 1_000 };
    const slow: TierFn = async () => {
      clock.t += 250;
      return { commands: ['look'] };
    };
    const { engine: e } = engine({ instant: slow }, clock);
    expect((await e.hint(room)).ms).toBe(250);
  });

  it('files an escalation when no tier can answer, once per room until the hour is up', async () => {
    const escalate = jest.fn(async () => undefined);
    const clock = { t: 1_000 };
    const { engine: e } = engine({ escalate, local: silent() }, clock);
    expect(await e.hint(room)).toMatchObject({ tier: 'escalated', commands: [], tried: ['learned', 'instant', 'local', 'escalated'], notes: [expect.stringContaining('ticket')] });
    expect(escalate).toHaveBeenCalledWith(room, ['learned', 'instant', 'local', 'escalated']);
    expect(await e.hint({ title: ' chamber  of REST ' })).toMatchObject({ tier: 'none', tried: ['learned', 'instant', 'local'] }); // same room, same hour
    clock.t += 3_600_000;
    expect((await e.hint(room)).tier).toBe('escalated');
    expect(escalate).toHaveBeenCalledTimes(2);
    expect((await e.hint({ title: 'Another Room' })).tier).toBe('escalated');
  });

  it('answers none, and escalates nothing, when there is no escalation, no title or the caller gave up', async () => {
    const { engine: plain } = engine();
    expect(await plain.hint(room)).toMatchObject({ tier: 'none', commands: [], tried: ['learned', 'instant'] });
    const escalate = jest.fn(async () => undefined);
    const { engine: e } = engine({ escalate });
    expect((await e.hint({ title: '  ' })).tier).toBe('none');
    const controller = new AbortController();
    controller.abort();
    expect(await e.hint(room, controller.signal)).toMatchObject({ tier: 'none', tried: [] });
    expect(escalate).not.toHaveBeenCalled();
  });

  it('tries again next time when the ticket could not be written', async () => {
    let fail = true;
    const escalate = jest.fn(async () => {
      if (fail) throw new Error('disk full');
    });
    const { engine: e } = engine({ escalate });
    expect(await e.hint(room)).toMatchObject({ tier: 'none', tried: ['learned', 'instant'] });
    fail = false;
    expect(await e.hint(room)).toMatchObject({ tier: 'escalated' });
    expect(escalate).toHaveBeenCalledTimes(2);
  });

  it('uses the real clock when none is given', async () => {
    const e = createHintEngine({ learned: says('look'), instant: silent() });
    expect((await e.hint(room)).ms).toBeGreaterThanOrEqual(0);
  });
});
