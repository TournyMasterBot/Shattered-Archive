import { normalizeSettings, type BucketTable, type Decision, type EscalationTicket, type Suggestion, type TrustSettings } from '@shatteredarchive/copilot-core';
import type { ApiResult, CopilotApi, ServerState } from './api';
import { createAutoApprover, toGameState } from './autoApprove';
import type { Focus } from './focus';
import type { CommandGate, GateResult } from './gate';

const NOW = 1_000_000;

const suggestion: Suggestion = {
  id: 's1',
  character: 'Agate-F',
  createdAt: NOW - 5000,
  mode: 'exploration',
  sphere: 'world',
  kind: 'move',
  command: 'north',
  rationale: 'The only exit.',
  confidence: 0.95,
  confidenceSource: 'model',
  situationKey: 'exploration:hall',
};
const fresh: ServerState = { connected: true, stale: false, staleAfterSeconds: 60, lastEventAgeSeconds: 1, lastTextAgeSeconds: 2, inFight: false, room: null };
const on = (threshold = 0.8, key = 'world:move'): TrustSettings => normalizeSettings({ rules: { [key]: { enabled: true, threshold } } });
const earned = (total: number, approved = total): BucketTable => ({ 'world:move': { approved, total } });

interface Options {
  settings?: () => TrustSettings;
  /** The focus the owner picked; the AI agent unless a test says Training (the tests above are about what the agent may run). */
  focus?: () => Focus;
  state?: ApiResult<ServerState>;
  buckets?: ApiResult<BucketTable>;
  gate?: GateResult;
  postDecision?: ApiResult<{ written: boolean }>;
  postTicket?: ApiResult<{ written: boolean }>;
  onGetState?: () => void;
  controller?: AbortController;
}

function setup(o: Options = {}) {
  const sent: string[] = [];
  const decisions: Decision[] = [];
  const tickets: EscalationTicket[] = [];
  let stateCalls = 0;
  const gateResult = o.gate ?? { ok: true };
  const gate = { send: (c: string) => (gateResult.ok ? (sent.push(c), gateResult) : gateResult) } as unknown as CommandGate;
  const api = {
    getState: async () => {
      stateCalls++;
      o.onGetState?.();
      return o.state ?? { ok: true, value: fresh };
    },
    getBucketStats: async () => o.buckets ?? { ok: true, value: earned(20) },
    postDecision: async (d: Decision) => (decisions.push(d), o.postDecision ?? { ok: true, value: { written: true } }),
    postTicket: async (t: EscalationTicket) => (tickets.push(t), o.postTicket ?? { ok: true, value: { written: true } }),
  } as unknown as CopilotApi;
  const controller = o.controller ?? new AbortController();
  let n = 0;
  const approver = createAutoApprover({
    api,
    gate,
    settings: o.settings ?? (() => on()),
    focus: o.focus ?? (() => 'agent'),
    signal: () => controller.signal,
    now: () => NOW,
    newId: () => `d-${++n}`,
  });
  return { approver, sent, decisions, tickets, stateCalls: () => stateCalls, controller };
}

describe('toGameState', () => {
  it('dates the last text line from the moment the answer arrived', () => {
    expect(toGameState({ ...fresh, lastTextAgeSeconds: 7, inFight: true }, NOW)).toEqual({ connected: true, inFight: true, lastTextAt: NOW - 7000 });
  });

  it.each([
    ['the server calls the feed stale', { stale: true }],
    ['a server that does not report the age', { lastTextAgeSeconds: undefined }],
    ['no text yet', { lastTextAgeSeconds: null }],
    ['an age below zero', { lastTextAgeSeconds: -1 }],
    ['an age that is not a number', { lastTextAgeSeconds: Number.NaN }],
  ])('leaves the text feed undated, which is stale, when %s', (_label, change) => {
    expect(toGameState({ ...fresh, ...change }, NOW)).toEqual({ connected: true, inFight: false });
  });
});

