import path from 'node:path';
import type { Decision, Suggestion } from '@shatteredarchive/copilot-core';
import { createTeacher, type TeacherApi } from './service';
import { REAL_NAMES, aDecision, aFinding, aTicket, openLedger, redact, type Ledger } from '../testing/teacherFixtures';

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

async function setup(): Promise<{ ledger: Ledger; teacher: TeacherApi }> {
  const ledger = await openLedger();
  const teacher = createTeacher({ ...ledger, dataDir: '/data', redact, now: () => 7_000, newBundleId: () => 'b1' });
  return { ledger, teacher };
}

describe('createTeacher', () => {
  it('writes a bundle into the data folder under bundles/', async () => {
    const { ledger, teacher } = await setup();
    await ledger.tickets.append(aTicket());
    const result = await teacher.exportBundle();
    expect(result).toMatchObject({ ok: true, written: true, id: 'b1' });
    expect(ledger.fs.files.has(path.join('/data', 'bundles', 'b1', 'bundle.json'))).toBe(true);
    expect(await teacher.exportBundle(['nope'])).toEqual({ ok: false, error: 'unknown-ticket' });
  });

  it('imports a finding and accepts it, and the metrics show the movement', async () => {
    const { ledger, teacher } = await setup();
    await ledger.tickets.append(aTicket());
    expect(teacher.metrics().totals).toMatchObject({ open: 1, resolved: 0, accepted: 0 });
    expect(await teacher.importFinding(aFinding())).toMatchObject({ ok: true });
    expect(teacher.metrics().totals).toMatchObject({ open: 0, resolved: 1, findings: 1, findingsAccepted: 0, accepted: 0 });
    expect(await teacher.acceptTicket('t1')).toMatchObject({ ok: true, written: true });
    expect(teacher.metrics().totals).toMatchObject({ findingsAccepted: 1, accepted: 1, graduated: 0 });
    expect(teacher.metrics().scenarios[0]).toMatchObject({ remainingToGraduate: 10 });
  });

  it('lists findings newest first, up to the limit', async () => {
    const { ledger, teacher } = await setup();
    for (const n of [1, 2, 3]) {
      await ledger.tickets.append(aTicket({ id: `t${n}`, situationKey: `s${n}` }));
      await teacher.importFinding(aFinding({ id: `f${n}`, ticketId: `t${n}`, createdAt: 2000 + n }));
    }
    expect(teacher.listFindings(2).map((f) => f.id)).toEqual(['f3', 'f2']);
    expect(teacher.listFindings(10)).toHaveLength(3);
  });

  it('puts a room title with a name in the situation key through the replacement in the metrics', async () => {
    const { ledger, teacher } = await setup();
    await ledger.tickets.append(aTicket({ situationKey: 'exploration:zorvak-hall' }));
    const text = JSON.stringify(teacher.metrics());
    for (const name of REAL_NAMES) expect(text.toLowerCase()).not.toContain(name.toLowerCase());
    expect(text).toContain('Orion-M');
  });

  it.each(['approved', 'auto'] as const)('records an occurrence when the owner took the suggestion (%s)', async (outcome) => {
    const { ledger, teacher } = await setup();
    const decision: Decision = aDecision({ id: `d-${outcome}`, outcome, command: 'open door', rule: 'interaction:interact' });
    expect(await teacher.recordOccurrence(decision, suggestion)).toBe(true);
    expect(ledger.occurrences.get(`d-${outcome}`)).toEqual({ id: `d-${outcome}`, at: 1050, sphere: 'interaction', kind: 'interact', situationKey: 'exploration:hall-door' });
  });

  it('records nothing for a correction, a rejection, a refusal, or a suggestion it no longer knows', async () => {
    const { ledger, teacher } = await setup();
    for (const outcome of ['corrected', 'rejected', 'refused'] as const) {
      expect(await teacher.recordOccurrence(aDecision({ id: `d-${outcome}`, outcome, rule: 'user-typing' }), suggestion)).toBe(false);
    }
    expect(await teacher.recordOccurrence(aDecision({ id: 'd-x', outcome: 'approved' }), undefined)).toBe(false);
    expect(ledger.occurrences.query()).toEqual([]);
  });

  it('counts a retried decision once, and reports a ledger that could not be written', async () => {
    const { ledger, teacher } = await setup();
    const decision = aDecision({ outcome: 'approved' });
    expect(await teacher.recordOccurrence(decision, suggestion)).toBe(true);
    expect(await teacher.recordOccurrence(decision, suggestion)).toBe(false);
    ledger.fs.failPathEnding = 'occurrences.jsonl';
    expect(await teacher.recordOccurrence(aDecision({ id: 'd2', outcome: 'approved' }), suggestion)).toBe(false);
  });
});

describe('createTeacher: the whole loop', () => {
  it('ticket, bundle, finding, acceptance, then ten approved occurrences graduate the scenario', async () => {
    const { ledger, teacher } = await setup();
    await ledger.tickets.append(aTicket({ createdAt: 1000 }));
    await teacher.exportBundle();
    await teacher.importFinding(aFinding());
    await teacher.acceptTicket('t1');
    for (let i = 0; i < 10; i += 1) {
      expect(await teacher.recordOccurrence(aDecision({ id: `d${i}`, at: 20_000 + i, outcome: 'approved' }), suggestion)).toBe(true);
    }
    expect(teacher.metrics().totals).toMatchObject({ graduated: 1, claudeNeeded: 1 });
  });
});
