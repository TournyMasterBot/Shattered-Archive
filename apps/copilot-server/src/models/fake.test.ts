import { createFakeModel } from './fake';

describe('createFakeModel', () => {
  it('answers from the script in order, repeats the last answer, and records every call', async () => {
    const model = createFakeModel(['one', { ok: false, reason: 'timeout' }, 'three']);
    expect(await model.generate('watcher', 'p1')).toEqual({ ok: true, text: 'one' });
    expect(await model.generate('agent', 'p2')).toEqual({ ok: false, reason: 'timeout' });
    expect(await model.generate('watcher', 'p3')).toEqual({ ok: true, text: 'three' });
    expect(await model.generate('watcher', 'p4')).toEqual({ ok: true, text: 'three' });
    expect(model.calls.map((c) => `${c.role}:${c.prompt}`)).toEqual(['watcher:p1', 'agent:p2', 'watcher:p3', 'watcher:p4']);
  });

  it('lets an answer be a function of the call', async () => {
    const model = createFakeModel([({ role, prompt }) => `${role} saw ${prompt.length} chars`]);
    expect(await model.generate('agent', 'abcd')).toEqual({ ok: true, text: 'agent saw 4 chars' });
  });

  it('without a script, the watcher proposes look in the sphere named in the prompt (or world)', async () => {
    const model = createFakeModel();
    const named = await model.generate('watcher', 'SPHERE: fighting\nMODE: battle');
    expect(named.ok && JSON.parse(named.text)).toMatchObject({ command: 'look', kind: 'info', sphere: 'fighting', confidence: 0.9 });
    const unnamed = await model.generate('watcher', 'no sphere here');
    expect(unnamed.ok && JSON.parse(unnamed.text).sphere).toBe('world');
  });

  it('without a script, the agent restates the owner command and names its verb', async () => {
    const model = createFakeModel();
    const reply = await model.generate('agent', 'SUGGESTED COMMAND: look\nOWNER COMMAND: drop sword\nOWNER WHY: too heavy');
    expect(reply.ok && JSON.parse(reply.text)).toEqual({ rule: 'Prefer "drop sword" here.', restatement: 'The owner chose drop instead.', confident: true });
    const none = await model.generate('agent', 'no correction');
    expect(none.ok && JSON.parse(none.text).confident).toBe(true);
  });

  it('does nothing for an aborted signal', async () => {
    const model = createFakeModel();
    const controller = new AbortController();
    controller.abort();
    expect(await model.generate('watcher', 'x', controller.signal)).toEqual({ ok: false, reason: 'aborted' });
    expect(model.calls).toEqual([]);
  });
});
