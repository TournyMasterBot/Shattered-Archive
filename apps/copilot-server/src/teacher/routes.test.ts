import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Decision, Suggestion } from '@shatteredarchive/copilot-core';
import { createApp, type AppDeps, type RequestLogEntry } from '../app';
import { createTeacher, type TeacherApi } from './service';
import { REAL_NAMES, aDecision, aFinding, aTicket, openLedger, redact } from '../testing/teacherFixtures';

const ORIGIN = 'https://game-client.shatteredarchive.dev';

interface Harness {
  base: string;
  logs: RequestLogEntry[];
  close: () => Promise<void>;
}

async function start(overrides: Partial<AppDeps> & { teacher?: TeacherApi } = {}): Promise<{ h: Harness; deps: AppDeps }> {
  const ledger = await openLedger();
  const logs: RequestLogEntry[] = [];
  const deps: AppDeps = {
    allowedOrigins: [ORIGIN],
    stores: { decisions: ledger.decisions, tickets: ledger.tickets, lessons: ledger.lessons },
    version: '9.9.9',
    startedAt: 0,
    log: (entry) => logs.push(entry),
    ...overrides,
  };
  const server: Server = createApp(deps).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  return { h: { base: `http://127.0.0.1:${port}`, logs, close: () => new Promise<void>((resolve) => server.close(() => resolve())) }, deps };
}

const post = (body: unknown, extra: Record<string, string> = {}): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...extra },
  body: JSON.stringify(body),
});

let current: Harness | undefined;
afterEach(async () => {
  await current?.close();
  current = undefined;
});

/** A teacher whose answers the test chooses; it records what the HTTP layer asked of it. */
function fakeTeacher(answers: Partial<Record<keyof TeacherApi, unknown>> = {}) {
  const calls: { method: string; args: unknown[] }[] = [];
  const make =
    (method: keyof TeacherApi) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
      const answer = answers[method];
      return typeof answer === 'function' ? (answer as (...a: unknown[]) => unknown)(...args) : answer;
    };
  const teacher = {
    exportBundle: make('exportBundle'),
    importFinding: make('importFinding'),
    acceptTicket: make('acceptTicket'),
    listFindings: make('listFindings'),
    metrics: make('metrics'),
    recordOccurrence: make('recordOccurrence'),
  } as unknown as TeacherApi;
  return { teacher, calls };
}

describe('the teaching routes without a teacher', () => {
  it.each([
    ['POST', '/bundles'],
    ['POST', '/findings'],
    ['GET', '/findings'],
    ['POST', '/tickets/t1/accept'],
    ['GET', '/metrics/training'],
  ])('%s %s answers 503', async (method, path) => {
    const { h } = await start();
    current = h;
    const res = await fetch(`${h.base}${path}`, method === 'POST' ? post({ acceptedBy: 'owner' }) : undefined);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'teaching side not available' });
  });
});

describe('POST /bundles', () => {
  const written = { ok: true, written: true, id: 'b1', dir: '/data/bundles/b1', bundle: { ticketCount: 2, truncated: false, tickets: [] }, summary: '# s' };

  it('exports the open tickets when the body is empty, and returns the bundle without the server’s own path', async () => {
    const { teacher, calls } = fakeTeacher({ exportBundle: async () => written });
    const { h } = await start({ teacher });
    current = h;
    const res = await fetch(`${h.base}/bundles`, { method: 'POST' });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ written: true, id: 'b1', folder: 'bundles/b1', tickets: 2, truncated: false, bundle: written.bundle, summary: '# s' });
    expect(calls).toEqual([{ method: 'exportBundle', args: [undefined] }]);
    expect(h.logs).toEqual([{ method: 'POST', route: '/bundles', status: 201 }]);
  });

  it('passes the ticket ids it was given, and accepts an empty object', async () => {
    const { teacher, calls } = fakeTeacher({ exportBundle: async () => written });
    const { h } = await start({ teacher });
    current = h;
    await fetch(`${h.base}/bundles`, post({ ticketIds: ['t1', 't2'] }));
    await fetch(`${h.base}/bundles`, post({}));
    expect(calls.map((c) => c.args)).toEqual([[['t1', 't2']], [undefined]]);
  });

  it('says nothing was written when the queue is empty', async () => {
    const { teacher } = fakeTeacher({ exportBundle: async () => ({ ok: true, written: false, reason: 'no-open-tickets' }) });
    const { h } = await start({ teacher });
    current = h;
    const res = await fetch(`${h.base}/bundles`, post({}));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ written: false, tickets: 0 });
  });

  it.each([
    [{ ticketIds: 'not a list' }],
    [{ ticketIds: [1] }],
    [{ ticketIds: ['../x'] }],
    [{ ticketIds: [{}] }],
  ])('refuses ticketIds %j with 400', async (body) => {
    const { teacher, calls } = fakeTeacher();
    const { h } = await start({ teacher });
    current = h;
    const res = await fetch(`${h.base}/bundles`, post(body));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'ticketIds must be a list of ticket ids' });
    expect(calls).toEqual([]);
  });

  it('refuses an unknown field and a body that is not an object', async () => {
    const { teacher, calls } = fakeTeacher();
    const { h } = await start({ teacher });
    current = h;
    expect(await (await fetch(`${h.base}/bundles`, post({ extra: 1 }))).json()).toEqual({ error: 'unknown field' });
    expect(await (await fetch(`${h.base}/bundles`, post([]))).json()).toEqual({ error: 'body must be an object' });
    expect(await (await fetch(`${h.base}/bundles`, post(null))).json()).toEqual({ error: 'invalid json' }); // the strict parser answers first
    expect(calls).toEqual([]);
  });

  it.each([
    ['unknown-ticket', 404, 'unknown ticket'],
    ['too-many-tickets', 400, 'too many tickets for one bundle'],
    ['write-failed', 500, 'could not write the bundle'],
  ])('maps %s to %i', async (error, status, message) => {
    const { teacher } = fakeTeacher({ exportBundle: async () => ({ ok: false, error }) });
    const { h } = await start({ teacher });
    current = h;
    const res = await fetch(`${h.base}/bundles`, post({}));
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error: message });
  });

  it('is refused for a foreign origin', async () => {
    const { teacher, calls } = fakeTeacher();
    const { h } = await start({ teacher });
    current = h;
    expect((await fetch(`${h.base}/bundles`, post({}, { Origin: 'https://evil.example' }))).status).toBe(403);
    expect(calls).toEqual([]);
  });
});

