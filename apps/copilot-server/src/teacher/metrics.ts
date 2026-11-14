import {
  GRADUATION_CLEAN_OCCURRENCES,
  computeScenarioStates,
  type EscalationTicket,
  type Finding,
  type Scenario,
  type ScenarioEvent,
  type ScenarioOccurrence,
} from '@shatteredarchive/copilot-core';

export const MAX_SCENARIOS_LISTED = 200;

export interface ScenarioMetric {
  sphere: Scenario['sphere'];
  kind: Scenario['kind'];
  situationKey: string;
  /** How many tickets this situation has needed Claude for. */
  claudeNeeded: number;
  openTickets: number;
  /** The owner accepted a fix and no ticket has been opened since. */
  accepted: boolean;
  /** Times the agent handled it with no ticket since the acceptance. */
  cleanSinceAcceptance: number;
  /** Still needed to graduate; null when it is not accepted or already graduated. */
  remainingToGraduate: number | null;
  graduated: boolean;
}

export interface TrainingMetrics {
  generatedAt: number;
  graduationNeeds: number;
  totals: {
    tickets: number;
    open: number;
    resolved: number;
    declined: number;
    findings: number;
    findingsAccepted: number;
    scenarios: number;
    /** Scenarios that are accepted now (a fix the owner approved, not yet contradicted by a new ticket). */
    accepted: number;
    graduated: number;
    claudeNeeded: number;
  };
  /** Most Claude-needed first, then by name; at most MAX_SCENARIOS_LISTED. */
  scenarios: ScenarioMetric[];
}

const groupOf = (sphere: string, situationKey: string): string => `${sphere}|${situationKey}`;

/**
 * Counts from the ledger, nothing stored. A teaching scenario is a situation that has had a ticket, named by sphere and situation. The
 * kind shown is the newest ticket's: a ticket for an answer the model could not use has the kind `unknown`, while the suggestion that
 * later handles the same situation has a real kind, so the situation (not the kind) is what ties them together. An occurrence of a
 * situation that never had a ticket is not a teaching scenario and is not listed.
 */
export function computeTrainingMetrics(
  input: { tickets: readonly EscalationTicket[]; findings: readonly Finding[]; occurrences: readonly ScenarioOccurrence[] },
  now: number,
): TrainingMetrics {
  const newest = new Map<string, EscalationTicket>();
  for (const t of input.tickets) {
    const key = groupOf(t.sphere, t.situationKey);
    const seen = newest.get(key);
    if (seen === undefined || t.createdAt >= seen.createdAt) newest.set(key, t);
  }
  const scenarioOf = (sphere: string, situationKey: string): Scenario | undefined => {
    const t = newest.get(groupOf(sphere, situationKey));
    return t === undefined ? undefined : { sphere: t.sphere, kind: t.kind, situationKey: t.situationKey };
  };

  const events: ScenarioEvent[] = [];
  for (const t of input.tickets) events.push({ type: 'ticket', at: t.createdAt, scenario: scenarioOf(t.sphere, t.situationKey) as Scenario });
  const byId = new Map(input.tickets.map((t) => [t.id, t]));
  for (const f of input.findings) {
    const ticket = byId.get(f.ticketId);
    if (f.acceptedBy !== 'owner' || f.acceptedAt === undefined || ticket === undefined) continue;
    events.push({ type: 'accepted', at: f.acceptedAt, scenario: scenarioOf(ticket.sphere, ticket.situationKey) as Scenario });
  }
  for (const o of input.occurrences) {
    const scenario = scenarioOf(o.sphere, o.situationKey);
    if (scenario !== undefined) events.push({ type: 'occurrence', at: o.at, scenario });
  }

  const open = new Map<string, number>();
  for (const t of input.tickets) if (t.status === 'open') open.set(groupOf(t.sphere, t.situationKey), (open.get(groupOf(t.sphere, t.situationKey)) ?? 0) + 1);

  const metrics: ScenarioMetric[] = [...computeScenarioStates(events).values()].map((s) => ({
    sphere: s.scenario.sphere,
    kind: s.scenario.kind,
    situationKey: s.scenario.situationKey,
    claudeNeeded: s.claudeNeeded,
    openTickets: open.get(groupOf(s.scenario.sphere, s.scenario.situationKey)) ?? 0,
    accepted: s.accepted,
    cleanSinceAcceptance: s.cleanSinceAcceptance,
    remainingToGraduate: s.accepted && !s.graduated ? GRADUATION_CLEAN_OCCURRENCES - s.cleanSinceAcceptance : null,
    graduated: s.graduated,
  }));
  metrics.sort((a, b) => b.claudeNeeded - a.claudeNeeded || `${a.sphere}${a.situationKey}`.localeCompare(`${b.sphere}${b.situationKey}`));

  const count = (status: EscalationTicket['status']): number => input.tickets.filter((t) => t.status === status).length;
  return {
    generatedAt: now,
    graduationNeeds: GRADUATION_CLEAN_OCCURRENCES,
    totals: {
      tickets: input.tickets.length,
      open: count('open'),
      resolved: count('resolved'),
      declined: count('declined'),
      findings: input.findings.length,
      findingsAccepted: input.findings.filter((f) => f.acceptedBy === 'owner').length,
      scenarios: metrics.length,
      accepted: metrics.filter((m) => m.accepted).length,
      graduated: metrics.filter((m) => m.graduated).length,
      claudeNeeded: metrics.reduce((sum, m) => sum + m.claudeNeeded, 0),
    },
    scenarios: metrics.slice(0, MAX_SCENARIOS_LISTED),
  };
}
