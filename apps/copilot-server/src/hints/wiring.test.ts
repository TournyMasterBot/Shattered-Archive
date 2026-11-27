// The hint tiers built from the server's pieces: the learned ledger, the instant tier on the DSL site, the escalation as a ticket.
import { JsonlStore, validateTicket, type EscalationTicket } from '@shatteredarchive/copilot-core';
import { MemoryFs } from '../testing/memoryFs';
import { createHintTiers, type HintTiersDeps } from './wiring';
import { validateRule, type HintRule } from './rules';

const NOW = Date.parse('2026-11-12T10:00:00Z');
const json = (body: unknown, status = 200): Response => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;
const hints = { hints: { candidates: [{ commands: ['look fountain'] }] } };

async function setup(over: Partial<HintTiersDeps> = {}, config: HintTiersDeps['config'] = { archiveUrl: 'http://site.test', hintsLocal: false }) {
  const fs = new MemoryFs();
  const { store: rules } = await JsonlStore.open<HintRule>({ fs, path: '/rules.jsonl', validate: validateRule });
  const { store: tickets } = await JsonlStore.open<EscalationTicket>({ fs, path: '/tickets.jsonl', validate: validateTicket });
  const calls: string[] = [];
  const tiers = createHintTiers({
    config,
    characters: { current: { codename: 'Agate', gender: 'F' } as never },
    tickets,
    rules,
    now: () => NOW,
    fetch: (async (url: unknown, init?: RequestInit) => (calls.push(`${init?.method ?? 'GET'} ${new URL(String(url)).pathname}`), json(hints))) as typeof fetch,
    ...over,
  });
  return { tiers, rules, tickets, calls };
}