describe('createAutoApprover: what runs', () => {
  it('runs a suggestion once when an enabled rule allows it: sent through the gate, recorded as auto with the rule', async () => {
    const t = setup();
    const result = await t.approver.consider(suggestion);
    expect(t.sent).toEqual(['north']);
    expect(t.decisions).toEqual([{ id: 'd-1', suggestionId: 's1', character: 'Agate-F', at: NOW, outcome: 'auto', command: 'north', rule: 'world:move', sphere: 'world', kind: 'move' }]);
    expect(result).toEqual({ kind: 'ran', entry: { at: NOW, suggestionId: 's1', action: 'auto', rule: 'world:move', command: 'north', recorded: true } });
  });

  it('looks at a suggestion only once: the same id again does nothing, even at the same moment', async () => {
    const t = setup();
    const [a, b] = await Promise.all([t.approver.consider(suggestion), t.approver.consider(suggestion)]);
    expect([a.kind, b.kind].sort()).toEqual(['ran', 'seen']);
    expect(await t.approver.consider(suggestion)).toEqual({ kind: 'seen' });
    expect(t.sent).toEqual(['north']);
    expect(t.stateCalls()).toBe(1);
  });

  it('sends the trimmed command that was recorded', async () => {
    const t = setup();
    await t.approver.consider({ ...suggestion, command: '  north  ' });
    expect(t.sent).toEqual(['  north  ']); // the gate trims; what is recorded is what it sends
    expect(t.decisions[0].command).toBe('north');
  });

  it('says so when the run happened but the server could not record it', async () => {
    const t = setup({ postDecision: { ok: false, reason: 'offline' } });
    const result = await t.approver.consider(suggestion);
    expect(t.sent).toEqual(['north']);
    expect(result).toMatchObject({ kind: 'ran', entry: { recorded: false } });
  });
});

describe('createAutoApprover: what asks instead', () => {
  it('asks and sends nothing when no rule is on', async () => {
    const t = setup({ settings: () => normalizeSettings({}) });
    expect(await t.approver.consider(suggestion)).toEqual({ kind: 'ask', reason: 'no-rule' });
    expect(t.sent).toEqual([]);
    expect(t.decisions).toEqual([]);
  });

  it('asks for a rule that is off, and for another bucket’s rule', async () => {
    const off = setup({ settings: () => normalizeSettings({ rules: { 'world:move': { enabled: false, threshold: 0.6 } } }) });
    expect(await off.approver.consider(suggestion)).toEqual({ kind: 'ask', reason: 'no-rule' });
    const other = setup({ settings: () => on(0.6, 'fighting:fight-continue') });
    expect(await other.approver.consider(suggestion)).toEqual({ kind: 'ask', reason: 'no-rule' });
    expect(off.sent.concat(other.sent)).toEqual([]);
  });

  it('asks with 19 earlier answers and runs with 20', async () => {
    const nineteen = setup({ buckets: { ok: true, value: earned(19) } });
    expect(await nineteen.approver.consider(suggestion)).toEqual({ kind: 'ask', reason: 'insufficient-samples' });
    expect(nineteen.sent).toEqual([]);
    const twenty = setup({ buckets: { ok: true, value: earned(20) } });
    expect((await twenty.approver.consider(suggestion)).kind).toBe('ran');
  });

  it('asks when the owner’s history is not good enough for the threshold, however sure the model is', async () => {
    const t = setup({ buckets: { ok: true, value: earned(20, 14) } }); // 70% approved: the lower bound is well under 0.8
    expect(await t.approver.consider({ ...suggestion, confidence: 1 })).toEqual({ kind: 'ask', reason: 'below-threshold' });
    const strict = setup({ settings: () => on(0.99) });
    expect(await strict.approver.consider(suggestion)).toEqual({ kind: 'ask', reason: 'below-threshold' });
    expect(t.sent.concat(strict.sent)).toEqual([]);
  });

  it('asks when the model gave no rating', async () => {
    const t = setup();
    expect(await t.approver.consider({ ...suggestion, confidence: null })).toEqual({ kind: 'ask', reason: 'no-confidence' });
  });

  it.each([
    ['the server says the feed is stale', { stale: true }],
    ['the text feed is older than the owner’s limit', { lastTextAgeSeconds: 61 }],
    ['the server does not report the text age', { lastTextAgeSeconds: undefined }],
  ])('never runs by itself when %s', async (_label, change) => {
    const t = setup({ state: { ok: true, value: { ...fresh, ...change } } });
    expect(await t.approver.consider(suggestion)).toEqual({ kind: 'ask', reason: 'stale' });
    expect(t.sent).toEqual([]);
  });

  it('honours the stale limit in the owner’s settings, not the server’s', async () => {
    const settings = normalizeSettings({ staleAfterSeconds: 300, rules: { 'world:move': { enabled: true, threshold: 0.8 } } });
    const t = setup({ settings: () => settings, state: { ok: true, value: { ...fresh, lastTextAgeSeconds: 120 } } });
    expect((await t.approver.consider(suggestion)).kind).toBe('ran');
  });

  it.each([
    ['a floor kind the producer claimed', { ...suggestion, kind: 'speak' as const, command: 'say hello' }],
    ['a floor command claimed as a move', { ...suggestion, command: 'say hello' }],
    ['a purchase', { ...suggestion, kind: 'spend-or-lose' as const, command: 'buy sword' }],
  ])('never runs %s, whatever the settings say', async (_label, floor) => {
    // the rule is written into the settings object directly: even then the policy refuses the floor
    const forced = { ...on(), rules: { 'world:move': { enabled: true, threshold: 0.5 }, 'world:speak': { enabled: true, threshold: 0.5 } } } as TrustSettings;
    const t = setup({ settings: () => forced, buckets: { ok: true, value: { 'world:move': { approved: 99, total: 99 }, 'world:speak': { approved: 99, total: 99 } } } });
    expect(await t.approver.consider(floor)).toEqual({ kind: 'ask', reason: 'floor' });
    expect(t.sent).toEqual([]);
    expect(t.decisions).toEqual([]);
  });

  it('reads the owner’s settings at the moment of the decision: a rule switched off while the state was fetched does not run', async () => {
    let current = on();
    const t = setup({ settings: () => current, onGetState: () => (current = normalizeSettings({})) });
    expect(await t.approver.consider(suggestion)).toEqual({ kind: 'ask', reason: 'no-rule' });
    expect(t.sent).toEqual([]);
  });
});

