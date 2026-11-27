import type { World } from './world/worlds';
import { createTraining, validateTrainingRequest } from './training';

function setup(initial: { world?: World; learning?: boolean } = {}) {
  const state: { world: World | undefined; learning: boolean } = { world: 'world' in initial ? initial.world : 'sandbox', learning: initial.learning ?? true };
  const changes: boolean[] = [];
  const training = createTraining({ world: () => state.world, learning: () => state.learning, onChange: (on) => changes.push(on) });
  return { training, state, changes };
}

describe('createTraining', () => {
  it('starts off, and turns on only for the Simulacrum while Copilot is on', () => {
    const { training, changes } = setup();
    expect(training.enabled()).toBe(false);
    expect(training.set(true)).toEqual({ ok: true, enabled: true });
    expect(training.enabled()).toBe(true);
    expect(changes).toEqual([true]);
  });

  it('refuses to turn on against the DSL, an unknown world, or while Copilot is off, with the reason', () => {
    expect(setup({ world: 'dsl' }).training.set(true)).toEqual({ ok: false, reason: 'not-simulacrum' });
    expect(setup({ world: undefined }).training.set(true)).toEqual({ ok: false, reason: 'not-simulacrum' });
    expect(setup({ learning: false }).training.set(true)).toEqual({ ok: false, reason: 'copilot-off' });
    const refused = setup({ world: 'dsl', learning: false });
    expect(refused.training.set(true)).toEqual({ ok: false, reason: 'copilot-off' }); // Copilot first
    expect(refused.training.enabled()).toBe(false);
    expect(refused.changes).toEqual([]);
  });

  it('turns itself off the first time a condition stops holding, and does not come back by itself', () => {
    const away = setup();
    away.training.set(true);
    away.state.world = 'dsl'; // the connection moved to the production game
    expect(away.training.enabled()).toBe(false);
    away.state.world = 'sandbox'; // back at the Simulacrum: still off
    expect(away.training.enabled()).toBe(false);
    expect(away.changes).toEqual([true, false]);

    const closed = setup();
    closed.training.set(true);
    closed.state.world = undefined; // the connection closed
    expect(closed.training.enabled()).toBe(false);

    const paused = setup();
    paused.training.set(true);
    paused.state.learning = false; // the owner turned Copilot off
    expect(paused.training.enabled()).toBe(false);
  });

  it('turns off on request, always, and a repeat changes nothing', () => {
    const { training, changes, state } = setup();
    expect(training.set(false)).toEqual({ ok: true, enabled: false }); // already off
    expect(changes).toEqual([]);
    training.set(true);
    expect(training.set(true)).toEqual({ ok: true, enabled: true }); // already on
    state.world = 'dsl';
    expect(training.set(false)).toEqual({ ok: true, enabled: false }); // off is allowed whatever the world
    expect(changes).toEqual([true, false]);
  });

  it('says what a client needs: on or off, the world, and why it cannot be turned on now', () => {
    const { training, state } = setup();
    expect(training.status()).toEqual({ enabled: false, world: 'sandbox', canEnable: true });
    training.set(true);
    expect(training.status()).toEqual({ enabled: true, world: 'sandbox', canEnable: true });
    state.world = 'dsl';
    expect(training.status()).toEqual({ enabled: false, world: 'dsl', canEnable: false, refusal: 'not-simulacrum' });
    state.learning = false;
    expect(training.status().refusal).toBe('copilot-off');
  });

  it('works without a change callback', () => {
    const training = createTraining({ world: () => 'sandbox', learning: () => true });
    expect(training.set(true).ok).toBe(true);
    expect(training.set(false).ok).toBe(true);
  });
});

describe('validateTrainingRequest', () => {
  it('accepts exactly { enabled: boolean }', () => {
    expect(validateTrainingRequest({ enabled: true })).toEqual({ ok: true, enabled: true });
    expect(validateTrainingRequest({ enabled: false })).toEqual({ ok: true, enabled: false });
  });

  it.each([[null], [[true]], ['x'], [{}], [{ enabled: 'true' }], [{ enabled: true, extra: 1 }]])('refuses %j', (body) => {
    expect(validateTrainingRequest(body).ok).toBe(false);
  });
});
