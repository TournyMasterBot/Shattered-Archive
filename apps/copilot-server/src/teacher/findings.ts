import { MAX_RESOLUTION, validateFinding, type EscalationTicket, type Finding, type JsonlStore, type Lesson } from '@shatteredarchive/copilot-core';

export interface FindingDeps {
  findings: JsonlStore<Finding>;
  tickets: JsonlStore<EscalationTicket>;
  lessons: JsonlStore<Lesson>;
  /** Replaces registered names with codenames. A finding is free text written by a session that may have seen a name. */
  redact: (text: string) => string;
  now: () => number;
}

export type ImportResult =
  | { ok: true; id: string; written: boolean }
  | { ok: false; error: 'invalid'; details: string[] }
  | { ok: false; error: 'unknown-ticket' | 'ticket-not-open' | 'id-taken' | 'write-failed' };

export type AcceptResult =
  | { ok: true; written: boolean; lessonsChanged: number }
  | { ok: false; error: 'unknown-ticket' | 'no-finding' | 'write-failed' };

/** The verdicts that say whether the owner's correction was right; `persona` says nothing about a lesson. */
const LESSON_STATUS_FOR: Partial<Record<Finding['verdict'], Lesson['status']>> = {
  'local-wrong': 'accepted',
  'data-gap': 'accepted',
  'routing-gap': 'accepted',
  'local-correct': 'rejected',
};

/**
 * A teaching session's finding for a ticket. It must arrive unaccepted (only the owner accepts), for a ticket that is open, and its
 * text has its names replaced before it is stored. Storing it resolves the ticket; a retry of the same finding finishes a resolution
 * that failed halfway and otherwise changes nothing.
 */
export async function importFinding(deps: FindingDeps, input: unknown): Promise<ImportResult> {
  const checked = validateFinding(input);
  if (!checked.ok) return { ok: false, error: 'invalid', details: checked.errors };
  const incoming = checked.value;
  if (incoming.acceptedBy !== null) return { ok: false, error: 'invalid', details: ['a finding cannot arrive accepted: only the owner accepts it'] };

  const ticket = deps.tickets.get(incoming.ticketId);
  if (ticket === undefined) return { ok: false, error: 'unknown-ticket' };

  const existing = deps.findings.get(incoming.id);
  if (existing !== undefined && existing.ticketId !== incoming.ticketId) return { ok: false, error: 'id-taken' };
  if (existing === undefined && ticket.status !== 'open') return { ok: false, error: 'ticket-not-open' };

  // a stored finding is never replaced by a later copy of itself (it may be accepted by now)
  let written = false;
  if (existing === undefined) {
    const stored: Finding = { ...incoming, why: deps.redact(incoming.why).trim().slice(0, MAX_RESOLUTION) };
    const saved = await deps.findings.append(stored);
    if (!saved.ok) return { ok: false, error: 'write-failed' };
    written = saved.written;
  }

  if (ticket.status === 'open') {
    const resolved = await deps.tickets.append({ ...ticket, status: 'resolved', resolution: `Finding ${incoming.id}: ${incoming.verdict}` });
    if (!resolved.ok) return { ok: false, error: 'write-failed' };
  }
  return { ok: true, id: incoming.id, written };
}

/**
 * The owner accepts the finding for a ticket. This is the only thing that lets the ticket's scenario graduate, and it settles the
 * lessons the agent proposed for the same situation (accepted when the owner's correction was right, rejected when the agent was).
 * The lessons are settled first and the acceptance last, so a retry after a failure finishes the job.
 */
export async function acceptTicket(deps: FindingDeps, ticketId: string): Promise<AcceptResult> {
  const ticket = deps.tickets.get(ticketId);
  if (ticket === undefined) return { ok: false, error: 'unknown-ticket' };
  const finding = deps.findings.query((f) => f.ticketId === ticketId)[0];
  if (finding === undefined) return { ok: false, error: 'no-finding' };
  if (finding.acceptedBy !== null) return { ok: true, written: false, lessonsChanged: 0 };

  let lessonsChanged = 0;
  const status = LESSON_STATUS_FOR[finding.verdict];
  if (status !== undefined) {
    const proposed = deps.lessons.query((l) => l.status === 'proposed' && l.sphere === ticket.sphere && l.situationKey === ticket.situationKey);
    for (const lesson of proposed) {
      const saved = await deps.lessons.append({ ...lesson, status });
      if (!saved.ok) return { ok: false, error: 'write-failed' };
      lessonsChanged += 1;
    }
  }

  const saved = await deps.findings.append({ ...finding, acceptedBy: 'owner', acceptedAt: deps.now() });
  if (!saved.ok) return { ok: false, error: 'write-failed' };
  return { ok: true, written: true, lessonsChanged };
}
