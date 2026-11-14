import type { Finding, ScenarioOccurrence } from '@shatteredarchive/copilot-core';
import { MAX_SCENARIOS_LISTED, computeTrainingMetrics } from './metrics';
import { aFinding, aTicket } from '../testing/teacherFixtures';

const occ = (n: number, over: Partial<ScenarioOccurrence> = {}): ScenarioOccurrence => ({
  id: `o${n}`,
  at: 10_000 + n,
  sphere: 'interaction',
  kind: 'interact',
  situationKey: 'exploration:hall-door',
  ...over,
});
const accepted = (over: Partial<Finding> = {}): Finding => aFinding({ acceptedBy: 'owner', acceptedAt: 5000, ...over });
const run = (input: Parameters<typeof computeTrainingMetrics>[0]) => computeTrainingMetrics(input, 99);

describe('computeTrainingMetrics', () => {
  it('counts the tickets by status and the findings, and matches the ledger it was given', () => {
    const m = run({
      tickets: [aTicket({ id: 't1' }), aTicket({ id: 't2', status: 'resolved', situationKey: 'b' }), aTicket({ id: 't3', status: 'declined', situationKey: 'c' })],
      findings: [aFinding(), accepted({ id: 'f2', ticketId: 't2' })],
      occurrences: [],
    });
    expect(m.generatedAt).toBe(99);
    expect(m.graduationNeeds).toBe(10);
    expect(m.totals).toEqual({ tickets: 3, open: 1, resolved: 1, declined: 1, findings: 2, findingsAccepted: 1, scenarios: 3, accepted: 1, graduated: 0, claudeNeeded: 3 });
  });

  it('an unaccepted finding never graduates a scenario, however many clean occurrences follow', () => {
    const m = run({ tickets: [aTicket({ status: 'resolved' })], findings: [aFinding()], occurrences: Array.from({ length: 25 }, (_, i) => occ(i)) });
    expect(m.scenarios[0]).toMatchObject({ accepted: false, cleanSinceAcceptance: 0, graduated: false, remainingToGraduate: null, claudeNeeded: 1 });
    expect(m.totals.graduated).toBe(0);
  });

  it('acceptance plus 10 clean occurrences graduates; 9 leaves one to go', () => {
    const base = { tickets: [aTicket({ status: 'resolved' })], findings: [accepted()] };
    const nine = run({ ...base, occurrences: Array.from({ length: 9 }, (_, i) => occ(i)) });
    expect(nine.scenarios[0]).toMatchObject({ accepted: true, cleanSinceAcceptance: 9, remainingToGraduate: 1, graduated: false });
    const ten = run({ ...base, occurrences: Array.from({ length: 10 }, (_, i) => occ(i)) });
    expect(ten.scenarios[0]).toMatchObject({ accepted: true, cleanSinceAcceptance: 10, remainingToGraduate: null, graduated: true });
    expect(ten.totals).toMatchObject({ graduated: 1, accepted: 1 });
  });

  it('occurrences from before the acceptance do not count', () => {
    const m = run({ tickets: [aTicket({ status: 'resolved' })], findings: [accepted({ acceptedAt: 20_000 })], occurrences: Array.from({ length: 12 }, (_, i) => occ(i)) });
    expect(m.scenarios[0]).toMatchObject({ cleanSinceAcceptance: 0, graduated: false, remainingToGraduate: 10 });
  });

  it('a new ticket for the same situation takes the acceptance back and counts one more Claude visit', () => {
    const m = run({
      tickets: [aTicket({ status: 'resolved' }), aTicket({ id: 't2', createdAt: 12_000 })],
      findings: [accepted()],
      occurrences: Array.from({ length: 10 }, (_, i) => occ(i)),
    });
    expect(m.scenarios).toHaveLength(1);
    expect(m.scenarios[0]).toMatchObject({ claudeNeeded: 2, openTickets: 1, accepted: false, graduated: false, cleanSinceAcceptance: 0 });
  });

  it('ties a ticket of an unusable answer (kind unknown) to the real kind that later handled the situation', () => {
    const m = run({
      tickets: [aTicket({ kind: 'unknown', status: 'resolved' })],
      findings: [accepted()],
      occurrences: Array.from({ length: 10 }, (_, i) => occ(i, { kind: 'move' })),
    });
    expect(m.scenarios).toHaveLength(1);
    expect(m.scenarios[0]).toMatchObject({ kind: 'unknown', graduated: true });
  });

  it('shows the kind of the newest ticket for a situation', () => {
    const m = run({ tickets: [aTicket({ kind: 'unknown' }), aTicket({ id: 't2', kind: 'move', createdAt: 2000 })], findings: [], occurrences: [] });
    expect(m.scenarios[0]).toMatchObject({ kind: 'move', claudeNeeded: 2, openTickets: 2 });
  });

  it('shows the newest ticket’s kind whatever order the ledger lists them in', () => {
    const m = run({ tickets: [aTicket({ id: 't2', kind: 'move', createdAt: 2000 }), aTicket({ kind: 'unknown', createdAt: 1000 })], findings: [], occurrences: [] });
    expect(m.scenarios[0]).toMatchObject({ kind: 'move', claudeNeeded: 2 });
  });

  it('ignores occurrences of a situation that never had a ticket, and a finding with no ticket or not accepted by the owner', () => {
    const m = run({
      tickets: [aTicket()],
      findings: [accepted({ id: 'f9', ticketId: 'gone' }), { ...aFinding(), acceptedBy: 'owner' } as Finding],
      occurrences: [occ(1, { situationKey: 'exploration:elsewhere' }), occ(2, { sphere: 'world' })],
    });
    expect(m.scenarios).toHaveLength(1);
    expect(m.scenarios[0]).toMatchObject({ cleanSinceAcceptance: 0, accepted: false });
    expect(m.totals.findingsAccepted).toBe(2); // counted as findings, but only a dated acceptance of a known ticket moves a scenario
  });

  it('lists the scenarios that needed Claude most first, then by name', () => {
    const m = run({
      tickets: [
        aTicket({ id: 'a', situationKey: 'zeta' }),
        aTicket({ id: 'b', situationKey: 'alpha' }),
        aTicket({ id: 'c', situationKey: 'beta' }),
        aTicket({ id: 'd', situationKey: 'beta', createdAt: 1001 }),
      ],
      findings: [],
      occurrences: [],
    });
    expect(m.scenarios.map((s) => s.situationKey)).toEqual(['beta', 'alpha', 'zeta']);
  });

  it('lists at most 200 scenarios but counts every one', () => {
    const tickets = Array.from({ length: MAX_SCENARIOS_LISTED + 5 }, (_, i) => aTicket({ id: `t${i}`, situationKey: `s${i}` }));
    const m = run({ tickets, findings: [], occurrences: [] });
    expect(m.scenarios).toHaveLength(MAX_SCENARIOS_LISTED);
    expect(m.totals.scenarios).toBe(MAX_SCENARIOS_LISTED + 5);
  });

  it('is empty for an empty ledger', () => {
    const m = run({ tickets: [], findings: [], occurrences: [] });
    expect(m.scenarios).toEqual([]);
    expect(m.totals).toEqual({ tickets: 0, open: 0, resolved: 0, declined: 0, findings: 0, findingsAccepted: 0, scenarios: 0, accepted: 0, graduated: 0, claudeNeeded: 0 });
  });
});
