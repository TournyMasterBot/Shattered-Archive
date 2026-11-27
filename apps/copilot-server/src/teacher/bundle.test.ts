import path from 'node:path';
import { BUNDLE_MAX_TICKETS, EXCERPT_MAX, excerpt, exportBundle, type Bundle, type BundleDeps } from './bundle';
import { REAL_NAMES, aDecision, aLesson, aTicket, openLedger, redact, type Ledger } from '../testing/teacherFixtures';

const DIR = '/data/bundles';
const file = (name: string): string => path.join(DIR, 'b1', name);

async function setup(over: Partial<BundleDeps> = {}): Promise<{ ledger: Ledger; deps: BundleDeps }> {
  const ledger = await openLedger();
  const deps: BundleDeps = {
    fs: ledger.fs,
    dir: DIR,
    tickets: ledger.tickets,
    decisions: ledger.decisions,
    lessons: ledger.lessons,
    redact,
    now: () => 5_000,
    newId: () => 'b1',
    ...over,
  };
  return { ledger, deps };
}

const bundleFiles = (ledger: Ledger): string[] => [...ledger.fs.files.keys()].filter((p) => p.startsWith(path.join(DIR)));

describe('exportBundle: privacy (N1)', () => {
  it('exports with no registered name anywhere: tells, room lines, decisions and lessons all go through the replacement', async () => {
    const { ledger, deps } = await setup();
    await ledger.tickets.append(
      aTicket({
        summary: "Zorvak tells you 'open the door' in the room where Mirelle waits.",
        situationKey: 'exploration:zorvak-hall',
        decisionId: 'd1',
      }),
    );
    await ledger.decisions.append(aDecision({ command: 'tell Zorvak hello', why: 'MIRELLE said so, ask zorvak.' }));
    await ledger.lessons.append(aLesson({ rule: 'When Zorvak asks, answer Mirelle first.' }));

    const result = await exportBundle(deps);
    expect(result.ok && result.written).toBe(true);

    const files = bundleFiles(ledger);
    expect(files.sort()).toEqual([file('bundle.json'), file('summary.md')].sort());
    for (const file of files) {
      const text = (ledger.fs.files.get(file) as string).toLowerCase();
      for (const name of REAL_NAMES) expect(text).not.toContain(name.toLowerCase());
      expect(text).toContain('orion-m');
    }
    // and the same text comes back to the caller
    const body = JSON.stringify(result);
    for (const name of REAL_NAMES) expect(body.toLowerCase()).not.toContain(name.toLowerCase());
  });

  it('turns a name that is not registered into <name> where the game prints a player name', async () => {
    const { ledger, deps } = await setup();
    await ledger.tickets.append(aTicket({ summary: "Bram tells you 'go north now'." }));
    const result = await exportBundle(deps);
    expect(result.ok && result.written && result.bundle.tickets[0].summary).toBe("<name> tells you 'go north now'.");
  });

  it('cuts after the replacement, so a name at the cut is never leaked in part', async () => {
    const { ledger, deps } = await setup();
    await ledger.tickets.append(aTicket({ summary: `${'x'.repeat(EXCERPT_MAX - 6)} Zorvak follows` }));
    const result = await exportBundle(deps);
    const summary = result.ok && result.written ? result.bundle.tickets[0].summary : '';
    expect(summary.length).toBeLessThanOrEqual(EXCERPT_MAX);
    expect(summary.toLowerCase()).not.toContain('zorv');
  });
});

