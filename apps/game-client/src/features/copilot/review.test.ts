import type { Decision, Suggestion } from '@shatteredarchive/copilot-core';
import type { ApiResult, CopilotApi } from './api';
import type { CommandGate, GateResult } from './gate';
import { WHY_MAX, checkWhy, createReviewer } from './review';

const suggestion: Suggestion = {
  id: 's1',
  character: 'Agate-F',
  createdAt: 5,
  mode: 'exploration',
  sphere: 'world',
  kind: 'move',
  command: 'north',
  rationale: 'The only exit.',
  confidence: 0.8,
  confidenceSource: 'model',
  situationKey: 'exploration:hall',
};

function setup(gateResult: GateResult = { ok: true }, post: ApiResult<{ written: boolean }> = { ok: true, value: { written: true } }) {
  const sent: string[] = [];
  const posted: Decision[] = [];
  const gate = { send: (c: string) => (gateResult.ok ? (sent.push(c), gateResult) : gateResult) } as unknown as CommandGate;
  const api = { postDecision: async (d: Decision) => (posted.push(d), post) } as unknown as CopilotApi;
  const controller = new AbortController();
  const reviewer = createReviewer({ api, gate, signal: () => controller.signal, now: () => 1000, newId: () => 'd-1' });
  return { reviewer, sent, posted };
}

describe('checkWhy', () => {
  it('needs 3 to 280 characters when required, counting the trimmed text', () => {
    expect(checkWhy('', true).ok).toBe(false);
    expect(checkWhy('  ab  ', true).ok).toBe(false);
    expect(checkWhy('  abc  ', true)).toEqual({ ok: true, value: 'abc' });
    expect(checkWhy('x'.repeat(WHY_MAX), true).ok).toBe(true);
    expect(checkWhy('x'.repeat(WHY_MAX + 1), true).ok).toBe(false);
  });

  it('accepts nothing when optional, but a note that is given must still fit', () => {
    expect(checkWhy('   ', false)).toEqual({ ok: true, value: '' });
    expect(checkWhy('ab', false).ok).toBe(false);
    expect(checkWhy('x'.repeat(WHY_MAX + 1), false).ok).toBe(false);
  });
});

describe('createReviewer', () => {
  it('approve sends the suggested command once through the gate, then records approved with that command', async () => {
    const { reviewer, sent, posted } = setup();
    const result = await reviewer.approve(suggestion);
    expect(sent).toEqual(['north']);
    expect(posted).toEqual([{ id: 'd-1', suggestionId: 's1', character: 'Agate-F', at: 1000, outcome: 'approved', command: 'north', sphere: 'world', kind: 'move' }]);
    expect(result).toEqual({ done: true, entry: { at: 1000, suggestionId: 's1', action: 'approved', command: 'north', recorded: true } });
  });

  it('correct sends the owner\'s command (trimmed) and records corrected with that command and the why', async () => {
    const { reviewer, sent, posted } = setup();
    const result = await reviewer.correct(suggestion, '  open door  ', 'The exit is a door.');
    expect(sent).toEqual(['  open door  ']);
    // a correction counts against the bucket the wrong suggestion came from
    expect(posted[0]).toMatchObject({ outcome: 'corrected', command: 'open door', why: 'The exit is a door.', sphere: 'world', kind: 'move' });
    expect(result.done && result.entry.command).toBe('open door');
  });

  it('reject sends nothing; the why is recorded when given and left out when empty', async () => {
    const { reviewer, sent, posted } = setup();
    await reviewer.reject(suggestion, 'Too risky here.');
    await reviewer.reject(suggestion, '');
    expect(sent).toEqual([]);
    expect(posted[0]).toEqual({ id: 'd-1', suggestionId: 's1', character: 'Agate-F', at: 1000, outcome: 'rejected', why: 'Too risky here.', sphere: 'world', kind: 'move' });
    expect('why' in posted[1]).toBe(false);
    expect('command' in posted[1]).toBe(false);
  });

  it.each(['user-typing', 'autopilot-running', 'invalid-command'] as const)('a gate that refuses (%s) means nothing is recorded and the answer is not done', async (reason) => {
    const { reviewer, sent, posted } = setup({ ok: false, reason });
    const result = await reviewer.approve(suggestion);
    expect(sent).toEqual([]);
    expect(posted).toEqual([]);
    expect(result).toEqual({ done: false, refused: reason, entry: { at: 1000, suggestionId: 's1', action: 'approved', recorded: false, refused: reason } });
    const corrected = await reviewer.correct(suggestion, 'look', 'why not');
    expect(corrected.done).toBe(false);
    expect(posted).toEqual([]);
  });

  it('a command that was sent but could not be recorded says so', async () => {
    const { reviewer, sent } = setup({ ok: true }, { ok: false, reason: 'offline' });
    const result = await reviewer.approve(suggestion);
    expect(sent).toEqual(['north']);
    expect(result).toEqual({ done: true, entry: { at: 1000, suggestionId: 's1', action: 'approved', command: 'north', recorded: false } });
  });

  it('a rejection the server could not take is reported as not recorded', async () => {
    const { reviewer } = setup({ ok: true }, { ok: false, reason: 'offline' });
    const result = await reviewer.reject(suggestion, '');
    expect(result.entry.recorded).toBe(false);
  });

  it('makes a fresh decision id that passes the ledger id rule when none is injected', async () => {
    const posted: Decision[] = [];
    const reviewer = createReviewer({
      api: { postDecision: async (d: Decision) => (posted.push(d), { ok: true, value: { written: true } }) } as unknown as CopilotApi,
      gate: { send: () => ({ ok: true }) } as unknown as CommandGate,
      signal: () => new AbortController().signal,
    });
    await reviewer.approve(suggestion);
    await reviewer.approve(suggestion);
    expect(posted[0].id).toMatch(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/);
    expect(posted[1].id).not.toBe(posted[0].id);
  });
});