describe('createAutoApprover: escalation', () => {
  it('files a ticket for a command it cannot classify, and sends nothing', async () => {
    const t = setup();
    const result = await t.approver.consider({ ...suggestion, kind: 'unknown', command: 'group all' });
    expect(result).toEqual({ kind: 'escalated', reason: 'unknown-class', filed: true });
    expect(t.sent).toEqual([]);
    expect(t.tickets).toEqual([
      {
        id: 't-s1',
        createdAt: NOW,
        character: 'Agate-F',
        reason: 'unknown-situation',
        sphere: 'world',
        kind: 'unknown',
        situationKey: 'exploration:hall',
        summary: 'The suggested command is not one Copilot can classify, so it asked the owner and filed this.',
        status: 'open',
      },
    ]);
    expect(JSON.stringify(t.tickets)).not.toContain('group all');
  });

  it('files a danger ticket for a fight against a target it knows too little about', async () => {
    const t = setup();
    const result = await t.approver.consider({ ...suggestion, kind: 'fight-start-unknown', sphere: 'fighting', command: 'kill goblin' });
    expect(result).toEqual({ kind: 'escalated', reason: 'unknown-target', filed: true });
    expect(t.tickets[0]).toMatchObject({ reason: 'danger', sphere: 'fighting', kind: 'fight-start-unknown' });
    expect(t.sent).toEqual([]);
  });

  it('files a low-confidence ticket when the model rated itself under 0.3', async () => {
    const t = setup();
    expect(await t.approver.consider({ ...suggestion, confidence: 0.2 })).toEqual({ kind: 'escalated', reason: 'very-low-confidence', filed: true });
    expect(t.tickets[0]).toMatchObject({ reason: 'low-confidence', kind: 'move' });
  });

  it('files each ticket once even when the suggestion is listed again, and keeps the ticket id within the ledger’s limit', async () => {
    const t = setup();
    const long = { ...suggestion, id: 's'.repeat(64), confidence: 0.1 };
    await t.approver.consider(long);
    await t.approver.consider(long);
    expect(t.tickets).toHaveLength(1);
    expect(t.tickets[0].id).toHaveLength(64);
  });

  it('reports a ticket the server did not take', async () => {
    const t = setup({ postTicket: { ok: false, reason: 'offline' } });
    expect(await t.approver.consider({ ...suggestion, confidence: 0.1 })).toEqual({ kind: 'escalated', reason: 'very-low-confidence', filed: false });
  });

  it('does not file a ticket while the feed is stale: it only asks', async () => {
    const t = setup({ state: { ok: true, value: { ...fresh, stale: true } } });
    expect(await t.approver.consider({ ...suggestion, confidence: 0.1 })).toEqual({ kind: 'ask', reason: 'stale' });
    expect(t.tickets).toEqual([]);
  });
});