describe('exportBundle: what goes in', () => {
  it('holds the ticket, the decision it came from and the lessons proposed for the same situation, and nothing else', async () => {
    const { ledger, deps } = await setup();
    await ledger.tickets.append(aTicket({ decisionId: 'd1' }));
    await ledger.decisions.append(aDecision());
    await ledger.decisions.append(aDecision({ id: 'd2', command: 'something else' }));
    await ledger.lessons.append(aLesson());
    await ledger.lessons.append(aLesson({ id: 'l2', status: 'accepted' })); // already settled
    await ledger.lessons.append(aLesson({ id: 'l3', situationKey: 'exploration:other' })); // another situation
    await ledger.lessons.append(aLesson({ id: 'l4', sphere: 'world' })); // another sphere

    const result = await exportBundle(deps);
    expect(result.ok && result.written).toBe(true);
    const bundle = (result as { bundle: Bundle }).bundle;
    expect(bundle).toMatchObject({ version: 1, id: 'b1', createdAt: 5000, ticketCount: 1, truncated: false });
    expect(bundle.tickets[0]).toEqual({
      id: 't1',
      createdAt: 1000,
      character: 'Agate-F',
      reason: 'correction-not-understood',
      sphere: 'interaction',
      kind: 'interact',
      situationKey: 'exploration:hall-door',
      status: 'open',
      summary: 'The agent did not understand the correction.',
      decision: { id: 'd1', outcome: 'corrected', command: 'open door', why: 'The door is closed.' },
      proposedLessons: [{ id: 'l1', rule: 'Open the door before moving north.', scope: 'shared', world: 'dsl' }],
    });
    // the file is the same bundle
    expect(JSON.parse(ledger.fs.files.get(file('bundle.json')) as string)).toEqual(bundle);
  });

  it('leaves the decision out when the ticket has none, or the decision is gone, and leaves out an absent command or why', async () => {
    const { ledger, deps } = await setup();
    await ledger.tickets.append(aTicket({ id: 't1' }));
    await ledger.tickets.append(aTicket({ id: 't2', decisionId: 'gone', createdAt: 1001 }));
    await ledger.tickets.append(aTicket({ id: 't3', decisionId: 'd9', createdAt: 1002 }));
    await ledger.decisions.append({ id: 'd9', suggestionId: 's9', character: 'Agate-F', at: 1, outcome: 'rejected' });
    const result = await exportBundle(deps);
    const tickets = (result as { bundle: Bundle }).bundle.tickets;
    expect('decision' in tickets[0]).toBe(false);
    expect('decision' in tickets[1]).toBe(false);
    expect(tickets[2].decision).toEqual({ id: 'd9', outcome: 'rejected' });
  });

  it('exports the open tickets only, oldest first, and says so when there are more than fit', async () => {
    const { ledger, deps } = await setup();
    for (let i = 0; i < BUNDLE_MAX_TICKETS + 5; i += 1) await ledger.tickets.append(aTicket({ id: `t${i}`, createdAt: 1000 + i }));
    await ledger.tickets.append(aTicket({ id: 'done', createdAt: 1, status: 'resolved' }));
    const result = await exportBundle(deps);
    const bundle = (result as { bundle: Bundle }).bundle;
    expect(bundle.ticketCount).toBe(BUNDLE_MAX_TICKETS);
    expect(bundle.truncated).toBe(true);
    expect(bundle.tickets[0].id).toBe('t0');
    expect(bundle.tickets.at(-1)?.id).toBe(`t${BUNDLE_MAX_TICKETS - 1}`);
    expect(bundle.tickets.some((t) => t.id === 'done')).toBe(false);
    expect((result as { summary: string }).summary).toContain('more are open');
  });

  it('bounds every free-text field, so one huge correction cannot make a huge bundle', async () => {
    const { ledger, deps } = await setup();
    const long = 'word '.repeat(2000);
    await ledger.tickets.append(aTicket({ summary: long.slice(0, 500), decisionId: 'd1' }));
    await ledger.decisions.append(aDecision({ why: long.slice(0, 500), command: long.slice(0, 200) }));
    await ledger.lessons.append(aLesson({ rule: long.slice(0, 500) }));
    const bundle = ((await exportBundle(deps)) as { bundle: Bundle }).bundle;
    const t = bundle.tickets[0];
    for (const text of [t.summary, t.decision?.why ?? '', t.decision?.command ?? '', t.proposedLessons[0].rule]) expect(text.length).toBeLessThanOrEqual(EXCERPT_MAX);
    expect(t.decision?.why?.endsWith('…')).toBe(true);
    expect((ledger.fs.files.get(file('bundle.json')) as string).length).toBeLessThan(5000);
  });

  it('exports named tickets whatever their status, once each', async () => {
    const { ledger, deps } = await setup();
    await ledger.tickets.append(aTicket({ id: 't1', status: 'resolved' }));
    await ledger.tickets.append(aTicket({ id: 't2' }));
    const result = await exportBundle(deps, { ticketIds: ['t1', 't1', 't2'] });
    expect((result as { bundle: Bundle }).bundle.tickets.map((t) => t.id)).toEqual(['t1', 't2']);
  });

  it('summary.md says how many tickets, by reason, and describes each one', async () => {
    const { ledger, deps } = await setup();
    await ledger.tickets.append(aTicket({ id: 't1', decisionId: 'd1' }));
    await ledger.tickets.append(aTicket({ id: 't2', reason: 'low-confidence', createdAt: 1001 }));
    await ledger.tickets.append(aTicket({ id: 't3', reason: 'low-confidence', createdAt: 1002 }));
    await ledger.decisions.append(aDecision());
    await ledger.lessons.append(aLesson());
    const summary = ledger.fs.files.get(file('summary.md')) ?? '';
    expect(summary).toBe(''); // nothing yet
    await exportBundle(deps);
    const text = ledger.fs.files.get(file('summary.md')) as string;
    expect(text).toContain('# Copilot audit bundle b1');
    expect(text).toContain('3 tickets.');
    expect(text).toContain('- low-confidence: 2');
    expect(text).toContain('- correction-not-understood: 1');
    expect(text).toContain('### t1: correction-not-understood (interaction / interact)');
    expect(text).toContain("Decision d1: corrected, command `open door`, owner's why: The door is closed.");
    expect(text).toContain('Proposed lesson l1 (shared, dsl): Open the door before moving north.');
    expect(text).toContain('Do not look for, guess or write a real name');
  });

  it('says "1 ticket" for one, and a decision without a command or why reads cleanly', async () => {
    const { ledger, deps } = await setup();
    await ledger.tickets.append(aTicket({ decisionId: 'd9' }));
    await ledger.decisions.append({ id: 'd9', suggestionId: 's9', character: 'Agate-F', at: 1, outcome: 'rejected' });
    await exportBundle(deps);
    const text = ledger.fs.files.get(file('summary.md')) as string;
    expect(text).toContain('1 ticket.');
    expect(text).toContain('- Decision d9: rejected\n');
  });
});

