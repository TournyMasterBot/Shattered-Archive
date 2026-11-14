import { acceptTicket, importFinding, type FindingDeps } from './findings';
import { aFinding, aLesson, aTicket, openLedger, redact, type Ledger } from '../testing/teacherFixtures';

async function setup(): Promise<{ ledger: Ledger; deps: FindingDeps }> {
  const ledger = await openLedger();
  const deps: FindingDeps = { findings: ledger.findings, tickets: ledger.tickets, lessons: ledger.lessons, redact, now: () => 9_000 };
  return { ledger, deps };
}

describe('importFinding', () => {
  it('stores a valid finding unaccepted and resolves its ticket with a pointer to it', async () => {
    const { ledger, deps } = await setup();
    await ledger.tickets.append(aTicket());
    expect(await importFinding(deps, aFinding())).toEqual({ ok: true, id: 'f1', written: true });
    expect(ledger.findings.get('f1')).toEqual(aFinding());
    expect(ledger.findings.get('f1')?.acceptedBy).toBeNull();
    expect(ledger.tickets.get('t1')).toMatchObject({ status: 'resolved', resolution: 'Finding f1: data-gap' });
  });

  it('replaces registered names in the why before storing it, whatever case', async () => {
    const { ledger, deps } = await setup();
    await ledger.tickets.append(aTicket());
    await importFinding(deps, aFinding({ why: 'ZORVAK asked Mirelle, and Bram tells you hi.' }));
    const stored = ledger.findings.get('f1')?.why ?? '';
    expect(stored.toLowerCase()).not.toContain('zorvak');
    expect(stored.toLowerCase()).not.toContain('mirelle');
    expect(stored).toContain('Orion-M');
  });

  it('rejects an invalid finding with every problem and stores nothing', async () => {
    const { ledger, deps } = await setup();
    await ledger.tickets.append(aTicket());
    const result = await importFinding(deps, { ...aFinding(), verdict: 'maybe', why: '' });
    expect(result).toEqual({ ok: false, error: 'invalid', details: ['verdict is not one of the allowed values', 'why must not be empty'] });
    expect(ledger.findings.query()).toEqual([]);
    expect(ledger.tickets.get('t1')?.status).toBe('open');
    expect(await importFinding(deps, 'not an object')).toEqual({ ok: false, error: 'invalid', details: ['body must be an object'] });
  });

  it('a finding cannot arrive accepted: only the owner accepts', async () => {
    const { ledger, deps } = await setup();
    await ledger.tickets.append(aTicket());
    const result = await importFinding(deps, aFinding({ acceptedBy: 'owner', acceptedAt: 5 }));
    expect(result).toEqual({ ok: false, error: 'invalid', details: ['a finding cannot arrive accepted: only the owner accepts it'] });
    expect(ledger.findings.query()).toEqual([]);
  });

  it('refuses a finding for a ticket that does not exist, or is not open', async () => {
    const { ledger, deps } = await setup();
    expect(await importFinding(deps, aFinding())).toEqual({ ok: false, error: 'unknown-ticket' });
    await ledger.tickets.append(aTicket({ status: 'resolved' }));
    expect(await importFinding(deps, aFinding())).toEqual({ ok: false, error: 'ticket-not-open' });
    await ledger.tickets.append(aTicket({ id: 't2', status: 'declined' }));
    expect(await importFinding(deps, aFinding({ ticketId: 't2' }))).toEqual({ ok: false, error: 'ticket-not-open' });
    expect(ledger.findings.query()).toEqual([]);
  });

  it('a finding id that belongs to another ticket is refused', async () => {
    const { ledger, deps } = await setup();
    await ledger.tickets.append(aTicket({ id: 't1' }));
    await ledger.tickets.append(aTicket({ id: 't2', createdAt: 1001 }));
    await importFinding(deps, aFinding());
    expect(await importFinding(deps, aFinding({ ticketId: 't2' }))).toEqual({ ok: false, error: 'id-taken' });
    expect(ledger.tickets.get('t2')?.status).toBe('open');
  });

  it('importing the same finding again changes nothing', async () => {
    const { ledger, deps } = await setup();
    await ledger.tickets.append(aTicket());
    await importFinding(deps, aFinding());
    expect(await importFinding(deps, aFinding())).toEqual({ ok: true, id: 'f1', written: false });
    expect(ledger.findings.query()).toHaveLength(1);
  });

  it('a later copy never replaces a finding the owner has accepted', async () => {
    const { ledger, deps } = await setup();
    await ledger.tickets.append(aTicket());
    await importFinding(deps, aFinding());
    await acceptTicket(deps, 't1');
    expect(await importFinding(deps, aFinding({ why: 'A different story.' }))).toEqual({ ok: true, id: 'f1', written: false });
    expect(ledger.findings.get('f1')).toMatchObject({ acceptedBy: 'owner', why: 'The expert has no entry for this door.' });
  });

  it('a failure to save the finding leaves the ticket open; a failure to resolve it is finished by a retry', async () => {
    const { ledger, deps } = await setup();
    await ledger.tickets.append(aTicket());
    ledger.fs.failPathEnding = 'findings.jsonl';
    expect(await importFinding(deps, aFinding())).toEqual({ ok: false, error: 'write-failed' });
    expect(ledger.tickets.get('t1')?.status).toBe('open');

    ledger.fs.failPathEnding = 'tickets.jsonl';
    expect(await importFinding(deps, aFinding())).toEqual({ ok: false, error: 'write-failed' });
    expect(ledger.findings.get('f1')).toBeDefined();
    expect(ledger.tickets.get('t1')?.status).toBe('open');

    ledger.fs.failPathEnding = undefined;
    expect(await importFinding(deps, aFinding())).toEqual({ ok: true, id: 'f1', written: false });
    expect(ledger.tickets.get('t1')?.status).toBe('resolved');
  });
});