describe('POST /findings and GET /findings', () => {
  it.each([
    [{ ok: true, id: 'f1', written: true }, 201, { ok: true, id: 'f1', written: true }],
    [{ ok: true, id: 'f1', written: false }, 200, { ok: true, id: 'f1', written: false }],
    [{ ok: false, error: 'invalid', details: ['verdict is not one of the allowed values'] }, 400, { error: 'invalid finding', details: ['verdict is not one of the allowed values'] }],
    [{ ok: false, error: 'unknown-ticket' }, 404, { error: 'unknown ticket' }],
    [{ ok: false, error: 'ticket-not-open' }, 409, { error: 'the ticket is not open' }],
    [{ ok: false, error: 'id-taken' }, 409, { error: 'that finding id belongs to another ticket' }],
    [{ ok: false, error: 'write-failed' }, 500, { error: 'could not save the finding' }],
  ])('maps %j to %i', async (answer, status, body) => {
    const { teacher, calls } = fakeTeacher({ importFinding: async () => answer });
    const { h } = await start({ teacher });
    current = h;
    const sent = { id: 'f1' };
    const res = await fetch(`${h.base}/findings`, post(sent));
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual(body);
    expect(calls).toEqual([{ method: 'importFinding', args: [sent] }]);
  });

  it('lists findings with a limit, and refuses a bad one', async () => {
    const { teacher, calls } = fakeTeacher({ listFindings: () => [aFinding()] });
    const { h } = await start({ teacher });
    current = h;
    expect(await (await fetch(`${h.base}/findings?limit=5`)).json()).toEqual({ findings: [aFinding()] });
    await fetch(`${h.base}/findings`);
    expect(calls.map((c) => c.args)).toEqual([[5], [100]]);
    expect((await fetch(`${h.base}/findings?limit=0`)).status).toBe(400);
    expect((await fetch(`${h.base}/findings?limit=abc`)).status).toBe(400);
  });
});