describe('exportBundle: persona feedback', () => {
  const feedback = (over: Partial<Parameters<typeof aTicket>[0]> = {}) =>
    aTicket({
      id: 'pf1',
      reason: 'persona-feedback',
      kind: 'unknown',
      situationKey: 'persona:Agate-F',
      summary: 'Persona feedback for Agate-F; field: voice; why: She never talks like Zorvak does.',
      ...over,
    });

  it('shows the character, the field and the why as a structured entry, with names replaced and the summary line as the ticket has it', async () => {
    const { ledger, deps } = await setup();
    await ledger.tickets.append(feedback());
    const result = await exportBundle(deps);
    const entry = (result as { bundle: Bundle }).bundle.tickets[0];
    expect(entry.persona).toEqual({ codename: 'Agate-F', field: 'voice', why: 'She never talks like Orion-M does.' });
    const summary = (result as { summary: string }).summary;
    expect(summary).toContain('- Persona feedback for Agate-F, field voice: She never talks like Orion-M does.');
    for (const text of [JSON.stringify(result)]) expect(text.toLowerCase()).not.toContain('zorvak');
  });

  it('cuts a long why like every other text', async () => {
    const { ledger, deps } = await setup();
    await ledger.tickets.append(feedback({ summary: `Persona feedback for Agate-F; field: stance; why: ${'word '.repeat(80).trim()}` }));
    const entry = ((await exportBundle(deps)) as { bundle: Bundle }).bundle.tickets[0];
    expect(entry.persona?.why.length).toBeLessThanOrEqual(EXCERPT_MAX);
    expect(entry.persona?.why.endsWith('…')).toBe(true);
  });

  it('other tickets have no persona entry, and a persona-feedback ticket with a summary that does not parse has none either', async () => {
    const { ledger, deps } = await setup();
    await ledger.tickets.append(aTicket({ id: 'plain' }));
    // stored before the format was enforced: still exported, without a structured entry
    ledger.fs.files.set('/ledger/tickets.jsonl', `${ledger.fs.files.get('/ledger/tickets.jsonl') ?? ''}${JSON.stringify({ v: 1, r: { ...feedback({ id: 'old', createdAt: 1001 }), summary: 'free text' } })}\n`);
    const reopened = await openLedger(ledger.fs);
    const result = await exportBundle({ ...deps, tickets: reopened.tickets, decisions: reopened.decisions, lessons: reopened.lessons });
    expect((result as { bundle: Bundle }).bundle.tickets.map((t) => t.id)).toEqual(['plain']); // the invalid line is skipped on load
  });
});