describe('createAutoApprover: the gate and the server', () => {
  it.each(['user-typing', 'autopilot-running', 'invalid-command'] as const)(
    'a gate that refuses (%s) is recorded as refused, nothing is sent and the suggestion is not tried again',
    async (reason) => {
      const t = setup({ gate: { ok: false, reason } });
      const result = await t.approver.consider(suggestion);
      expect(result).toEqual({ kind: 'refused', refused: reason, entry: { at: NOW, suggestionId: 's1', action: 'auto', rule: 'world:move', recorded: true, refused: reason } });
      expect(t.decisions).toEqual([{ id: 'd-1', suggestionId: 's1', character: 'Agate-F', at: NOW, outcome: 'refused', rule: reason, sphere: 'world', kind: 'move' }]);
      expect(await t.approver.consider(suggestion)).toEqual({ kind: 'seen' });
      expect(t.decisions).toHaveLength(1); // no loop
    },
  );

  it('says so when a refusal could not be recorded either', async () => {
    const t = setup({ gate: { ok: false, reason: 'user-typing' }, postDecision: { ok: false, reason: 'http', status: 500 } });
    expect(await t.approver.consider(suggestion)).toMatchObject({ kind: 'refused', entry: { recorded: false } });
  });

  it.each([
    ['the state cannot be read', { state: { ok: false, reason: 'offline' } as const }],
    ['the bucket statistics cannot be read', { buckets: { ok: false, reason: 'http', status: 503 } as const }],
  ])('runs nothing by itself when %s', async (_label, failure) => {
    const t = setup(failure);
    expect(await t.approver.consider(suggestion)).toEqual({ kind: 'unavailable' });
    expect(t.sent).toEqual([]);
    expect(t.decisions).toEqual([]);
  });

  it('runs nothing when the window closed while the answers were on their way', async () => {
    const controller = new AbortController();
    const t = setup({ controller, onGetState: () => controller.abort() });
    expect(await t.approver.consider(suggestion)).toEqual({ kind: 'unavailable' });
    expect(t.sent).toEqual([]);
  });
});