describe('POST /tickets/:id/accept', () => {
  it('needs the body to say the owner accepts, and nothing else', async () => {
    const { teacher, calls } = fakeTeacher({ acceptTicket: async () => ({ ok: true, written: true, lessonsChanged: 0 }) });
    const { h } = await start({ teacher });
    current = h;
    for (const body of [{}, { acceptedBy: 'claude' }, { acceptedBy: 'owner', extra: 1 }, []]) {
      const res = await fetch(`${h.base}/tickets/t1/accept`, post(body));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'the body must be {"acceptedBy":"owner"}' });
    }
    expect((await fetch(`${h.base}/tickets/t1/accept`, { method: 'POST' })).status).toBe(400);
    expect((await fetch(`${h.base}/tickets/t1/accept`, post('owner'))).status).toBe(400); // not JSON an object: the strict parser refuses it
    expect((await fetch(`${h.base}/tickets/t1/accept`, post(null))).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it('refuses an id that is not an id', async () => {
    const { teacher, calls } = fakeTeacher();
    const { h } = await start({ teacher });
    current = h;
    const res = await fetch(`${h.base}/tickets/a%20b/accept`, post({ acceptedBy: 'owner' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid ticket id' });
    expect(calls).toEqual([]);
  });

  it.each([
    [{ ok: true, written: true, lessonsChanged: 2 }, 200, { ok: true, written: true, lessonsChanged: 2 }],
    [{ ok: true, written: false, lessonsChanged: 0 }, 200, { ok: true, written: false, lessonsChanged: 0 }],
    [{ ok: false, error: 'unknown-ticket' }, 404, { error: 'unknown ticket' }],
    [{ ok: false, error: 'no-finding' }, 409, { error: 'the ticket has no finding to accept' }],
    [{ ok: false, error: 'write-failed' }, 500, { error: 'could not save the acceptance' }],
  ])('maps %j to %i', async (answer, status, body) => {
    const { teacher, calls } = fakeTeacher({ acceptTicket: async () => answer });
    const { h } = await start({ teacher });
    current = h;
    const res = await fetch(`${h.base}/tickets/t1/accept`, post({ acceptedBy: 'owner' }));
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual(body);
    expect(calls).toEqual([{ method: 'acceptTicket', args: ['t1'] }]);
    expect(h.logs.at(-1)?.route).toBe('/tickets/:id/accept');
  });
});

describe('GET /metrics/training', () => {
  it('returns what the teacher computed, and never logs a body', async () => {
    const { teacher } = fakeTeacher({ metrics: () => ({ totals: { open: 1 }, scenarios: [] }) });
    const { h } = await start({ teacher });
    current = h;
    expect(await (await fetch(`${h.base}/metrics/training`)).json()).toEqual({ totals: { open: 1 }, scenarios: [] });
    expect(h.logs).toEqual([{ method: 'GET', route: '/metrics/training', status: 200 }]);
  });
});

describe('the whole loop over HTTP, with the real teacher', () => {
  const suggestion: Suggestion = {
    id: 's1',
    character: 'Agate-F',
    createdAt: 5,
    mode: 'exploration',
    sphere: 'interaction',
    kind: 'interact',
    command: 'open door',
    rationale: 'The door is closed.',
    confidence: 0.9,
    confidenceSource: 'model',
    situationKey: 'exploration:hall-door',
  };

  it('a ticket becomes a bundle, a finding and an acceptance; ten approvals later the scenario has graduated', async () => {
    const ledger = await openLedger();
    const teacher = createTeacher({ ...ledger, dataDir: '/data', redact, now: () => 50_000 });
    const { h } = await start({
      teacher,
      stores: { decisions: ledger.decisions, tickets: ledger.tickets, lessons: ledger.lessons },
      onDecision: async (d: Decision) => void (await teacher.recordOccurrence(d, suggestion)),
    });
    current = h;
    await ledger.tickets.append(aTicket({ summary: "Zorvak tells you 'knock first'." }));
    const metrics = async () => (await (await fetch(`${h.base}/metrics/training`)).json()) as { totals: Record<string, number>; scenarios: Record<string, unknown>[] };

    expect((await metrics()).totals).toMatchObject({ open: 1, accepted: 0, graduated: 0, claudeNeeded: 1 });

    const bundle = await fetch(`${h.base}/bundles`, post({}));
    expect(bundle.status).toBe(201);
    const bundleBody = await bundle.text();
    for (const name of REAL_NAMES) expect(bundleBody.toLowerCase()).not.toContain(name.toLowerCase());

    expect((await fetch(`${h.base}/findings`, post(aFinding({ acceptedBy: 'owner', acceptedAt: 1 })))).status).toBe(400); // cannot arrive accepted
    expect((await fetch(`${h.base}/findings`, post(aFinding()))).status).toBe(201);
    expect((await metrics()).totals).toMatchObject({ open: 0, resolved: 1, findingsAccepted: 0, accepted: 0 });

    expect((await fetch(`${h.base}/tickets/t1/accept`, post({ acceptedBy: 'owner' }))).status).toBe(200);
    expect((await metrics()).totals).toMatchObject({ accepted: 1, graduated: 0 });

    for (let i = 0; i < 10; i += 1) {
      const d = aDecision({ id: `d${i}`, suggestionId: 's1', at: 60_000 + i, outcome: 'approved' });
      expect((await fetch(`${h.base}/decisions`, post(d))).status).toBe(201);
    }
    await new Promise((resolve) => setTimeout(resolve, 20)); // onDecision runs after the answer
    const after = await metrics();
    expect(after.totals).toMatchObject({ graduated: 1, claudeNeeded: 1 });
    expect(after.scenarios[0]).toMatchObject({ graduated: true, remainingToGraduate: null });
  });
});