describe('exportBundle: when it writes nothing', () => {
  it('an empty queue writes nothing, not even a folder', async () => {
    const { ledger, deps } = await setup();
    await ledger.tickets.append(aTicket({ status: 'resolved' }));
    expect(await exportBundle(deps)).toEqual({ ok: true, written: false, reason: 'no-open-tickets' });
    expect(await exportBundle(deps, { ticketIds: [] })).toEqual({ ok: true, written: false, reason: 'no-open-tickets' });
    expect(bundleFiles(ledger)).toEqual([]);
  });

  it('an unknown ticket id writes nothing', async () => {
    const { ledger, deps } = await setup();
    await ledger.tickets.append(aTicket());
    expect(await exportBundle(deps, { ticketIds: ['t1', 'nope'] })).toEqual({ ok: false, error: 'unknown-ticket' });
    expect(bundleFiles(ledger)).toEqual([]);
  });

  it('too many named tickets writes nothing', async () => {
    const { ledger, deps } = await setup();
    const ids = Array.from({ length: BUNDLE_MAX_TICKETS + 1 }, (_, i) => `t${i}`);
    expect(await exportBundle(deps, { ticketIds: ids })).toEqual({ ok: false, error: 'too-many-tickets' });
    expect(bundleFiles(ledger)).toEqual([]);
  });

  it('a disk that fails is reported, not thrown', async () => {
    const { ledger, deps } = await setup();
    await ledger.tickets.append(aTicket());
    ledger.fs.failPathEnding = 'bundle.json';
    expect(await exportBundle(deps)).toEqual({ ok: false, error: 'write-failed' });
    ledger.fs.failPathEnding = 'summary.md';
    expect(await exportBundle(deps, {})).toEqual({ ok: false, error: 'write-failed' });
  });

  it('never overwrites a bundle that exists', async () => {
    const { ledger, deps } = await setup();
    await ledger.tickets.append(aTicket());
    ledger.fs.files.set(file('bundle.json'), 'earlier');
    expect(await exportBundle(deps)).toEqual({ ok: false, error: 'write-failed' });
    expect(ledger.fs.files.get(file('bundle.json'))).toBe('earlier');
  });

  it('gives each bundle an id of its own by default', async () => {
    const { ledger, deps } = await setup({ newId: undefined });
    await ledger.tickets.append(aTicket());
    const a = await exportBundle(deps);
    const b = await exportBundle(deps);
    expect(a.ok && a.written && b.ok && b.written && a.id !== b.id).toBe(true);
    expect(a.ok && a.written && a.id).toMatch(/^b-[0-9a-z]+-[0-9a-z]+$/);
  });
});

describe('excerpt', () => {
  it('collapses white space to single spaces and trims', () => {
    expect(excerpt('  a \n\n b\t c  ', (t) => t)).toBe('a b c');
  });
});