describe('acceptTicket', () => {
  it('records the owner’s acceptance with its time, once', async () => {
    const { ledger, deps } = await setup();
    await ledger.tickets.append(aTicket());
    await importFinding(deps, aFinding());
    expect(await acceptTicket(deps, 't1')).toEqual({ ok: true, written: true, lessonsChanged: 0 });
    expect(ledger.findings.get('f1')).toMatchObject({ acceptedBy: 'owner', acceptedAt: 9000 });
    expect(await acceptTicket(deps, 't1')).toEqual({ ok: true, written: false, lessonsChanged: 0 });
    expect(ledger.findings.get('f1')?.acceptedAt).toBe(9000);
  });

  it('refuses a ticket that is unknown, or has no finding yet', async () => {
    const { ledger, deps } = await setup();
    expect(await acceptTicket(deps, 'nope')).toEqual({ ok: false, error: 'unknown-ticket' });
    await ledger.tickets.append(aTicket());
    expect(await acceptTicket(deps, 't1')).toEqual({ ok: false, error: 'no-finding' });
  });

  it.each([
    ['local-wrong', 'accepted'],
    ['data-gap', 'accepted'],
    ['routing-gap', 'accepted'],
    ['local-correct', 'rejected'],
  ] as const)('a %s finding settles the proposed lessons for the situation as %s, and no others', async (verdict, status) => {
    const { ledger, deps } = await setup();
    await ledger.tickets.append(aTicket());
    await ledger.lessons.append(aLesson());
    await ledger.lessons.append(aLesson({ id: 'l2', situationKey: 'exploration:other' }));
    await ledger.lessons.append(aLesson({ id: 'l3', sphere: 'world' }));
    await ledger.lessons.append(aLesson({ id: 'l4', status: 'superseded' }));
    await importFinding(deps, aFinding({ verdict }));
    expect(await acceptTicket(deps, 't1')).toEqual({ ok: true, written: true, lessonsChanged: 1 });
    expect(ledger.lessons.get('l1')?.status).toBe(status);
    expect(ledger.lessons.get('l2')?.status).toBe('proposed');
    expect(ledger.lessons.get('l3')?.status).toBe('proposed');
    expect(ledger.lessons.get('l4')?.status).toBe('superseded');
  });

  it('a persona finding says nothing about lessons', async () => {
    const { ledger, deps } = await setup();
    await ledger.tickets.append(aTicket());
    await ledger.lessons.append(aLesson());
    await importFinding(deps, aFinding({ verdict: 'persona' }));
    expect(await acceptTicket(deps, 't1')).toEqual({ ok: true, written: true, lessonsChanged: 0 });
    expect(ledger.lessons.get('l1')?.status).toBe('proposed');
  });

  it('a failure while settling the lessons leaves the finding unaccepted; a failure to save the acceptance is finished by a retry', async () => {
    const { ledger, deps } = await setup();
    await ledger.tickets.append(aTicket());
    await ledger.lessons.append(aLesson());
    await importFinding(deps, aFinding());

    ledger.fs.failPathEnding = 'lessons.jsonl';
    expect(await acceptTicket(deps, 't1')).toEqual({ ok: false, error: 'write-failed' });
    expect(ledger.findings.get('f1')?.acceptedBy).toBeNull();

    ledger.fs.failPathEnding = 'findings.jsonl';
    expect(await acceptTicket(deps, 't1')).toEqual({ ok: false, error: 'write-failed' });
    expect(ledger.lessons.get('l1')?.status).toBe('accepted'); // settled first
    expect(ledger.findings.get('f1')?.acceptedBy).toBeNull();

    ledger.fs.failPathEnding = undefined;
    expect(await acceptTicket(deps, 't1')).toEqual({ ok: true, written: true, lessonsChanged: 0 });
    expect(ledger.findings.get('f1')?.acceptedBy).toBe('owner');
  });
});