describe('createHintTiers', () => {
  it('answers from what was taught before it asks the site', async () => {
    const { tiers, calls } = await setup();
    const taught = await tiers.addRule({ title: 'Chamber of Rest', commands: ['enter orb'], source: 'owner' });
    expect(taught.ok).toBe(true);
    expect(await tiers.engine.hint({ title: 'chamber of rest' })).toMatchObject({ tier: 'learned', commands: ['enter orb'] });
    expect(calls).toEqual([]);
    expect(tiers.rules().map((r) => r.title)).toEqual(['Chamber of Rest']);
  });

  it('asks the instant tier for a room nobody taught, and never the local model unless it is allowed', async () => {
    const { tiers, calls } = await setup();
    expect(await tiers.engine.hint({ title: 'Hall' })).toMatchObject({ tier: 'instant', commands: ['look fountain'] });
    expect(calls).toEqual(['GET /api/agent/room-hints']);
  });

  it('asks the local model only when the config allows it and the instant tier had nothing', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: unknown, init?: RequestInit) => {
      const path = new URL(String(url)).pathname;
      calls.push(`${init?.method ?? 'GET'} ${path}`);
      return path.endsWith('/ai') ? json({ result: { ok: true, answer: 'push button' } }) : json({ hints: { candidates: [] } });
    }) as typeof fetch;
    const off = await setup({ fetch: fetchImpl });
    expect((await off.tiers.engine.hint({ title: 'Hall' })).tier).toBe('escalated');
    expect(calls).toEqual(['GET /api/agent/room-hints']);
    calls.length = 0;
    const on = await setup({ fetch: fetchImpl }, { archiveUrl: 'http://site.test', hintsLocal: true });
    expect(await on.tiers.engine.hint({ title: 'Hall' })).toMatchObject({ tier: 'local', commands: ['push button'] });
    expect(calls).toEqual(['GET /api/agent/room-hints', 'POST /api/agent/room-hints/ai']);
  });

  it('with no archive configured, only the learned tier and the escalation exist', async () => {
    const { tiers, calls, tickets } = await setup({}, { archiveUrl: undefined, hintsLocal: true });
    expect(await tiers.engine.hint({ title: 'Hall' })).toMatchObject({ tier: 'escalated', tried: ['learned', 'instant', 'escalated'] });
    expect(calls).toEqual([]);
    expect(tickets.query()).toHaveLength(1);
  });

  it('files an escalation as an open ticket for the character, naming the room and how to teach it', async () => {
    const { tiers, tickets } = await setup({}, { archiveUrl: undefined, hintsLocal: false });
    await tiers.engine.hint({ title: 'The Hall of Whispers!' });
    const [ticket] = tickets.query();
    expect(ticket).toMatchObject({
      character: 'Agate-F',
      reason: 'unknown-situation',
      sphere: 'interaction',
      kind: 'unknown',
      situationKey: 'hint:the-hall-of-whispers',
      status: 'open',
      createdAt: NOW,
    });
    expect(ticket.id).toMatch(/^hint-the-hall-of-whispers-[0-9a-z]+$/);
    expect(ticket.summary).toContain('The Hall of Whispers!');
    expect(ticket.summary).toContain('POST /hints/rules');
  });

  it('does not file a ticket while nobody is playing, and tries again when someone is', async () => {
    const who: { active?: { codename: string; gender: string } } = {};
    const { tiers, tickets } = await setup({ characters: { get current() { return who.active as never; } } }, { archiveUrl: undefined, hintsLocal: false });
    expect((await tiers.engine.hint({ title: 'Hall' })).tier).toBe('none');
    expect(tickets.query()).toHaveLength(0);
    who.active = { codename: 'Agate', gender: 'F' };
    expect((await tiers.engine.hint({ title: 'Hall' })).tier).toBe('escalated');
    expect(tickets.query()).toHaveLength(1);
  });

  it('does not take a ticket the ledger refused for a filed one', async () => {
    const { tiers } = await setup({ tickets: { append: async () => ({ ok: false, error: 'full' }) } }, { archiveUrl: undefined, hintsLocal: false });
    expect((await tiers.engine.hint({ title: 'Hall' })).tier).toBe('none');
  });

  it('refuses a rule that is not one, says why, and writes nothing; a ledger that cannot write is said too', async () => {
    const { tiers, rules } = await setup();
    expect(await tiers.addRule({ title: 'Hall', commands: [], source: 'owner' })).toMatchObject({ ok: false, problem: expect.stringContaining('commands') });
    expect(rules.query()).toHaveLength(0);
    const broken = await setup({ rules: { query: () => [], append: async () => ({ ok: false, error: 'disk' }) } as never });
    expect(await broken.tiers.addRule({ title: 'Hall', commands: ['look'], source: 'claude' })).toEqual({ ok: false, problem: 'the rule could not be written' });
  });

  it('teaching the same room again on the same day replaces the earlier answer', async () => {
    const { tiers } = await setup();
    await tiers.addRule({ title: 'Hall', commands: ['look a'], source: 'owner' });
    await tiers.addRule({ title: 'Hall', commands: ['look b'], source: 'owner' });
    expect(tiers.rules()).toHaveLength(1);
    expect(tiers.rules()[0].commands).toEqual(['look b']);
  });

  it('uses the real clock and the default fetch when none are given', async () => {
    const fs = new MemoryFs();
    const { store: rules } = await JsonlStore.open<HintRule>({ fs, path: '/r.jsonl', validate: validateRule });
    const { store: tickets } = await JsonlStore.open<EscalationTicket>({ fs, path: '/t.jsonl', validate: validateTicket });
    const tiers = createHintTiers({ config: { archiveUrl: 'http://127.0.0.1:9', hintsLocal: false }, characters: { current: undefined }, tickets, rules });
    expect((await tiers.addRule({ title: 'Hall', commands: ['look'], source: 'owner' })).ok).toBe(true);
    expect((await tiers.engine.hint({ title: 'Other' })).tier).toBe('none'); // the site is not there, and nobody is playing
  });
});