describe('createAutoApprover: the focus', () => {
  it('in Training nothing runs by itself, even with the rule on, the history earned and the model sure: the owner answers it', async () => {
    const t = setup({ focus: () => 'training', buckets: { ok: true, value: earned(50) } });
    expect(await t.approver.consider(suggestion)).toEqual({ kind: 'ask', reason: 'training' });
    expect(t.sent).toEqual([]);
    expect(t.decisions).toEqual([]); // no `auto` decision: nothing happened that Copilot could learn from
  });

  it('in Training a suggestion the policy would not run anyway still gets its own reason, and tickets are still filed for the teacher', async () => {
    const t = setup({ focus: () => 'training' });
    expect((await t.approver.consider({ ...suggestion, id: 'a', kind: 'spend-or-lose', command: 'drop sword' }))).toEqual({ kind: 'ask', reason: 'floor' });
    expect(await t.approver.consider({ ...suggestion, id: 'b', kind: 'unknown', command: 'group all' })).toEqual({ kind: 'escalated', reason: 'unknown-class', filed: true });
    expect(t.tickets).toHaveLength(1);
    expect(t.sent).toEqual([]);
  });

  it('the focus is read when the command is about to be sent: switching to Training while the server was answering stops it', async () => {
    let focus: Focus = 'agent';
    const t = setup({ focus: () => focus, onGetState: () => void (focus = 'training') });
    expect(await t.approver.consider(suggestion)).toEqual({ kind: 'ask', reason: 'training' });
    expect(t.sent).toEqual([]);
  });

  it('switching back to the AI agent lets the same rule run the next suggestion', async () => {
    let focus: Focus = 'training';
    const t = setup({ focus: () => focus });
    expect((await t.approver.consider({ ...suggestion, id: 'one' })).kind).toBe('ask');
    focus = 'agent';
    expect((await t.approver.consider({ ...suggestion, id: 'two' })).kind).toBe('ran');
    expect(t.sent).toEqual(['north']);
  });

  // Whatever the owner switched on, and however sure the model is, these always wait for the owner (the floor, and what it cannot classify).
  const everything = normalizeSettings({
    rules: Object.fromEntries(
      ['world', 'fighting', 'things', 'interaction'].flatMap((sphere) =>
        ['move', 'info', 'interact', 'loot', 'ability', 'fight-continue', 'fight-start-known'].map((kind) => [`${sphere}:${kind}`, { enabled: true, threshold: 0.5 }]),
      ),
    ),
  });
  const wellEarned: BucketTable = Object.fromEntries(
    ['world', 'fighting', 'things', 'interaction'].flatMap((sphere) =>
      ['move', 'info', 'interact', 'loot', 'ability', 'fight-continue', 'fight-start-known'].map((kind) => [`${sphere}:${kind}`, { approved: 100, total: 100 }]),
    ),
  );
  it.each([
    // spends or loses something
    'drop sword', 'give coin bob', 'sell all', 'buy bread', 'quaff potion', 'eat bread', 'donate 10', 'trade bob',
    // speaks to other players
    'tell bob hi', 'say hello', 'emote waves', ':waves', 'gossip hi', 'gtell hi', 'whisper bob hi',
    // irreversible, or attacks a player
    'quit', 'delete', 'steal gem bob', 'murder bob', 'sacrifice corpse',
    // deals with other players in a way Copilot cannot vouch for
    'group bob', 'follow bob', 'order guard kill', 'hug bob', 'kiss bob', 'poke bob', 'slap bob', 'trust bob', 'invite bob', 'join bob',
  ])('the AI agent never runs "%s" by itself, with every rule on and every bucket earned', async (command) => {
    const t = setup({ settings: () => everything, buckets: { ok: true, value: wellEarned } });
    const result = await t.approver.consider({ ...suggestion, id: `safe-${command}`, kind: 'move', sphere: 'interaction', confidence: 1, command });
    expect(['ask', 'escalated']).toContain(result.kind);
    expect(t.sent).toEqual([]);
    expect(t.decisions.filter((d) => d.outcome === 'auto')).toEqual([]);
  });

  it('and the same rules do run plain movement, looking and fighting on, so the matrix above is not simply refusing everything', async () => {
    const t = setup({ settings: () => everything, buckets: { ok: true, value: wellEarned } });
    expect((await t.approver.consider({ ...suggestion, id: 'm', kind: 'move', command: 'north' })).kind).toBe('ran');
    expect((await t.approver.consider({ ...suggestion, id: 'l', kind: 'info', command: 'look' })).kind).toBe('ran');
    expect(t.sent).toEqual(['north', 'look']);
  });
});

describe('createAutoApprover: memory', () => {
  it('forgets the oldest ids after 200, so the list stays small', async () => {
    const t = setup({ settings: () => normalizeSettings({}) });
    for (let i = 0; i < 201; i++) await t.approver.consider({ ...suggestion, id: `s${i}` });
    expect(await t.approver.consider({ ...suggestion, id: 's200' })).toEqual({ kind: 'seen' });
    expect((await t.approver.consider({ ...suggestion, id: 's0' })).kind).toBe('ask'); // looked at again
  });
});
